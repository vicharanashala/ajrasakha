/**
 * Barrel export for reviewer-system page objects.
 *
 *   import { LoginPage, QuestionQueuePage } from "../page-objects";
 *
 * Keeps imports short and gives us one place to add a barrel-specific
 * helper (e.g. an `expect*()` aggregator) later.
 */
export { LoginPage } from "./LoginPage";
export { QuestionQueuePage } from "./QuestionQueuePage";
export { QuestionDetailPage } from "./QuestionDetailPage";
export { ModeratorDashboardPage } from "./ModeratorDashboardPage";
export { SELECTOR_MAP, Routes } from "./selector-map";