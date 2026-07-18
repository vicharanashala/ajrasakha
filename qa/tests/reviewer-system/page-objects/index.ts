/**
 * Barrel export for reviewer-system page objects.
 *
 *   import { LoginPage, ExpertInboxPage } from "../page-objects";
 *
 * Keeps imports short and gives us one place to add a barrel-specific
 * helper (e.g. an `expect*()` aggregator) later.
 *
 * PR #2 adds the three Expert page objects (`ExpertInboxPage`,
 * `ExpertAnswerPage`, `ExpertHistoryPage`) that map to the
 * `/expert/inbox`, `/expert/inbox/:id`, and `/expert/history` routes.
 */
export { LoginPage } from "./LoginPage";
export { QuestionQueuePage } from "./QuestionQueuePage";
export { QuestionDetailPage } from "./QuestionDetailPage";
export { ModeratorDashboardPage } from "./ModeratorDashboardPage";
export { ExpertInboxPage } from "./ExpertInboxPage";
export { ExpertAnswerPage } from "./ExpertAnswerPage";
export { ExpertHistoryPage } from "./ExpertHistoryPage";
export { SELECTOR_MAP, Routes } from "./selector-map";
