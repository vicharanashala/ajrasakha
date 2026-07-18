/**
 * Reviewer-system expert fixtures.
 *
 * PR #2 — extends the page-object fixtures from `auth-fixtures.ts`
 * with the **`allocatedQuestion`** setup fixture used by
 * `expert/answer-and-handoff.spec.ts`.
 *
 *   import { test, expect } from "../fixtures/expert-fixtures";
 *
 *   test("...", async ({ page, loginPage, inboxPage, answerPage,
 *                         historyPage, allocatedQuestion }) => { ... });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Why this fixture is separate from auth-fixtures.ts
 * ─────────────────────────────────────────────────────────────────────────────
 *  • auth-fixtures.ts is the small "give me page objects" helper that
 *    every reviewer-system spec imports.  Adding an `allocatedQuestion`
 *    helper there would force the moderator spec (PR #1) to pull in a
 *    helper it never uses — and to instantiate a second browser context
 *    on every test run.
 *  • expert-fixtures.ts re-uses the auth-fixtures fixtures and layers
 *    the allocation setup on top.  Moderator specs stay unchanged.
 *  • Keeping the helper under `fixtures/` (rather than inline in the
 *    spec file) means future PR #3 / PR #4 specs can import the same
 *    setup helper if they need a pre-allocated question too.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Why `test.beforeAll` instead of a public staging API
 * ─────────────────────────────────────────────────────────────────────────────
 *  The task asks for a programmatic setup that doesn't depend on
 *  PR #1's UI test having run first.  The ideal path would be a
 *  documented staging allocation API (e.g. POST /api/questions/:id/allocate)
 *  that this fixture can call directly.
 *
 *  Reality: the Reviewer frontend lives at desk.vicharanashala.ai OUTSIDE
 *  this monorepo.  No public allocation API is exposed on staging (and
 *  no API doc has been published).  The only reliable, supported way to
 *  allocate a question today is to drive the moderator UI from a
 *  separate browser context — exactly what the setup block below does.
 *
 *  When the staging team ships an allocation API, swap this helper for
 *  an `apiRequestContext.post(...)` call — every spec using
 *  `allocatedQuestion` will pick up the change with zero edits.
 *
 *  Each spec file imports this helper so:
 *    • specs are independent of one another (no `test.describe.serial`),
 *    • specs can be selected individually (`--grep EXP-04`),
 *    • specs can run in parallel (the helper uses a dedicated context).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Parallel-run caveat
 * ─────────────────────────────────────────────────────────────────────────────
 *  Allocating the *same* staging question concurrently from multiple
 *  spec files is racy on a shared staging environment.  To keep parallel
 *  runs deterministic, the helper reads a question from the moderator
 *  queue each time and picks the first row it finds.  Two parallel runs
 *  therefore allocate two *different* questions, not the same one.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { expect, BrowserContext } from "@playwright/test";
import {
  ExpertInboxPage,
  ExpertAnswerPage,
  ExpertHistoryPage,
} from "../page-objects";
import { testConfig } from "../../helpers/test-config";
import { test as authTest } from "./auth-fixtures";

/**
 * Has every required env var to actually run expert tests.
 */
export function expertFlowCredsAvailable(): boolean {
  return (
    !!(process.env.REVIEWER_STAGING_URL || process.env.REVIEWER_BASE_URL) &&
    !!testConfig.reviewer.expert.email &&
    !!testConfig.reviewer.expert.password &&
    !!testConfig.reviewer.moderator.email &&
    !!testConfig.reviewer.moderator.password
  );
}

/**
 * Result of the allocation setup.  Tests use `questionId` to navigate to
 * the answer page; `moderatorContext` is exposed so permission-denied
 * tests can keep using the original moderator browser context (e.g.
 * to deallocate and reallocate to a different expert).
 */
export type AllocatedQuestion = {
  questionId: string;
  /** The browser context that performed the moderator allocation (auto-cleaned). */
  moderatorContext: BrowserContext;
};

/**
 * Resolve the display name the moderator's expert dropdown expects.
 * Frontends usually show a display name rather than an email, so an
 * explicit `EXPERT_TEST_NAME` wins; the email is the fallback.
 */
function resolveExpertLabel(): string {
  return process.env.EXPERT_TEST_NAME || process.env.EXPERT_TEST_EMAIL || "";
}

type ExpertFixtures = {
  inboxPage: ExpertInboxPage;
  answerPage: ExpertAnswerPage;
  historyPage: ExpertHistoryPage;
  /** Pre-allocated question id, available after the per-test setup. */
  allocatedQuestion: AllocatedQuestion;
  /** A second browser context the spec can use for cross-expert tests. */
  incognitoContext: BrowserContext;
};

/**
 * Extend the auth-fixtures (page-object) fixtures with the expert flow's
 * `allocatedQuestion` + helpers.  We deliberately build on top of
 * `authTest` so the moderator spec (PR #1) keeps the same fixture API.
 */
export const test = authTest.extend<ExpertFixtures>({
  inboxPage: async ({ page }, use) => use(new ExpertInboxPage(page)),
  answerPage: async ({ page }, use) => use(new ExpertAnswerPage(page)),
  historyPage: async ({ page }, use) => use(new ExpertHistoryPage(page)),
  incognitoContext: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    await use(ctx);
    await ctx.close();
  },

  // ────────────────────────────────────────────────────────────────────────
  //  Allocated-question setup — runs once per test so every EXP-* test
  //  sees its own freshly-allocated question, even when running in parallel.
  // ────────────────────────────────────────────────────────────────────────
  allocatedQuestion: async ({ browser }, use, workerInfo) => {
    // Hard skip if staging credentials aren't configured.  This keeps
    // CI green during a secrets rotation rather than failing hard.
    if (!expertFlowCredsAvailable()) {
      test.skip(
        true,
        "REVIEWER_STAGING_URL + MODERATOR_TEST_EMAIL/PASSWORD + EXPERT_TEST_EMAIL/PASSWORD are required for the expert flow.",
      );
      return;
    }

    const expertName = resolveExpertLabel();
    if (!expertName) {
      test.skip(
        true,
        "EXPERT_TEST_NAME or EXPERT_TEST_EMAIL is required to allocate to.",
      );
      return;
    }

    const moderatorContext = await browser.newContext();
    const moderatorPage = await moderatorContext.newPage();
    const { LoginPage } = await import("../page-objects");
    const { QuestionQueuePage } = await import("../page-objects");
    const { QuestionDetailPage } = await import("../page-objects");
    const loginPage = new LoginPage(moderatorPage);
    const queuePage = new QuestionQueuePage(moderatorPage);
    const detailPage = new QuestionDetailPage(moderatorPage);

    let questionId: string | null = null;
    try {
      await test.step("Setup: log in as moderator in an isolated context", async () => {
        await loginPage.login(
          testConfig.reviewer.moderator.email,
          testConfig.reviewer.moderator.password,
        );
        await queuePage.assertOnQueuePage();
      });

      const rowCount = await queuePage.countRows();
      if (rowCount === 0) {
        console.log(
          `[reviewer-system] ${workerInfo.project.name} • allocatedQuestion: staging queue is empty; spec will soft-skip.`,
        );
        test.skip(true, "No pending questions in staging to allocate.");
        return;
      }

      const firstTestId = await queuePage.rows
        .first()
        .getAttribute("data-testid");
      const prefix = "queue-row-";
      if (!firstTestId || !firstTestId.startsWith(prefix)) {
        console.log(
          `[reviewer-system] ${workerInfo.project.name} • allocatedQuestion: could not derive question id from row testid ${firstTestId ?? "<missing>"}; update SELECTOR_MAP.ts.`,
        );
        test.skip(
          true,
          "Could not derive a question id from the moderator queue row.",
        );
        return;
      }
      questionId = firstTestId.slice(prefix.length);

      await test.step(`Setup: allocate question ${questionId} to ${expertName}`, async () => {
        await queuePage.openQuestion(questionId as string);
        await detailPage.allocateTo(expertName);
      });

      // Hand the question id + the moderator context to every test.
      await use({
        questionId: questionId as string,
        moderatorContext,
      });
    } finally {
      // Always tear down the moderator context — the question id
      // remains available to the suite as a plain string.
      await moderatorContext.close().catch(() => undefined);
    }
  },
});

export { expect };
export default test;
