import { test } from "../fixtures/reviewer.fixture.js";

test.describe("Reviewer Response Panel", () => {
  // Catalogue source: 03-response.md, RESP-001.
  test("RESP-001 response panel is visible", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();

    await responsePage.expectLoaded();
  });
});
