import { test, expect } from "../../fixtures/workflow.fixture.js";

test.describe("Expert Response Workflow", () => {
  let question: string;

  test.beforeEach(
    async ({
      moderatorDashboard,
      createQuestionPage,
      moderatorAllocationQueuePage,
      expertAllocationSectionPage,
    }) => {
      question = `PW_EAW_${Date.now()}`;

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

      // Disable auto allocation
      await moderatorAllocationQueuePage.disableExpertAutoAllocate();

      // Remove automatically allocated expert
      const autoAllocatedExpert =
        await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

      await moderatorAllocationQueuePage.openRemoveExpertDialog(
        autoAllocatedExpert,
      );

      await moderatorAllocationQueuePage.confirmRemoveExpert();

      await moderatorAllocationQueuePage.expectEmptyExpertQueue();

      // Manually allocate ExpertTest1
      await expertAllocationSectionPage.openSelectExpertsDialog();

      await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);

      await expertAllocationSectionPage.clickAllocate();

      await moderatorAllocationQueuePage.expectExpertAllocated(
        process.env.EXPERT_EMAIL!,
      );

      await moderatorAllocationQueuePage.expectExpertStatus("Waiting");
    },
  );

  test("ERW-M001 Moderator prepares question for expert response", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectExpertAllocated(
      process.env.EXPERT_EMAIL!,
    );
  });

  test("ERW-M002 Allocated expert logs in", async ({
    workflowExpertDashboard,
  }) => {
    await workflowExpertDashboard.waitForShell();
  });

  test("ERW-M003 Allocated expert can view assigned question", async ({
    workflowExpertDashboard,
    workflowResponsePage,
  }) => {
    await workflowExpertDashboard.waitForShell();

    await workflowExpertDashboard.waitForQuestion(question);

    await workflowExpertDashboard.openQuestion(question);

    // My Queue has no separate detail route: selecting a question updates
    // the Response panel's "Current Query" in place, and that's the signal
    // that the question is now "open".
    await workflowResponsePage.expectCurrentQuery(question);
  });

  test("ERW-M004 Expert can access response form", async ({
    workflowExpertDashboard,
    workflowResponsePage,
  }) => {
    await workflowExpertDashboard.waitForShell();

    await workflowExpertDashboard.waitForQuestion(question);

    await workflowExpertDashboard.openQuestion(question);

    await workflowResponsePage.expectCurrentQuery(question);

    await workflowResponsePage.expectLoaded();
  });

  test.describe("with the question open in the Response panel", () => {
    test.beforeEach(
      async ({ workflowExpertDashboard, workflowResponsePage }) => {
        await workflowExpertDashboard.waitForShell();
        await workflowExpertDashboard.waitForQuestion(question);
        await workflowExpertDashboard.openQuestion(question);
        await workflowResponsePage.expectCurrentQuery(question);
      },
    );

    // Catalogue source: 03-response.md, RESP-001.
    test("ERW-M005 Response panel controls are visible", async ({
      workflowResponsePage,
    }) => {
      await workflowResponsePage.expectLoaded();
    });

    // Catalogue source: 03-response.md, RESP-002.
    test("ERW-M006 Expert can open the metadata dialog", async ({
      workflowResponsePage,
    }) => {
      await workflowResponsePage.openMetadataDialog();
      await workflowResponsePage.expectMetadataDialog();
      await workflowResponsePage.closeMetadataDialog();
    });

    // Catalogue source: 03-response.md, RESP-003.
    test("ERW-M007 Metadata dialog displays all expected sections", async ({
      workflowResponsePage,
    }) => {
      await workflowResponsePage.openMetadataDialog();
      await workflowResponsePage.expectMetadataDialog();
      await workflowResponsePage.expectMetadataSections();
      await workflowResponsePage.closeMetadataDialog();
    });

    // Catalogue source: 03-response.md, RESP-004.
    test("ERW-M008 Metadata dialog displays expected metadata field labels", async ({
      workflowResponsePage,
    }) => {
      await workflowResponsePage.openMetadataDialog();
      await workflowResponsePage.expectMetadataDialog();
      await workflowResponsePage.expectMetadataFields();
      await workflowResponsePage.closeMetadataDialog();
    });

    // Catalogue source: 03-response.md, RESP-005.
    test("ERW-M009 Metadata dialog displays populated metadata values", async ({
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
    test("ERW-M010 Expert can enter a draft response", async ({
      workflowResponsePage,
    }) => {
      const answer = "Playwright successfully entered this response.";

      await workflowResponsePage.fillDraftResponse(answer);

      await workflowResponsePage.expectDraftResponse(answer);
    });

    // Catalogue source: 03-response.md, RESP-007.
    test("ERW-M011 Expert can enter remarks", async ({
      workflowResponsePage,
    }) => {
      const remarks = "Playwright successfully entered reviewer remarks.";

      await workflowResponsePage.fillRemarks(remarks);

      await workflowResponsePage.expectRemarks(remarks);
    });

    // Catalogue source: 03-response.md, RESP-008.
    test("ERW-M012 Reset clears draft response and remarks", async ({
      workflowResponsePage,
    }) => {
      await workflowResponsePage.fillDraftResponse(
        "Playwright draft response.",
      );
      await workflowResponsePage.fillRemarks("Playwright remarks.");

      await workflowResponsePage.clickReset();

      await workflowResponsePage.expectDraftResponseEmpty();
      await workflowResponsePage.expectRemarksEmpty();
    });

    // Catalogue source: 03-response.md, RESP-009.
    test("ERW-M013 Submit button is enabled after entering a draft response", async ({
      workflowResponsePage,
    }) => {
      await workflowResponsePage.expectSubmitDisabled();

      await workflowResponsePage.fillDraftResponse("Test response");

      await expect(workflowResponsePage.submitButton).toBeEnabled();
    });

    // Catalogue source: 03-response.md, RESP-010 + RESP-011 (merged: see note
    // above the describe block on why RESP-010's bare clickSubmit() isn't
    // reproduced separately).
    test("ERW-M014 Expert can submit a response and the form resets", async ({
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

      await workflowResponsePage.expectDraftResponseEmpty();
    });
  });

  test.describe("after the first expert submits an answer", () => {
    test.beforeEach(
      async ({ workflowExpertDashboard, workflowResponsePage }) => {
        await workflowExpertDashboard.waitForShell();
        await workflowExpertDashboard.waitForQuestion(question);
        await workflowExpertDashboard.openQuestion(question);
        await workflowResponsePage.expectCurrentQuery(question);

        await workflowResponsePage.fillDraftResponse(
          "Playwright automated answer for the review workflow.",
        );
        await workflowResponsePage.addSourceReference("State");
        await expect(workflowResponsePage.submitButton).toBeEnabled();
        await workflowResponsePage.clickSubmit();
        await workflowResponsePage.confirmSubmission();
        await workflowResponsePage.expectSubmissionSuccess();
      },
    );

    // Not in the RESP-*/ERW-* catalogue yet — new coverage for the
    // moderator-side status transition once an expert answers.
    test("ERW-M015 Moderator sees the expert's status change to Answer Created", async ({
      moderatorQuestionDetailsPage,
      moderatorDashboard,
      moderatorAllocationQueuePage,
    }) => {
      // The moderator's page was left on this question's Allocation Queue
      // view before the expert answered, so it's showing stale data.
      // Re-navigate to the same question (All Questions -> the question
      // row) rather than using the in-page refresh button, which drops
      // back to the All Questions list instead of staying on this view.
      await moderatorQuestionDetailsPage.exit();

      await moderatorDashboard.openQuestion(question);

      // await moderatorDashboard.openAllQuestions();
      // await moderatorDashboard.openQuestion(question);
      await moderatorAllocationQueuePage.expectOpened();

      await moderatorAllocationQueuePage.expectExpertStatus("Answer Created");
    });

    // NOTE: only experttest2..experttest8 are configured in .env
    // (EXPERT_EMAIL_2..EXPERT_EMAIL_8) — that's 8 experts total including
    // EXPERT_EMAIL, matching the "8 experts in queue" flow screenshot.
    // "expert 2 to 10" was requested but experttest9/10 have no accounts
    // configured yet; add EXPERT_EMAIL_9/EXPERT_EMAIL_10 to .env and to
    // config/accounts.js first if those should be included.
    test("ERW-M016 Moderator allocates the remaining experts to the queue", async ({
      expertAllocationSectionPage,
      moderatorAllocationQueuePage,
    }) => {
      const remainingExperts = [2, 3, 4, 5, 6, 7, 8].map(
        (n) => process.env[`EXPERT_EMAIL_${n}`]!,
      );

      await expertAllocationSectionPage.openSelectExpertsDialog();
      await expertAllocationSectionPage.selectExperts(remainingExperts);
      await expertAllocationSectionPage.clickAllocate();
      await expertAllocationSectionPage.expectAllocationSuccess();

      for (const email of remainingExperts) {
        await moderatorAllocationQueuePage.expectExpertAllocated(email);
      }
    });

    test.describe("and the other experts are allocated", () => {
      test.beforeEach(
        async ({
          expertAllocationSectionPage,
          moderatorAllocationQueuePage,
        }) => {
          const remainingExperts = [2, 3, 4, 5, 6, 7, 8].map(
            (n) => process.env[`EXPERT_EMAIL_${n}`]!,
          );

          await expertAllocationSectionPage.openSelectExpertsDialog();
          await expertAllocationSectionPage.selectExperts(remainingExperts);
          await expertAllocationSectionPage.clickAllocate();
          await expertAllocationSectionPage.expectAllocationSuccess();

          for (const email of remainingExperts) {
            await moderatorAllocationQueuePage.expectExpertAllocated(email);
          }
        },
      );

      // Only the buttons/elements confirmed against real DOM are exercised
      // here (Accept/Reject/Modify buttons visible, View Details, Comments
      // accordion). The actual Accept/Reject/Modify *actions* are not
      // tested yet — their dialogs (Confirm Acceptance's toggles, and
      // Reject/Modify entirely) still need DOM verification. See the
      // header comment in review-panel.page.ts.
      test("ERW-M017 Second expert sees review actions for the first expert's answer", async ({
        expert2Dashboard,
        expert2ReviewPanel,
      }) => {
        await expert2Dashboard.waitForShell();
        await expert2Dashboard.waitForQuestion(question);
        await expert2Dashboard.openQuestion(question);

        await expert2ReviewPanel.expectReviewActionsVisible();

        await expert2ReviewPanel.openViewDetails();
      });
    });
  });
});
