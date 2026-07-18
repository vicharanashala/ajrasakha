/**
 * Barrel for reviewer-system fixtures.
 *
 *   import { test, expect } from "../fixtures";
 *
 * Backed by `auth-fixtures.ts` — named for the prospect that we'll grow
 * a separate fixture file (e.g. `allocation-fixtures.ts`) when the
 * allocation helpers get richer than the inline page-object pattern.
 */
export * from "./auth-fixtures";