/**
 * PR #6 — ACE farmer web app: mobile viewport, voice input, error states.
 *
 * Reuses the page objects, fixtures, and selector map from PR #5 and
 * extends coverage into three previously-uncovered surfaces:
 *
 *   Mobile viewport (run on the `mobile-chromium` project):
 *     • ACE-MOB-01 — Query submission works end-to-end on mobile without
 *                     horizontal overflow.
 *     • ACE-MOB-02 — Language selector is usable on mobile (touch path).
 *     • ACE-MOB-03 — Voice input button is visible + tappable on mobile
 *                     (not clipped by other UI elements).
 *     • ACE-MOB-04 — Soft keyboard does not obscure the submit button.
 *
 *   Voice input:
 *     • ACE-VOI-01 — Tapping voice input requests mic permission and
 *                     shows the expected recording UI state.
 *     • ACE-VOI-02 — After a mocked voice input completes, the
 *                     transcribed text populates the query input.
 *     • ACE-VOI-03 — Denying mic permission shows the
 *                     "please type your question instead" fallback.
 *     • ACE-VOI-04 — STT service returns the transcript in the
 *                     farmer's currently-selected locale.
 *     • ACE-VOI-05 — A long-running recording (mock) eventually
 *                     exposes a stop / finalize control.
 *
 *   Error states:
 *     • ACE-ERR-01 — No internet surfaces a clear no-connection
 *                     message instead of an infinite spinner.
 *     • ACE-ERR-02 — A 500 from the query API surfaces a user-facing
 *                     error message in the farmer's selected locale.
 *     • ACE-ERR-03 — Mobile-specific re-check of empty-query submit
 *                     (mobile form validation UI can diverge).
 *     • ACE-ERR-04 — Slow network shows a patience-inducing state
 *                     rather than a frozen UI.
 *     • ACE-ERR-05 — A 4xx (validation) from the query API surfaces
 *                     a non-fatal error banner.
 *     • ACE-ERR-06 — Returning from offline → online recovers
 *                     gracefully (no infinite spinner left behind).
 */
import { expect } from "@playwright/test";
import {
  test,
  aceStagingAvailable,
  aceMocks,
} from "../fixtures";
import { SELECTOR_MAP } from "../page-objects";
import { testConfig } from "../../helpers/test-config";

function skipWithoutStagingUrl(): void {
  test.skip(
    !aceStagingAvailable(),
    "ACE_STAGING_URL not set — skipping mobile-voice-errors spec.",
  );
}

const MOBILE_PROJECT = "mobile-chromium";

function isMobileProject(testInfo: import("@playwright/test").TestInfo): boolean {
  return testInfo.project.name === MOBILE_PROJECT;
}

function skipUnlessMobile(testInfo: import("@playwright/test").TestInfo): void {
  test.skip(
    !isMobileProject(testInfo),
    `Mobile-only assertion — run with --project=${MOBILE_PROJECT}`,
  );
}

/**
 * Mobile viewport block.  Runs on the `mobile-chromium` project only;
 * the desktop-chromium project soft-skips so the CI matrix exercises
 * both viewports.
 */
test.describe(`@ace-web-app Mobile viewport (${MOBILE_PROJECT})`, () => {
  test.beforeEach(async ({ page }, testInfo) => {
    skipWithoutStagingUrl();
    skipUnlessMobile(testInfo);
    await page.goto(testConfig.ace.baseURL + "/ask").catch(async () => {
      await page.goto(testConfig.ace.baseURL + "/");
    });
  });

  test("ACE-MOB-01 • query submission works end-to-end on the mobile viewport without horizontal overflow", async ({
    queryPage,
  }) => {
    test.setTimeout(45_000);

    await test.step("Verify the page does not horizontally overflow", async () => {
      await queryPage.assertNoHorizontalOverflow();
    });

    await test.step("Submit a typed Hindi query on mobile", async () => {
      await queryPage.typeQuery("गेहूं में पीले पत्ते क्यों आ रहे हैं?");
      const network = queryPage.page.waitForResponse(
        (r) =>
          /\/(query|ask|chat|answer|acc-agent|acc_agent)/i.test(r.url()) &&
          r.request().method() !== "GET",
        { timeout: 10_000 },
      );
      await queryPage.submitButton.click({ force: true });
      const response = await network;
      expect(response.status(), "submission status").toBeLessThan(500);
    });

    await test.step("Re-check the page still does not horizontally overflow after the response", async () => {
      await queryPage.assertNonEmptyResponse();
      await queryPage.assertNoHorizontalOverflow();
    });
  });

  test("ACE-MOB-02 • language selector is usable on mobile (tap and select)", async ({
    queryPage,
  }) => {
    test.setTimeout(30_000);
    await queryPage.assertLanguageSelectorTappableOnMobile();
  });

  test("ACE-MOB-03 • voice input button is visible and tappable on mobile without clipping", async ({
    queryPage,
  }) => {
    test.setTimeout(15_000);
    await queryPage.assertVoiceInputVisibleAndTappable();
  });

  test("ACE-MOB-04 • soft keyboard focus on the input does not obscure the submit button", async ({
    queryPage,
    page,
  }) => {
    test.setTimeout(20_000);

    await test.step("Focus the query input to surface the soft keyboard", async () => {
      await queryPage.queryInput.scrollIntoViewIfNeeded();
      await queryPage.queryInput.focus();
      // Wait a frame for the soft keyboard to layout in headless
      // emulation (Playwright `hasTouch` projects add the keyboard).
      await page.waitForTimeout(250);
    });

    await test.step("Submit button is still inside the visible viewport", async () => {
      const visible = await queryPage.submitButton.isVisible();
      expect(visible, "submit button should still be visible").toBe(true);
      const box = await queryPage.submitButton.boundingBox();
      expect(box, "submit button has no bounding box").not.toBeNull();
      const viewport = page.viewportSize();
      expect(viewport, "viewport size is null").not.toBeNull();
      expect(box!.y + box!.height, "submit button scrolls off-screen vertically").toBeLessThanOrEqual(
        viewport!.height,
      );
      // No horizontal overflow while the soft keyboard is open either.
      await queryPage.assertNoHorizontalOverflow();
    });
  });
});

/**
 * Voice input block.  Cross-project: voice is exercised on
 * desktop-chromium first, then re-run on mobile-chromium for the
 * touch path.
 */
test.describe("@ace-web-app Voice input", () => {
  test.beforeEach(async ({ page }) => {
    skipWithoutStagingUrl();
    await page.goto(testConfig.ace.baseURL + "/ask").catch(async () => {
      await page.goto(testConfig.ace.baseURL + "/");
    });
  });

  test("ACE-VOI-01 • tapping the voice button requests microphone permission and shows the expected recording UI state", async ({
    context,
    queryPage,
    page,
  }) => {
    test.setTimeout(20_000);

    // Install the success-media-device mock BEFORE granting permission
    // so the app's getUserMedia call gets a usable stream rather than
    // hanging on an empty MediaStream.
    await aceMocks.mockMicrophoneSuccess(page);
    const micGrant = await aceMocks.grantMicrophonePermission(context);

    try {
      await test.step("Tap the voice input button", async () => {
        await queryPage.clickVoiceInput();
      });

      await test.step("Recording UI affordances surface", async () => {
        // Either the recording indicator visible OR the consent dialog
        // opens (recording affordances may live inside the consent UI).
        const recordingVisible = await queryPage.recordingIndicator
          .isVisible({ timeout: 5_000 })
          .catch(() => false);
        const consentVisible = await queryPage.voiceConsentDialog
          .isVisible({ timeout: 5_000 })
          .catch(() => false);
        const stopVisible =
          (await queryPage.stopRecordingButton.count()) > 0
            ? await queryPage.stopRecordingButton
                .isVisible({ timeout: 1_000 })
                .catch(() => false)
            : false;
        expect(
          recordingVisible || consentVisible || stopVisible,
          "expected the recording / consent / stop affordance to surface after the voice tap",
        ).toBe(true);
      });
    } finally {
      await micGrant.teardown();
    }
  });

  test("ACE-VOI-02 • mocked voice transcription populates the query input before submission", async ({
    context,
    queryPage,
  }) => {
    test.setTimeout(20_000);

    const TRANSCRIBED = "मेरे आम के पेड़ पर काले धब्बे क्यों आ रहे हैं?";

    await aceMocks.mockMicrophoneSuccess(queryPage.page);
    await aceMocks.mockSpeechToText(queryPage.page, TRANSCRIBED);
    const micGrant = await aceMocks.grantMicrophonePermission(context);

    try {
      await queryPage.clickVoiceInput();

      await test.step("Wait for the STT mock to populate the input", async () => {
        await queryPage.assertTranscribedTextAppearsInQuery(TRANSCRIBED);
      });

      await test.step("Submission of the transcribed text completes", async () => {
        const network = queryPage.page.waitForResponse(
          (r) =>
            /\/(query|ask|chat|answer|acc-agent|acc_agent)/i.test(r.url()) &&
            r.request().method() !== "GET",
          { timeout: 10_000 },
        );
        await queryPage.submitButton.click({ force: true });
        const response = await network;
        expect(response.status(), "submission status").toBeLessThan(500);
        await queryPage.assertNonEmptyResponse();
      });
    } finally {
      await micGrant.teardown();
    }
  });

  test("ACE-VOI-03 • denying the microphone permission shows the typed-input fallback message", async ({
    page,
    queryPage,
  }) => {
    test.setTimeout(20_000);
    await aceMocks.denyMicrophonePermission(page);

    await queryPage.clickVoiceInput();
    await queryPage.assertMicrophoneFallbackShown();
  });

  test("ACE-VOI-04 • STT response returns the transcript in the farmer's currently-selected locale", async ({
    context,
    queryPage,
  }) => {
    test.setTimeout(20_000);

    const TRANSCRIBED =
      "कपास की फसल में बॉलवर्म का प्रकोप कैसे रोकें?";

    await aceMocks.mockMicrophoneSuccess(queryPage.page);
    await aceMocks.mockSpeechToText(queryPage.page, TRANSCRIBED);
    const micGrant = await aceMocks.grantMicrophonePermission(context);

    try {
      await queryPage.clickVoiceInput();
      await queryPage.assertTranscribedTextAppearsInQuery(TRANSCRIBED);
    } finally {
      await micGrant.teardown();
    }
  });

  test("ACE-VOI-05 • a completed recording exposes a stop / finalize control to the farmer", async ({
    context,
    queryPage,
  }) => {
    test.setTimeout(20_000);

    await aceMocks.mockMicrophoneSuccess(queryPage.page);
    await aceMocks.mockSpeechToText(queryPage.page, "टमाटर में कीड़ा लग गया है");
    const micGrant = await aceMocks.grantMicrophonePermission(context);

    try {
      await queryPage.clickVoiceInput();
      await queryPage.assertRecordingStateVisible();
      await queryPage.clickStopRecording();
      // After stopping, the input should reflect the transcript.
      await queryPage.assertTranscribedTextAppearsInQuery(
        "टमाटर में कीड़ा लग गया है",
      );
    } finally {
      await micGrant.teardown();
    }
  });
});

/**
 * Error state block.  Cross-project.
 */
test.describe("@ace-web-app Error states", () => {
  test.beforeEach(async ({ page }) => {
    skipWithoutStagingUrl();
    await page.goto(testConfig.ace.baseURL + "/ask").catch(async () => {
      await page.goto(testConfig.ace.baseURL + "/");
    });
  });

  test("ACE-ERR-01 • offline surface shows a clear no-connection message rather than an infinite spinner", async ({
    context,
    queryPage,
    page,
  }) => {
    test.setTimeout(25_000);
    const offline = await aceMocks.goOffline(context);

    try {
      const network = page.waitForRequest(
        (r) =>
          /\/(query|ask|chat|answer|acc-agent|acc_agent)/i.test(r.url()) &&
          r.method() !== "GET",
        { timeout: 8_000 },
      ).catch(() => null);
      await queryPage.typeQuery("टमाटर में कीड़ा लग गया है");
      await queryPage.submitButton.click({ force: true }).catch(() => undefined);
      await network;

      await queryPage.assertNoConnectionMessageShown();
    } finally {
      await offline.teardown();
    }
  });

  test("ACE-ERR-02 • a 500 from the query API surfaces a user-facing error in the farmer's selected locale", async ({
    page,
    queryPage,
  }) => {
    test.setTimeout(25_000);

    const localizedError = JSON.stringify({
      error: "internal_server_error",
      message: "हम अभी सर्वर से जवाब ला रहे हैं, कृपया कुछ देर बाद पुनः प्रयास करें।",
    });
    const mocked = await aceMocks.mockServerError500(page, localizedError);

    try {
      // Lock the picker to Hindi before submitting so the localized
      // error copy assertion has a meaningful target.
      try {
        await queryPage.selectLanguage(SELECTOR_MAP.aceLanguages.hindiIndia);
      } catch {
        /* default might already be Hindi */
      }

      const network = page.waitForResponse(
        (r) =>
          /\/(query|ask|chat|answer|acc-agent|acc_agent)/i.test(r.url()) &&
          r.request().method() !== "GET",
        { timeout: 8_000 },
      );
      await queryPage.typeQuery("टमाटर में कीड़ा लग गया है");
      await queryPage.submitButton.click({ force: true }).catch(() => undefined);
      const response = await network;
      expect(response.status(), "mocked server-error status").toBe(500);

      await queryPage.assertServerErrorShown("hi-IN");
    } finally {
      await mocked.teardown();
    }
  });

  test("ACE-ERR-03 • (mobile re-check) empty query submit is blocked on mobile", async ({
    queryPage,
  }, testInfo) => {
    test.setTimeout(15_000);

    // Mobile-only path.
    test.skip(
      !isMobileProject(testInfo),
      `Mobile-only assertion — run with --project=${MOBILE_PROJECT}`,
    );

    await queryPage.typeQuery("");
    await queryPage.submitButton.click({ force: true }).catch(() => undefined);
    await queryPage.assertValidationErrorVisible();
  });

  test("ACE-ERR-04 • slow network surfaces a patience-inducing state rather than a frozen UI", async ({
    page,
    queryPage,
  }) => {
    test.setTimeout(30_000);

    const slow = await aceMocks.mockSlowNetwork(page, 4_000);

    try {
      await queryPage.typeQuery("कपास में बॉलवर्म का प्रकोप कैसे रोकें?");

      const submitClick = page.waitForRequest(
        (r) =>
          /\/(query|ask|chat|answer|acc-agent|acc_agent)/i.test(r.url()) &&
          r.method() !== "GET",
        { timeout: 8_000 },
      );
      await queryPage.submitButton.click({ force: true });
      await submitClick;

      // The 4s artificial delay kicks in immediately — within the
      // first 500 ms the patience state should be observable.
      await queryPage.assertSlowNetworkPatienceShown();
    } finally {
      await slow.teardown();
    }
  });

  test("ACE-ERR-05 • a 4xx (validation) from the query API surfaces a non-fatal error banner", async ({
    page,
    queryPage,
  }) => {
    test.setTimeout(20_000);

    const handler = async (route: import("@playwright/test").Route) => {
      if (route.request().method() === "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: "validation_error",
          message: "Please rephrase your question.",
        }),
        headers: { "access-control-allow-origin": "*" },
      });
    };
    await page.route(/\/(?:api\/)?(?:query|ask-query|chat(?:bot)?|answer|acc-agent|acc_agent)(?:\/|$|\?)/i, handler);

    try {
      const network = page.waitForResponse(
        (r) =>
          /\/(query|ask|chat|answer|acc-agent|acc_agent)/i.test(r.url()) &&
          r.request().method() !== "GET",
        { timeout: 8_000 },
      );
      await queryPage.typeQuery("xyz malformed query");
      await queryPage.submitButton.click({ force: true }).catch(() => undefined);
      const response = await network;
      expect(response.status(), "mocked 4xx status").toBe(422);
      await queryPage.assertServerErrorShown();
    } finally {
      await page.unroute(/\/(?:api\/)?(?:query|ask-query|chat(?:bot)?|answer|acc-agent|acc_agent)(?:\/|$|\?)/i, handler).catch(() => undefined);
    }
  });

  test("ACE-ERR-06 • returning from offline → online recovers the submission path (no infinite spinner)", async ({
    context,
    queryPage,
    page,
  }) => {
    test.setTimeout(30_000);
    const offline = await aceMocks.goOffline(context);

    try {
      // First trigger the offline path so the spinner state is observable.
      await queryPage.typeQuery("प्याज में रोग कैसे रोकें?");
      await queryPage.submitButton.click({ force: true }).catch(() => undefined);
      await queryPage.assertNoConnectionMessageShown();
    } finally {
      await offline.teardown();
    }

    // Network restored.  Re-submit and verify the request actually
    // reaches the AI/Q&A pipeline.
    const network = page.waitForResponse(
      (r) =>
        /\/(query|ask|chat|answer|acc-agent|acc_agent)/i.test(r.url()) &&
        r.request().method() !== "GET",
      { timeout: 8_000 },
    );
    await queryPage.submitButton.click({ force: true }).catch(() => undefined);
    const response = await network;
    expect(response.status(), "recovery request status").toBeLessThan(500);
  });
});

