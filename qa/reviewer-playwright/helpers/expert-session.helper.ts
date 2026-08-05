import type { Page } from "@playwright/test";

import { ExpertDashboardPage } from "../pages/expert/dashboard.page.js";
import { ExpertQuestionDetailsPage } from "../pages/expert/question-details.page.js";
import { ResponsePage } from "../pages/expert/response.page.js";

export async function createExpertSession(
  loginAsExpert: (email: string) => Promise<Page>,
  email: string,
) {
  const page = await loginAsExpert(email);

  return {
    page,
    dashboard: new ExpertDashboardPage(page),
    questionDetails: new ExpertQuestionDetailsPage(page),
    response: new ResponsePage(page),
  };
}
