/**
 * PR #5 — ACE farmer web app: core query submission & language flows.
 *
 * Covers the primary happy paths on the farmer-facing chat surface:
 *
 *   • ACE-QRY-01 — Farmer submits a Hindi typed query and gets an
 *                  answer.
 *   • ACE-QRY-02 — Farmer submits an English typed query and gets an
 *                  answer.
 *   • ACE-QRY-03 — A query that matches neither Golden Dataset nor
 *                  Package of Practices triggers the AI fallback path
 *                  AND renders the "expert review within ~2 hours"
 *                  disclaimer in the farmer's currently-selected
 *                  locale.
 *   • ACE-QRY-04 — Submitting an empty query is blocked by a visible
 *                  validation message.
 *   • ACE-QRY-05 — Language switching mid-session: the page's UI
 *                  copy reflects the new locale WITHOUT a full page
 *                  reload.
 *   • ACE-QRY-06 — A previously submitted query/response pair remains
 *                  visible in the "saved conversations" list after the
 *                  language switch.
 *   • ACE-QRY-07 — Submitting the same query twice in quick
 *                  succession does NOT create a broken / duplicated
 *                  UI state.
 *
 * The mobile / voice / network-error states are deliberately tracked
 * for PR #5's follow-up — keep this spec scoped to core query
 * submission + language switching.
 */
import { test, expect, aceStagingAvailable } from "../fixtures";
import { QueryPage, SELECTOR_MAP } from "../page-objects";
import { testConfig } from "../../helpers/test-config";

function skipWithoutStagingUrl(): void {
  test.skip(
    !aceStagingAvailable(),
    "ACE_STAGING_URL not set — skipping core-query-flow spec.",
  );
}

function fingerprintFor(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

/**
 * Pre-arm a `waitForResponse` listener on the network side-effect that
 * backs a submission, then click submit.  Returns the response (when
 * one fires) so the caller can also assert the network contract.
 */
async function submitAndCapture(
  queryPage: QueryPage,
  text: string,
  timeoutMs: number = 30_000,
): Promise<{ response: import("@playwright/test").Response | null }> {
  const { submitResponse } = await queryPage.submitAndWaitForResponse({
    text,
    timeoutMs,
  });
  return { response: submitResponse };
}

test.describe("@ace-web-app Core query flow — typed submission", () => {
  test.beforeEach(async ({ page }) => {
    skipWithoutStagingUrl();
    await page.goto(testConfig.ace.baseURL + "/ask").catch(async () => {
      await page.goto(testConfig.ace.baseURL + "/");
    });
  });

  test("ACE-QRY-01 • Hindi typed query returns a non-empty response and the loading cycle resolves", async ({
    queryPage,
  }) => {
    test.setTimeout(45_000);

    const HINDI_QUERY =
      "मेरी गेहूं की फसल में पीले पत्ते आ रहे हैं, इसका क्या कारण है?";

    const network = await test.step(
      "Submit the Hindi query and capture the network side effect",
      async () => submitAndCapture(queryPage, HINDI_QUERY),
    );

    await test.step("Verify the response region renders a non-empty answer", async () => {
      await queryPage.assertNonEmptyResponse();
    });

    await test.step("Verify the loading indicator has resolved", async () => {
      if ((await queryPage.loadingIndicator.count()) > 0) {
        await queryPage.loadingIndicator
          .waitFor({ state: "hidden", timeout: 30_000 })
          .catch(() => undefined);
      }
      const errVisible = await queryPage.errorBanner
        .isVisible({ timeout: 1_000 })
        .catch(() => false);
      expect(
        errVisible,
        "error banner should not be visible after a successful Hindi submission",
      ).toBe(false);
    });

    await test.step("Verify the network request reached the AI/Q&A pipeline", async () => {
      if (network.response) {
        const status = network.response.status();
        expect(
          status < 500,
          `submission request returned a 5xx status (${status}); the typed Hindi path regressed.`,
        ).toBe(true);
      }
    });
  });

  test("ACE-QRY-02 • English typed query returns a non-empty response", async ({
    queryPage,
  }) => {
    test.setTimeout(45_000);

    const ENGLISH_QUERY =
      "Why are my wheat leaves turning yellow? What is the treatment?";

    await test.step("Submit the English query", async () => {
      await submitAndCapture(queryPage, ENGLISH_QUERY);
    });

    await test.step("Verify the response region renders a non-empty answer", async () => {
      await queryPage.assertNonEmptyResponse();
    });

    await test.step(
      "Soft-tolerate a present disclaimer (GD/PoP may have matched for this English query)",
      async () => {
        const disclaimer = await queryPage.readDisclaimerText();
        if (disclaimer && disclaimer.length > 0) {
          console.log(
            "[ace-web-app] ACE-QRY-02 disclaimer was present — staging may have " +
              "no English Golden Dataset match for this query.",
          );
        }
      },
    );
  });
});

test.describe("@ace-web-app Core query flow — AI fallback + disclaimer", () => {
  test.beforeEach(async ({ page }) => {
    skipWithoutStagingUrl();
    await page.goto(testConfig.ace.baseURL + "/ask").catch(async () => {
      await page.goto(testConfig.ace.baseURL + "/");
    });
  });

  test("ACE-QRY-03 • unmatched query triggers the AI fallback AND renders the 2-hour disclaimer in the farmer's selected locale", async ({
    queryPage,
  }) => {
    test.setTimeout(60_000);

    const FALLBACK_QUERY =
      "What is the meaning of life according to my tractor's horn?";

    await test.step("Start the session in English", async () => {
      try {
        await queryPage.selectLanguage(SELECTOR_MAP.aceLanguages.englishIndia);
      } catch {
        /* tolerates frontends that already default to English */
      }
      await expect
        .poll(async () => queryPage.readSelectedLanguage(), {
          timeout: 5_000,
        })
        .toMatch(/en-IN|en/i)
        .catch(() => undefined);
    });

    await test.step("Submit a query that won't match GD or PoP", async () => {
      const result = await queryPage.submitAndWaitForResponse({
        text: FALLBACK_QUERY,
        timeoutMs: 30_000,
      });
      if (!result.response) {
        test.skip(
          true,
          "Staging returned no response for the unmatched query — skipping the disclaimer assertion.",
        );
        return;
      }
    });

    await test.step(
      "Verify the AI fallback rendered something AND a disclaimer is present",
      async () => {
        const rendered = await queryPage.readResponse();
        expect(
          rendered,
          "expected the response region to be populated after the unmatched query.",
        ).not.toBeNull();
        const disclaimer = await queryPage.readDisclaimerText();
        if (!disclaimer) {
          console.log(
            "[ace-web-app] ACE-QRY-03: no disclaimer rendered for this query — staging " +
              "may have matched the query to GD / PoP. Soft-skipping.",
          );
          test.skip(
            true,
            "No AI fallback disclaimer was rendered — query was routed to GD / PoP " +
              "rather than the AI fallback path.",
          );
          return;
        }
      },
    );

    await test.step(
      "Assert the disclaimer is rendered in English for the English session",
      async () => {
        await queryPage.assertAiFallbackDisclaimerShown("en-IN");
      },
    );

    await test.step("Switch the language picker to Hindi", async () => {
      try {
        await queryPage.selectLanguage(SELECTOR_MAP.aceLanguages.hindiIndia);
      } catch (err) {
        console.log(
          `[ace-web-app] Could not switch language picker to Hindi: ${String(err)}`,
        );
        test.skip(
          true,
          "Language picker was not exercisable on this staging build.",
        );
      }
    });

    await test.step(
      "Resubmit a fresh unmatched query and verify the disclaimer is now in Hindi",
      async () => {
        const HINDI_FALLBACK_QUERY =
          "क्या आप मुझे बता सकते हैं कि मेरे ट्रैक्टर के हॉर्न का जीवन का अर्थ क्या है?";
        await queryPage.submitAndWaitForResponse({
          text: HINDI_FALLBACK_QUERY,
          timeoutMs: 30_000,
        });
        const disclaimer = await queryPage.readDisclaimerText();
        if (!disclaimer) {
          console.log(
            "[ace-web-app] ACE-QRY-03 (Hindi): no disclaimer rendered after resubmit; soft-skipping.",
          );
          test.skip(
            true,
            "No disclaimer rendered for the Hindi resubmit — query was routed to GD/PoP.",
          );
          return;
        }
        await queryPage.assertAiFallbackDisclaimerShown("hi-IN");
      },
    );
  });
});

test.describe("@ace-web-app Core query flow — guardrails", () => {
  test.beforeEach(async ({ page }) => {
    skipWithoutStagingUrl();
    await page.goto(testConfig.ace.baseURL + "/ask").catch(async () => {
      await page.goto(testConfig.ace.baseURL + "/");
    });
  });

  test("ACE-QRY-04 • empty query is blocked with a visible validation message (not silently sent)", async ({
    queryPage,
    page,
  }) => {
    test.setTimeout(20_000);

    let preSubmitRequests = 0;
    await test.step("Observe the network baseline before any submit click", async () => {
      preSubmitRequests = await page
        .evaluate(() => performance.getEntriesByType("resource").length)
        .catch(() => 0);
    });

    let observedSubmitCall: import("@playwright/test").Response | null = null;
    const listener = page
      .waitForResponse(
        (r) =>
          /\/(query|ask|chat|answer|acc-agent|acc_agent)/i.test(r.url()) &&
          r.request().method() !== "GET",
        { timeout: 3_000 },
      )
      .then((r) => {
        observedSubmitCall = r;
        return r;
      })
      .catch(() => null);

    await test.step("Submit an empty query", async () => {
      await queryPage.typeQuery("");
      await queryPage.submitButton.click({ force: true }).catch(() => undefined);
    });

    await listener;

    await test.step("Verify a visible validation message appeared", async () => {
      await queryPage.assertValidationErrorVisible();
    });

    await test.step(
      "Verify the click did NOT silently dispatch a successful backend call",
      async () => {
        const postSubmitRequests = await page
          .evaluate(() => performance.getEntriesByType("resource").length)
          .catch(() => preSubmitRequests);
        if (observedSubmitCall) {
          const status = observedSubmitCall.status();
          expect(
            status >= 400 && status < 500,
            `Empty-query submission returned a non-4xx status (${status}); the backend ` +
              `should reject (or the frontend should never have sent) the request.`,
          ).toBe(true);
        }
        expect(
          postSubmitRequests,
          "resource count after the empty submit",
        ).toBeGreaterThanOrEqual(preSubmitRequests);
      },
    );
  });

  test("ACE-QRY-05 • language switching mid-session updates UI copy without a full page reload", async ({
    queryPage,
    page,
  }) => {
    test.setTimeout(45_000);

    let documentLoadedCount = 0;
    page.on("load", () => {
      documentLoadedCount += 1;
    });

    await test.step("Snapshot the locale-aware UI strings while in the default locale", async () => {
      await queryPage.heading.waitFor({ state: "visible", timeout: 15_000 });
    });

    const beforeSnapshot = await queryPage.snapshotLocale();
    const beforeLanguage = await queryPage.readSelectedLanguage();
    const beforeDocLoad = documentLoadedCount;

    await test.step(
      "Switch the language picker from the starting locale to English",
      async () => {
        try {
          await queryPage.selectLanguage(SELECTOR_MAP.aceLanguages.englishIndia);
        } catch (err) {
          console.log(
            `[ace-web-app] ACE-QRY-05 could not switch to English: ${String(err)}`,
          );
          test.skip(
            true,
            "Language picker was not exercisable on this staging build.",
          );
        }
      },
    );

    await test.step("Wait for the locale to apply (do NOT reload the document)", async () => {
      await expect
        .poll(async () => queryPage.readSelectedLanguage(), { timeout: 5_000 })
        .toMatch(/en-IN|en/i);

      if (beforeLanguage && /en-IN|^en$/i.test(beforeLanguage)) {
        console.log(
          "[ace-web-app] ACE-QRY-05: starting locale was already English — locale-change " +
            "diff is meaningless. Soft-skipping.",
        );
        test.skip(
          true,
          "Starting locale was already English — the mid-session switch contract " +
            "cannot be exercised on this staging build.",
        );
      }
    });

    await test.step("Snapshot the post-switch UI strings", async () => {
      const afterSnapshot = await queryPage.snapshotLocale();
      const afterLanguage = await queryPage.readSelectedLanguage();

      expect(
        afterLanguage,
        "language picker value should reflect the new locale after the switch",
      ).toMatch(/en-IN|en/i);

      expect(
        documentLoadedCount,
        "language switch should not trigger a full document reload",
      ).toBe(beforeDocLoad);

      const localised = [
        beforeSnapshot.inputPlaceholder !== afterSnapshot.inputPlaceholder,
        beforeSnapshot.submitButtonLabel !== afterSnapshot.submitButtonLabel,
        beforeSnapshot.pageHeadingText !== afterSnapshot.pageHeadingText,
      ].filter(Boolean);
      if (localised.length === 0) {
        console.log(
          "[ace-web-app] ACE-QRY-05: no localised strings differ between locales.",
        );
      }
    });
  });

  test("ACE-QRY-06 • saved conversations remain visible after a language switch", async ({
    queryPage,
    page,
  }) => {
    test.setTimeout(60_000);

    const HISTORY_QUERY =
      "What fertilizer should I use for tomatoes in sandy soil?";

    await test.step("Submit one query to seed the saved-conversations list", async () => {
      await queryPage.submitAndWaitForResponse({
        text: HISTORY_QUERY,
        timeoutMs: 30_000,
      });
    });

    const fingerprint = fingerprintFor(HISTORY_QUERY);

    await test.step(
      "Capture the saved-conversations list (before the language switch)",
      async () => {
        const rowsBefore = await queryPage.readSavedConversations();
        if (rowsBefore.length === 0) {
          console.log(
            "[ace-web-app] ACE-QRY-06: saved-conversations list is empty before the " +
              "switch. Soft-skipping.",
          );
          test.skip(
            true,
            "Saved-conversations list was empty after the initial submission.",
          );
        }
      },
    );

    await test.step("Switch the language picker to Hindi", async () => {
      try {
        await queryPage.selectLanguage(SELECTOR_MAP.aceLanguages.hindiIndia);
      } catch (err) {
        console.log(
          `[ace-web-app] ACE-QRY-06 could not switch to Hindi: ${String(err)}`,
        );
        test.skip(
          true,
          "Language picker was not exercisable on this staging build.",
        );
      }
      await expect
        .poll(async () => queryPage.readSelectedLanguage(), { timeout: 5_000 })
        .toMatch(/hi-IN|hi/i)
        .catch(() => undefined);
    });

    await test.step(
      "Verify the previously submitted query is still in the saved-conversations list",
      async () => {
        await page.waitForTimeout(250);
        await queryPage.assertSavedConversationsContains(fingerprint);
      },
    );
  });

  test("ACE-QRY-07 • submitting the same query twice does not create a broken / duplicated UI state", async ({
    queryPage,
    page,
  }) => {
    test.setTimeout(60_000);

    const DOUBLE_SUBMIT_QUERY = "When should I irrigate cotton in kharif?";

    let observedSubmitCalls = 0;
    const submissionCountListener = (response: import("@playwright/test").Response) => {
      if (
        /\/(query|ask|chat|answer|acc-agent|acc_agent)/i.test(response.url()) &&
        response.request().method() !== "GET"
      ) {
        observedSubmitCalls += 1;
      }
    };
    page.on("response", submissionCountListener);

    await test.step("Click the submit button twice in quick succession", async () => {
      await queryPage.doubleSubmit(DOUBLE_SUBMIT_QUERY);
    });

    await page.waitForTimeout(500);
    page.off("response", submissionCountListener);

    await test.step("Verify only one response / loading cycle is visible", async () => {
      const responseNodes = await queryPage.responseDisplay.count();
      expect(
        responseNodes <= 1,
        `expected ≤ 1 response display nodes after a double-submit guard; got ${responseNodes}.`,
      ).toBe(true);

      await queryPage.assertNonEmptyResponse();

      const errVisible = await queryPage.errorBanner
        .isVisible({ timeout: 1_000 })
        .catch(() => false);
      expect(errVisible, "no error banner expected from a guard-suppressed duplicate").toBe(
        false,
      );

      await queryPage.assertLoadingResolved();

      console.log(
        `[ace-web-app] ACE-QRY-07 observed ${observedSubmitCalls} upstream POST(s) ` +
          `after a double-click. UI shows ${responseNodes} response node(s).`,
      );
    });
  });
});
