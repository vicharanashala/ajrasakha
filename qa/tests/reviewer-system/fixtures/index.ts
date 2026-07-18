/**
 * Barrel for reviewer-system fixtures.
 *
 *   import { test, expect } from "../fixtures";          // auth / page-object
 *   import { test as expertTest } from "../fixtures";    // expert flow with allocation setup
 *
 * PR #1 exported only the auth (page-object) fixture set.  PR #2 adds the
 * expert fixture set on top, which layers the `allocatedQuestion`
 * per-test setup over the same page-object fixtures so the expert spec
 * can run independently of PR #1's moderator spec.
 *
 * Re-exports preserve the original names — `auth-fixtures.ts` callers
 * still get the same `loginPage`, `queuePage`, etc. they imported
 * before PR #2 landed.  Only the `test` export collides (both modules
 * re-export `test`); the explicit re-export below resolves it.
 */

// Auth / page-object fixtures (PR #1) — re-exported explicitly to avoid
// the implicit-export ambiguity when both modules define `test`.
export {
  test,
  expect,
  reviewerCredsAvailable,
  expertCredsAvailable,
  Page,
} from "./auth-fixtures";

// Expert-flow fixtures (PR #2) — `test` is exported under a different name
// because the expert fixture set extends the auth fixture set and the
// spec file imports it explicitly with `import { test } from
// "../fixtures/expert-fixtures"` to get the `allocatedQuestion` fixture.
export {
  test as expertTest,
  expect as expertExpect,
  expertFlowCredsAvailable,
} from "./expert-fixtures";

export type { AllocatedQuestion } from "./expert-fixtures";
