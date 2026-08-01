import { test, expect } from "../../fixtures/moderator.fixture.js";

test.describe("Moderator Allocation Queue", () => {
  let question: string;

  test.beforeEach(async ({ moderatorDashboard, createQuestionPage }) => {
    question = `PW_E2E_${Date.now()}`;

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

    await moderatorDashboard.openQuestion(question);
  });

  test("MQA-001 Moderator sees Allocation Queue", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectOpened();
  });

  test("MQA-002 Moderator sees Auto Allocate toggle", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectAutoAllocateToggle();
  });

  test("MQA-003 Moderator sees allocation cards", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectAllocationCards();
  });

  test("MQA-004 Moderator sees assigned experts", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectExpertsVisible();
  });

  test("MQA-005 Moderator sees allocation statuses", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectStatusesVisible();
  });

  test("MQA-006 Moderator can view allocation status details", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.openFirstAllocationCard();

    await moderatorAllocationQueuePage.expectAllocationStatusMessage();
  });
  test("MQA-007 Moderator sees Gate Keeper Queue", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectGateKeeperOpened();
  });

  test("MQA-008 Moderator sees Gate Keeper Auto Allocate toggle", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectGateKeeperToggle();
  });

  test("MQA-009 Moderator sees Gate Keeper empty state", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectGateKeeperEmptyState();
  });

  test("MQA-010 Moderator sees Gate Keeper assignment message", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectGateKeeperMessage();
  });
  test("MQA-011 Moderator sees Auditor Queue", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectAuditorOpened();
  });

  test("MQA-012 Moderator sees Auditor Auto Allocate toggle", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectAuditorToggle();
  });

  test("MQA-013 Moderator sees Auditor empty state", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectAuditorEmptyState();
  });

  test("MQA-014 Moderator sees Auditor assignment message", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectAuditorMessage();
  });
});
