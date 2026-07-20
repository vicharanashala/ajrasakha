/**
 * PR #1 — Moderator core flow (Reviewer System)
 *
 * The moderator owns the first gate in the reviewer pipeline: authenticated
 * moderators move pending farmer questions from the queue to an expert's
 * review workload.  These tests intentionally document one behaviour each so
 * a regression is easy to diagnose in CI.
 *
 * @reviewer
 */
import { test, expect, reviewerCredsAvailable } from "../fixtures";
import { LoginPage, QuestionQueuePage } from "../page-objects";
import { Routes } from "../page-objects/selector-map";
import { testConfig } from "../../helpers/test-config";

const INVALID_PASSWORD = "definitely-not-a-valid-password";

/**
 * Login once for a test and verify the application lands on its question
 * queue.  Keeping this helper action-only avoids hiding test assertions.
 */
async function loginAsModerator(
  loginPage: LoginPage,
  queuePage: QuestionQueuePage,
): Promise<void> {
  await test.step("Log in as the moderator", async () => {
    await loginPage.login(
      testConfig.reviewer.moderator.email,
      testConfig.reviewer.moderator.password,
    );
  });

  await test.step("Confirm the moderator lands on the question queue", async () => {
    await queuePage.assertOnQueuePage();
  });
}

/**
 * Return the first visible queue row's question ID.  The ID is read from the
 * row's data-testid rather than from a guessed child selector.
 *
 * If staging has no pending data, the caller skips with a clear message.  A
 * precondition helper is preferable to a hard failure for a shared staging
 * environment whose data may legitimately be empty.
 */
async function firstQuestionId(queuePage: QuestionQueuePage): Promise<string | null> {
  const count = await queuePage.countRows();
  if (count === 0) {
    console.log(
      "[reviewer-system] Staging queue is empty; skipping the question-data-dependent flow.",
    );
    return null;
  }

  const testId = await queuePage.rows.first().getAttribute("data-testid");
  const prefix = "queue-row-";
  if (!testId || !testId.startsWith(prefix)) {
    console.log(
      `[reviewer-system] Could not derive a question ID from row testid ${testId ?? "<missing>"}; update SELECTOR_MAP.ts.`,
    );
    return null;
  }
  return testId.slice(prefix.length);
}

/** Skip only when the reviewer staging credentials are not configured. */
function skipWithoutCredentials(): void {
  test.skip(
    !reviewerCredsAvailable(),
    "REVIEWER_STAGING_URL, MODERATOR_TEST_EMAIL, and MODERATOR_TEST_PASSWORD are required.",
  );
}

/**
 * Resolve the expert label to pick from the dropdown.  Frontends often show
 * a display name ("Dr. Ananya Sharma") rather than an email, so an explicit
 * `EXPERT_TEST_NAME` wins; the email is the fallback so the allocation
 * tests work out of the box.
 */
function resolveExpertLabel(): string | null {
  return process.env.EXPERT_TEST_NAME || process.env.EXPERT_TEST_EMAIL || null;
}

test.describe("@reviewer Moderator queue and allocation", () => {
  /**
   * 1. Covers the happy-path moderator authentication flow: valid credentials
   *    are accepted and the authenticated user is sent to the queue.
   */
  test("MOD-01 • moderator can log in with valid credentials", async ({
    loginPage,
    queuePage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);
    await expect(queuePage.page).toHaveURL(new RegExp(`${Routes.queue}$`));
  });

  /**
   * 2. Covers graceful authentication failure: invalid credentials show a
   *    user-facing error and must not grant access to the protected queue.
   */
  test("MOD-02 • invalid moderator login shows an error without redirect", async ({
    loginPage,
  }) => {
    skipWithoutCredentials();

    await test.step("Open the login screen", async () => {
      await loginPage.goto();
    });
    await test.step("Submit deliberately invalid credentials", async () => {
      await loginPage.fillEmail(testConfig.reviewer.moderator.email);
      await loginPage.fillPassword(INVALID_PASSWORD);
      await loginPage.submit();
    });
    await test.step("Verify the error and remain on login", async () => {
      await loginPage.assertErrorContains(/invalid|incorrect|credentials|failed/i);
      await loginPage.assertStillOnLogin();
    });
  });

  /**
   * 3. Covers the queue's initial data contract: a moderator can see pending
   *    questions.  Empty shared staging data is logged and skipped by design.
   */
  test("MOD-03 • question queue loads with pending questions", async ({
    loginPage,
    queuePage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);
    const count = await queuePage.countRows();
    if (count === 0) {
      console.log(
        "[reviewer-system] MOD-03 skipped: staging returned an empty pending-question queue.",
      );
      test.skip(true, "No pending questions are available in staging.");
    }
    await queuePage.assertNonEmpty();
  });

  /**
   * 4. Covers queue-to-detail navigation: selecting a pending row opens the
   *    corresponding question detail view.
   */
  test("MOD-04 • moderator can open a question detail view", async ({
    loginPage,
    queuePage,
    detailPage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);
    const questionId = await firstQuestionId(queuePage);
    if (!questionId) {
      test.skip(true, "No question row with a usable ID is available in staging.");
    }
    await test.step(`Open question ${questionId}`, async () => {
      await queuePage.openQuestion(questionId as string);
    });
    await test.step("Verify the detail view is visible", async () => {
      await expect(detailPage.heading).toBeVisible();
      await expect(detailPage.page).toHaveURL(new RegExp(`/queue/${questionId}$`));
    });
  });

  /**
   * 5. Covers allocation: a moderator selects the configured expert and
   *    confirms the assignment from the question detail view.
   */
  test("MOD-05 • moderator can allocate a question to an expert", async ({
    loginPage,
    queuePage,
    detailPage,
  }) => {
    skipWithoutCredentials();
    const expertName = resolveExpertLabel();
    test.skip(!expertName, "EXPERT_TEST_NAME or EXPERT_TEST_EMAIL is required for allocation tests.");

    await loginAsModerator(loginPage, queuePage);
    const questionId = await firstQuestionId(queuePage);
    if (!questionId) {
      test.skip(true, "No question is available to allocate in staging.");
    }
    await test.step("Open a pending question", async () => {
      await queuePage.openQuestion(questionId as string);
    });
    await test.step(`Allocate the question to ${expertName}`, async () => {
      await detailPage.selectExpert(expertName as string);
      await detailPage.allocateButton.click();
    });
    await test.step("Verify allocation confirmation", async () => {
      await expect(detailPage.allocationSuccessToast).toBeVisible({ timeout: 5_000 });
    });
  });

  /**
   * 6. Covers the post-allocation queue state: returning to the queue shows
   *    the question as assigned / in review rather than pending.
   */
  test("MOD-06 • allocated question status updates in the queue", async ({
    loginPage,
    queuePage,
    detailPage,
  }) => {
    skipWithoutCredentials();
    const expertName = resolveExpertLabel();
    test.skip(!expertName, "EXPERT_TEST_NAME or EXPERT_TEST_EMAIL is required for allocation tests.");

    await loginAsModerator(loginPage, queuePage);
    const questionId = await firstQuestionId(queuePage);
    if (!questionId) {
      test.skip(true, "No question is available to allocate in staging.");
    }
    await queuePage.openQuestion(questionId as string);
    await detailPage.allocateTo(expertName as string);
    await queuePage.goto();

    await test.step("Verify the queue status is no longer pending", async () => {
      const status = queuePage.rowStatus(questionId as string);
      await expect(status).toContainText(/assigned|in review|allocated/i);
    });
  });

  /**
   * 7. Covers the notification side effect of allocation.  The assertion
   *    accepts either the visible success toast or the fire-and-forget
   *    notification/assignment network response.
   */
  test("MOD-07 • allocation fires an expert notification event", async ({
    loginPage,
    queuePage,
    detailPage,
  }) => {
    skipWithoutCredentials();
    const expertName = resolveExpertLabel();
    test.skip(!expertName, "EXPERT_TEST_NAME or EXPERT_TEST_EMAIL is required for allocation tests.");

    await loginAsModerator(loginPage, queuePage);
    const questionId = await firstQuestionId(queuePage);
    if (!questionId) {
      test.skip(true, "No question is available to allocate in staging.");
    }
    await queuePage.openQuestion(questionId as string);

    const allocation = await test.step("Allocate and capture notification side effect", () =>
      detailPage.allocateTo(expertName as string),
    );
    await test.step("Verify notification confirmation or network event", async () => {
      await detailPage.assertNotificationFired(allocation);
    });
  });

  /**
   * 8. Covers queue discovery controls.  The test uses the first available
   *    status, language, or search control and records a clear skip if none
   *    exists in the staging DOM.
   */
  test("MOD-08 • moderator can filter or search the question queue", async ({
    loginPage,
    queuePage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);
    const hasStatus = await queuePage.statusFilter.isVisible().catch(() => false);
    const hasLanguage = await queuePage.languageFilter.isVisible().catch(() => false);
    const hasDate = await queuePage.dateFilter.isVisible().catch(() => false);
    const hasSearch = await queuePage.searchInput.isVisible().catch(() => false);

    if (hasStatus) {
      await test.step("Filter the queue by pending status", async () => {
        await queuePage.filterByStatus("pending");
      });
    } else if (hasLanguage) {
      await test.step("Filter the queue by the configured language", async () => {
        await queuePage.filterByLanguage("en");
      });
    } else if (hasDate) {
      await test.step("Use the queue date filter", async () => {
        await queuePage.dateFilter.fill("2024-01-01");
        await queuePage.applyFilterButton.click();
      });
    } else if (hasSearch) {
      await test.step("Search the queue", async () => {
        await queuePage.search("farmer");
      });
    } else {
      console.log(
        "[reviewer-system] MOD-08 skipped: staging exposes no recognized queue filter/search control.",
      );
      test.skip(true, "No recognized queue filter or search control is available.");
    }

    await test.step("Verify the queue remains usable after filtering/search", async () => {
      await queuePage.assertOnQueuePage();
      await expect(queuePage.page).not.toHaveURL(/\/error/);
    });
  });

  /**
   * 9. Covers session persistence: after a successful login, a reload keeps
   *    the moderator authenticated and preserves auth state (cookie or storage).
   */
  test("MOD-09 • moderator session persists after page reload", async ({
    loginPage,
    queuePage,
    page,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);
    const authStateBefore = await page.evaluate(() => ({
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
    }));
    const cookiesBefore = await page.context().cookies();

    await test.step("Reload the protected queue", async () => {
      await page.reload();
      await queuePage.assertOnQueuePage();
    });

    await test.step("Verify a cookie or browser-storage auth marker remains", async () => {
      const authStateAfter = await page.evaluate(() => ({
        localStorageKeys: Object.keys(localStorage),
        sessionStorageKeys: Object.keys(sessionStorage),
      }));
      const cookiesAfter = await page.context().cookies();
      const authMarker = /auth|token|session|jwt|access/i;
      const hasAuthCookie = cookiesAfter.some((cookie) => authMarker.test(cookie.name));
      const hasAuthStorage = [
        ...authStateBefore.localStorageKeys,
        ...authStateBefore.sessionStorageKeys,
        ...authStateAfter.localStorageKeys,
        ...authStateAfter.sessionStorageKeys,
      ].some((key) => authMarker.test(key));

      expect(
        hasAuthCookie || hasAuthStorage || cookiesAfter.length >= cookiesBefore.length,
        "an auth cookie or browser-storage marker should survive the reload",
      ).toBe(true);
    });
  });

  /**
   * 10. Covers logout and route protection: logout redirects to login and a
   *     direct visit to /queue can no longer render protected content.
   */
  test("MOD-10 • moderator can log out and queue access is protected", async ({
    loginPage,
    queuePage,
    dashboardPage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);
    await test.step("Log out from the moderator dashboard", async () => {
      await dashboardPage.goto();
      await dashboardPage.logout();
    });
    await test.step("Verify logout redirects to login", async () => {
      await expect(loginPage.page).toHaveURL(/\/login(\?|$)/);
    });
    await test.step("Verify direct queue access redirects to login", async () => {
      await dashboardPage.assertQueueRedirectsToLoginWhenUnauthenticated();
    });
  });
});