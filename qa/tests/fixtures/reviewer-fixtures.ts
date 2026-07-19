/**
 * Playwright fixtures for Reviewer System tests (@reviewer tag).
 *
 * Re-exports the stock Playwright `test` and `expect` so spec files have a
 * stable import path.  Per-spec helpers (locators, page-object classes)
 * can be added here as the suite grows.
 */
import { test as base, expect } from "@playwright/test";

export const test = base;
export { expect };
export default base;
