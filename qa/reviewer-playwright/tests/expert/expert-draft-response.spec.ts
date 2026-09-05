import { test, expect } from "../../fixtures/workflow.fixture.js";

// This suite used to rely on the expert account already having a question
// sitting in "My Queue" (via fixtures/expert.fixture.ts, which has no
// moderator access). That's an assumption about external test data the
// suite can't control, and #new-answer / the rest of the Response panel
// only renders once a question is actually selected there. Each test below
// now creates and allocates its own question as the moderator first (same
// approach as tests/workflows/expert-response-workflow.spec.ts), so the
// suite is self-contained.
test.describe("Reviewer Response Panel", () => {
  // Each test creates and allocates its own question (moderator create +
  // allocate + expert queue propagation), which routinely takes 40-55s on
  // its own even before the test body runs - too close to the default 60s
  // budget. Same pattern as expert-triple-acceptance-workflow.spec.ts.
  test.describe.configure({ timeout: 120_000 });

  let question: string;

  test.beforeEach(
    async ({
      moderatorDashboard,
      createQuestionPage,
      moderatorAllocationQueuePage,
      expertAllocationSectionPage,
      workflowExpertDashboard,
      workflowResponsePage,
    }) => {
      question = `PW_RESP_${Date.now()}`;

      await moderatorDashboard.waitForShell();
      await moderatorDashboard.openAllQuestions();
      await moderatorDashboard.openCreateQuestionDialog();

      await createQuestionPage.fillQuestion(question);
      await createQuestionPage.selectState("Jammu And Kashmir");
      await createQuestionPage.selectDistrict("Rajouri");
      await createQuestionPage.selectCrop("All Spice");
      await createQuestionPage.selectSeason("Winter");
      await createQuestionPage.selectDomain("Fertilizer Use and Availability");
      await createQuestionPage.submit();

      await moderatorDashboard.expectQuestionCreated();
      await moderatorDashboard.expectQuestionVisible(question);
      await moderatorDashboard.waitForQuestionsToLoad();
      await moderatorDashboard.openQuestion(question);

      await moderatorAllocationQueuePage.expectOpened();

      // Disable auto allocation, then replace whichever expert auto-allocation
      // picked with EXPERT_EMAIL so the rest of this suite has a known account.
      await moderatorAllocationQueuePage.disableExpertAutoAllocate();

      const autoAllocatedExpert =
        await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

      await moderatorAllocationQueuePage.openRemoveExpertDialog(
        autoAllocatedExpert,
      );
      await moderatorAllocationQueuePage.confirmRemoveExpert();
      await moderatorAllocationQueuePage.expectEmptyExpertQueue();

      await expertAllocationSectionPage.openSelectExpertsDialog();
      await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);
      await expertAllocationSectionPage.clickAllocate();

      await moderatorAllocationQueuePage.expectExpertAllocated(
        process.env.EXPERT_EMAIL!,
      );
      await moderatorAllocationQueuePage.expectExpertStatus(
        process.env.EXPERT_EMAIL!,
        "Waiting",
      );

      // My Queue has no separate detail route: selecting a question updates
      // the Response panel's "Current Query" in place, and that's the signal
      // that the question is now "open" for this expert.
      await workflowExpertDashboard.waitForShell();
      await workflowExpertDashboard.waitForQuestion(question);
      await workflowExpertDashboard.openQuestion(question);
      await workflowResponsePage.expectCurrentQuery(question);
    },
  );

  // Catalogue source: 03-response.md, RESP-001.
  test("RESP-001 response panel is visible", async ({
    workflowResponsePage,
  }) => {
    await workflowResponsePage.expectLoaded();
  });

  // Catalogue source: 03-response.md, RESP-002.
  test("RESP-002 expert can open the metadata dialog", async ({
    workflowResponsePage,
  }) => {
    await workflowResponsePage.openMetadataDialog();
    await workflowResponsePage.expectMetadataDialog();
    await workflowResponsePage.closeMetadataDialog();
  });

  // Catalogue source: 03-response.md, RESP-003.
  test("RESP-003 metadata dialog displays all expected sections", async ({
    workflowResponsePage,
  }) => {
    await workflowResponsePage.openMetadataDialog();
    await workflowResponsePage.expectMetadataDialog();
    await workflowResponsePage.expectMetadataSections();
    await workflowResponsePage.closeMetadataDialog();
  });

  // Catalogue source: 03-response.md, RESP-004.
  test("RESP-004 metadata dialog displays expected metadata fields", async ({
    workflowResponsePage,
  }) => {
    await workflowResponsePage.openMetadataDialog();
    await workflowResponsePage.expectMetadataDialog();
    await workflowResponsePage.expectMetadataFields();
    await workflowResponsePage.closeMetadataDialog();
  });

  // Catalogue source: 03-response.md, RESP-005.
  test("RESP-005 metadata dialog displays metadata values", async ({
    workflowResponsePage,
  }) => {
    await workflowResponsePage.openMetadataDialog();
    await workflowResponsePage.expectMetadataDialog();

    await workflowResponsePage.expectFieldHasValue("Source");
    await workflowResponsePage.expectFieldHasValue("Priority");
    await workflowResponsePage.expectFieldHasValue("Status");
    await workflowResponsePage.expectFieldHasValue("Total Answers");
    await workflowResponsePage.expectFieldHasValue("Created At");

    await workflowResponsePage.expectFieldHasValue("State");
    await workflowResponsePage.expectFieldHasValue("District");
    await workflowResponsePage.expectFieldHasValue("Crop");
    await workflowResponsePage.expectFieldHasValue("Normalized Crop");
    await workflowResponsePage.expectFieldHasValue("Season");
    await workflowResponsePage.expectFieldHasValue("Domain");

    await workflowResponsePage.closeMetadataDialog();
  });

  // Catalogue source: 03-response.md, RESP-006.
  test("RESP-006 reviewer can enter a draft response", async ({
    workflowResponsePage,
  }) => {
    const answer = "Playwright successfully entered this response.";

    await workflowResponsePage.fillDraftResponse(answer);

    await workflowResponsePage.expectDraftResponse(answer);
  });

  // Catalogue source: 03-response.md, RESP-007.
  test("RESP-007 reviewer can enter remarks", async ({
    workflowResponsePage,
  }) => {
    const remarks = "Playwright successfully entered reviewer remarks.";

    await workflowResponsePage.fillRemarks(remarks);

    await workflowResponsePage.expectRemarks(remarks);
  });

  // Catalogue source: 03-response.md, RESP-008.
  test("RESP-008 reset clears draft response and remarks", async ({
    workflowResponsePage,
  }) => {
    await workflowResponsePage.fillDraftResponse("Playwright draft response.");
    await workflowResponsePage.fillRemarks("Playwright remarks.");

    await workflowResponsePage.clickReset();

    await workflowResponsePage.expectDraftResponseEmpty();
    await workflowResponsePage.expectRemarksEmpty();
  });

  // Catalogue source: 03-response.md, RESP-009.
  test("RESP-009 Submit button is enabled after entering a draft response", async ({
    workflowResponsePage,
  }) => {
    await workflowResponsePage.expectSubmitDisabled();

    await workflowResponsePage.fillDraftResponse("Test response");

    await expect(workflowResponsePage.submitButton).toBeEnabled();
  });

  // Catalogue source: 03-response.md, RESP-010.
  // The Submit button opens a confirmation dialog rather than submitting
  // directly, so confirmSubmission() has to run before the success toast
  // shows up - the original version of this test skipped that step and
  // could never pass.
  test("RESP-010 reviewer can submit a draft response", async ({
    workflowResponsePage,
  }) => {
    await workflowResponsePage.fillDraftResponse(
      "Playwright successfully submitted this response.",
    );
    await workflowResponsePage.addSourceReference("State");

    await expect(workflowResponsePage.submitButton).toBeEnabled();

    await workflowResponsePage.clickSubmit();
    await workflowResponsePage.confirmSubmission();

    await workflowResponsePage.expectSubmissionSuccess();
  });

  // Catalogue source: 03-response.md, RESP-011.
  test("RESP-011 response form resets after successful submission", async ({
    workflowResponsePage,
  }) => {
    await workflowResponsePage.fillDraftResponse(
      "Playwright response submitted successfully.",
    );
    await workflowResponsePage.addSourceReference("State");

    await expect(workflowResponsePage.submitButton).toBeEnabled();

    await workflowResponsePage.clickSubmit();
    await workflowResponsePage.confirmSubmission();

    await workflowResponsePage.expectSubmissionSuccess();
    await workflowResponsePage.expectDraftResponseEmpty();
  });
});
