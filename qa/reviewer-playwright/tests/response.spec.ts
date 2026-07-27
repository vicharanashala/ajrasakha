import { test, expect } from "../fixtures/reviewer.fixture.js";

test.describe("Reviewer Response Panel", () => {
  // Catalogue source: 03-response.md, RESP-001.
  test("RESP-001 response panel is visible", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();

    await responsePage.expectLoaded();
  });

  test("RESP-002 expert can open the metadata dialog", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();

    await responsePage.openMetadataDialog();

    await responsePage.expectMetadataDialog();

    await responsePage.closeMetadataDialog();
  });

  // Catalogue source: 03-response.md, RESP-003.
  test("RESP-003 metadata dialog displays all expected sections", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();

    await responsePage.openMetadataDialog();

    await responsePage.expectMetadataDialog();

    await responsePage.expectMetadataSections();

    await responsePage.closeMetadataDialog();
  });

  // Catalogue source: 03-response.md, RESP-004.
  test("RESP-004 metadata dialog displays expected metadata fields", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();

    await responsePage.openMetadataDialog();

    await responsePage.expectMetadataDialog();

    await responsePage.expectMetadataFields();

    await responsePage.closeMetadataDialog();
  });

  // Catalogue source: 03-response.md, RESP-005.
  test("RESP-005 metadata dialog displays metadata values", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();

    await responsePage.openMetadataDialog();

    await responsePage.expectMetadataDialog();

    await responsePage.expectFieldHasValue("Source");
    await responsePage.expectFieldHasValue("Priority");
    await responsePage.expectFieldHasValue("Status");
    await responsePage.expectFieldHasValue("Total Answers");
    await responsePage.expectFieldHasValue("Created At");

    await responsePage.expectFieldHasValue("State");
    await responsePage.expectFieldHasValue("District");
    await responsePage.expectFieldHasValue("Crop");
    await responsePage.expectFieldHasValue("Normalized Crop");
    await responsePage.expectFieldHasValue("Season");
    await responsePage.expectFieldHasValue("Domain");

    await responsePage.closeMetadataDialog();
  });

  test("RESP-006 reviewer can enter a draft response", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();

    const answer = "Playwright successfully entered this response.";

    await responsePage.fillDraftResponse(answer);

    await expect(responsePage.draftResponse).toHaveValue(answer);
  });

  // Catalogue source: 03-response.md, RESP-007.
  test("RESP-007 reviewer can enter remarks", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();

    const remarks = "Playwright successfully entered reviewer remarks.";

    await responsePage.fillRemarks(remarks);

    await responsePage.expectRemarks(remarks);
  });

  // Catalogue source: 03-response.md, RESP-008.
  test("RESP-008 reset clears draft response and remarks", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();

    await responsePage.fillDraftResponse("Playwright draft response.");

    await responsePage.fillRemarks("Playwright remarks.");

    await responsePage.clickReset();

    await responsePage.expectDraftResponseEmpty();
    await responsePage.expectRemarksEmpty();
  });

  // Catalogue source: 03-response.md, RESP-009.
  test("RESP-009 Submit button is enabled after entering a draft response", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();
    await expect(responsePage.submitButton).toBeDisabled();

    await responsePage.fillDraftResponse("Test response");

    await expect(responsePage.submitButton).toBeEnabled();
  });

  // Catalogue source: 03-response.md, RESP-010.
  test("RESP-010 reviewer can submit a draft response", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();

    await responsePage.fillDraftResponse(
      "Playwright successfully submitted this response.",
    );

    await expect(responsePage.submitButton).toBeEnabled();

    await responsePage.clickSubmit();

    await responsePage.expectSubmissionSuccess();
  });

  test("RESP-011 response form resets after successful submission", async ({
    dashboardPage,
    responsePage,
  }) => {
    await dashboardPage.waitForShell();

    await responsePage.fillDraftResponse(
      "Playwright response submitted successfully.",
    );

    await responsePage.addSourceReference("State");

    await expect(responsePage.submitButton).toBeEnabled();

    await responsePage.clickSubmit();

    await responsePage.confirmSubmission();
    await expect(responsePage.draftResponse).not.toHaveValue(
      "Playwright response submitted successfully.",
    );

    await responsePage.expectDraftResponseEmpty();

    // await responsePage.expectSubmissionSuccess();

    // await expect(responsePage.successToast).toBeHidden();

    // await responsePage.expectDraftResponseEmpty();
  });
});
