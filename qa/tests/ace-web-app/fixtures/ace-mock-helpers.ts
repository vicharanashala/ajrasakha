/**
 * Mock + permission helpers for the ACE farmer web app tests.
 *
 * Centralises Playwright's `page.route` / `context.setOffline` /
 * `grantPermissions` API so spec files can stay action-focused.
 *
 *   import { aceMocks } from "../fixtures";
 *
 *   await aceMocks.mockServerError500(page);
 *   await aceMocks.mockSpeechToText(page, "टमाटर में कीड़ा लग गया है");
 *   await aceMocks.grantMicrophonePermission(context);
 *   await aceMocks.goOffline(context);
 *
 * Every helper returns a teardown function (`() => Promise<void>`)
 * so a test can scope the mock to a single `test.step` and roll
 * back the network / permission state when the step exits.  This
 * keeps cross-test contamination out of the parallel CI run.
 */
import type {
  BrowserContext,
  CDPSession,
  Page,
  Route,
} from "@playwright/test";

/**
 * URL substrings the AI/Q&A API matches against.  Mirrors the regex
 * used in QueryPage.submitAndWaitForResponse so the two stay in sync.
 */
const QUERY_API_REGEX =
  /\/(?:api\/)?(?:query|ask-query|chat(?:bot)?|answer|acc-agent|acc_agent)(?:\/|$|\?)/i;
const STT_API_REGEX =
  /\/(?:api\/)?(?:stt|speech-to-text)(?:\/|$|\?)/i;

export interface MockTeardown {
  /** Restore the underlying network state when the test exits the step. */
  teardown: () => Promise<void>;
}

export class AceMocks {
  /**
   * Mock every AI/Q&A route to return 500.  Useful for the
   * "server-error-surfaces-error-banner" test (ACE-ERR-02).
   *
   * Use the returned `teardown` to clear the route after the step.
   */
  async mockServerError500(
    page: Page,
    body: string = JSON.stringify({
      error: "internal_server_error",
      message: "Upstream LLM temporarily unavailable",
    }),
  ): Promise<MockTeardown> {
    const handler = async (route: Route): Promise<void> => {
      // Never intercept the SPA document route (for example `/ask`).
      // Only query-submission requests belong to this mock.
      if (route.request().method() === "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body,
        headers: { "access-control-allow-origin": "*" },
      });
    };
    await page.route(QUERY_API_REGEX, handler);
    return {
      teardown: async () => {
        await page.unroute(QUERY_API_REGEX, handler).catch(() => undefined);
      },
    };
  }

  /**
   * Add an artificial latency to every AI/Q&A route to exercise the
   * "slow network → loading state visible" test (ACE-ERR-04).
   */
  async mockSlowNetwork(
    page: Page,
    delayMs: number = 4_000,
  ): Promise<MockTeardown> {
    const handler = async (route: Route): Promise<void> => {
      if (route.request().method() === "GET") {
        await route.continue();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await route.continue();
    };
    await page.route(QUERY_API_REGEX, handler);
    return {
      teardown: async () => {
        await page.unroute(QUERY_API_REGEX, handler).catch(() => undefined);
      },
    };
  }

  /**
   * Mock the speech-to-text endpoint to return `transcribed` text.
   * The page object then asserts the transcribed text populates the
   * query input field after the (mocked) voice input completes.
   */
  async mockSpeechToText(
    page: Page,
    transcribed: string,
    language: string = "hi-IN",
  ): Promise<MockTeardown> {
    const body = JSON.stringify({
      transcript: transcribed,
      text: transcribed,
      transcription: transcribed,
      language,
      confidence: 0.97,
      data: { transcript: transcribed, text: transcribed },
    });
    const handler = async (route: Route): Promise<void> => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body,
        headers: { "access-control-allow-origin": "*" },
      });
    };
    await page.route(STT_API_REGEX, handler);
    return {
      teardown: async () => {
        await page.unroute(STT_API_REGEX, handler).catch(() => undefined);
      },
    };
  }

  /**
   * Grant the microphone permission on the browser context.  Headless
   * Chromium can't actually capture audio but granting the permission
   * skips the OS-level prompt so the page object's recording UI
   * contract can be exercised.
   */
  async grantMicrophonePermission(
    context: BrowserContext,
    options: { origin?: string } = {},
  ): Promise<MockTeardown> {
    await context.grantPermissions(["microphone"], options);
    return {
      teardown: async () => {
        await context.clearPermissions().catch(() => undefined);
      },
    };
  }

  /**
   * Simulate a denied microphone permission.  We can't *un-grant* a
   * granted permission through the API but we can override
   * `navigator.mediaDevices.getUserMedia` to reject so the page
   * surfaces the deny-path UI even if a prior step granted the
   * permission.
   */
  async denyMicrophonePermission(page: Page): Promise<MockTeardown> {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: () =>
            Promise.reject(
              new DOMException("Microphone permission denied", "NotAllowedError"),
            ),
        },
      });
    });
    return {
      teardown: async () => {
        // addInitScript registrations live for the page's lifetime;
        // closing/reloading the page clears them.  No-op teardown here.
      },
    };
  }

  /**
   * Install a deterministic microphone + MediaRecorder mock before
   * navigating to the query page.  The app still executes its real
   * recording control flow; only the hardware boundary is faked.
   */
  async mockMicrophoneSuccess(page: Page): Promise<MockTeardown> {
    await page.addInitScript(() => {
      const stream = new MediaStream();
      let getUserMediaCalls = 0;
      Object.defineProperty(window, "__aceGetUserMediaCalls", {
        configurable: true,
        get: () => getUserMediaCalls,
      });
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            getUserMediaCalls += 1;
            return stream;
          },
        },
      });

      class MockMediaRecorder extends EventTarget {
        state: RecordingState = "inactive";
        mimeType = "audio/webm";
        stream: MediaStream;
        ondataavailable: ((event: BlobEvent) => void) | null = null;
        onstart: ((event: Event) => void) | null = null;
        onstop: ((event: Event) => void) | null = null;

        constructor(input: MediaStream) {
          super();
          this.stream = input;
        }

        start(): void {
          this.state = "recording";
          const event = new Event("start");
          this.dispatchEvent(event);
          this.onstart?.(event);
        }

        stop(): void {
          this.state = "inactive";
          const dataEvent = new BlobEvent("dataavailable", {
            data: new Blob(["mock-audio"], { type: "audio/webm" }),
          });
          this.dispatchEvent(dataEvent);
          this.ondataavailable?.(dataEvent);
          const stopEvent = new Event("stop");
          this.dispatchEvent(stopEvent);
          this.onstop?.(stopEvent);
        }

        pause(): void {
          this.state = "paused";
        }

        resume(): void {
          this.state = "recording";
        }

        requestData(): void {
          const event = new BlobEvent("dataavailable", {
            data: new Blob(["mock-audio"], { type: "audio/webm" }),
          });
          this.dispatchEvent(event);
          this.ondataavailable?.(event);
        }

        static isTypeSupported(): boolean {
          return true;
        }
      }

      Object.defineProperty(window, "MediaRecorder", {
        configurable: true,
        value: MockMediaRecorder,
      });
    });
    return { teardown: async () => undefined };
  }

  /** Read how many times the app requested `getUserMedia`. */
  async getUserMediaCallCount(page: Page): Promise<number> {
    return page.evaluate(() => {
      const count = (window as typeof window & { __aceGetUserMediaCalls?: number })
        .__aceGetUserMediaCalls;
      return count ?? 0;
    });
  }

  /**
   * Take the entire browser context offline.  Used by ACE-ERR-01
   * ("no internet → no-connection error rather than infinite spinner").
   */
  async goOffline(context: BrowserContext): Promise<MockTeardown> {
    await context.setOffline(true);
    return {
      teardown: async () => {
        await context.setOffline(false).catch(() => undefined);
      },
    };
  }

  /**
   * Apply CPU + network throttling via a CDP session so the page
   * exercises the same render-time shivers a farmer with a low-spec
   * Android phone sees.  Caller scopes the session to the test.
   */
  async throttleAsLowEnd(page: Page): Promise<{ session: CDPSession; teardown: () => Promise<void> }> {
    const session = await page.context().newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 400,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
    });
    return {
      session,
      teardown: async () => {
        await session.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => undefined);
        await session.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 0,
          downloadThroughput: -1,
          uploadThroughput: -1,
        }).catch(() => undefined);
        await session.detach().catch(() => undefined);
      },
    };
  }
}

export const aceMocks = new AceMocks();
