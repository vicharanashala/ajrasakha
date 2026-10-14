import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../../fixtures";
import {
  allocateExperts,
  createQuestion,
  deleteQuestions,
  getQuestionFull,
  getUserByEmail,
} from "../../support/api";
import {
  precondition,
  seedMarker,
  uniqueQuestionText,
} from "../../support/preconditions";
import { ExpertQueuePage } from "../../page-objects/ExpertQueuePage";
import { QuestionsPage } from "../../page-objects/QuestionsPage";
import { expectToast } from "../../support/helpers";
import { env } from "../../support/config";

/**
 * UPL-* — document upload sources (expert project).
 *
 * The new "Upload File" source mode in the QA-interface SourceUrlManager:
 * select a source type, switch to Upload File, pick a PDF/DOC/DOCX (<=20MB),
 * and the uploaded document is added as a source carrying its metadata
 * (id/filename/mimeType/size). The upload hits POST /answers/documents/upload
 * and the submitted answer must persist `sources[].uploadedDocument`.
 *
 * Every test provisions its OWN question (create + allocate to the E2E expert)
 * so the seeded first-response question used by EXP-03..08 is never consumed,
 * and each test is independent under fullyParallel. `[setup]` preconditions
 * fail loudly when the staging data cannot satisfy them — never silently skip.
 */

const FIXTURE_DIR = resolve(__dirname, "../../fixtures/upload");

interface Fixture {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

function fixture(name: string, mimeType: string): Fixture {
  return { name, mimeType, buffer: readFileSync(resolve(FIXTURE_DIR, name)) };
}

const PDF = fixture("sample.pdf", "application/pdf");
const DOC = fixture("sample.doc", "application/msword");
const DOCX = fixture(
  "sample.docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
);
const TXT = fixture("sample.txt", "text/plain");
const OVERSIZED = fixture("oversized.pdf", "application/pdf");

const ANSWER_TEXT = `${seedMarker()} E2E answer citing an uploaded document source.`;

/**
 * Create an AGRI_EXPERT question, allocate it to the E2E expert, and return
 * ids + text so the test can locate it in "My Queue". Fails loudly when the
 * expert user record is missing.
 */
async function seedUploadQuestion(
  request: APIRequestContext,
  adminToken: string,
): Promise<{ questionId: string; questionText: string }> {
  const questionText = uniqueQuestionText("Paddy spacing upload source check?");
  const created = await createQuestion(request, adminToken, {
    question: questionText,
    context: `${seedMarker()} upload-document E2E`,
    source: "AGRI_EXPERT",
  });
  const expert = await getUserByEmail(env.expert.email);
  if (!expert?._id) {
    precondition(
      `Staging has no user record for the E2E expert email (${env.expert.email}). ` +
        `Provision the expert account in User Management, then re-run.`,
    );
  }
  await allocateExperts(request, adminToken, created._id, [expert._id]);
  return { questionId: created._id, questionText };
}

/** Open My Queue and select the given question so the first-response editor shows. */
async function openDraftEditor(
  page: Page,
  expertQueue: ExpertQueuePage,
  questionText: string,
): Promise<void> {
  await expertQueue.goto();
  const row = page.getByText(questionText, { exact: false }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(expertQueue.answerTextarea).toBeVisible({ timeout: 30_000 });
}

/** Select a source type in the SourceUrlManager select. */
async function selectSourceType(page: Page, label: string): Promise<void> {
  const trigger = page
    .getByRole("combobox")
    .filter({ hasText: "Select Source Type" })
    .first();
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

/** Switch the SourceUrlManager to Upload File mode and attach a fixture file. */
async function uploadFixtureFile(page: Page, file: Fixture): Promise<void> {
  await page
    .getByRole("button", { name: "Upload File", exact: true })
    .click();
  await page.getByTestId("document-file-input").setInputFiles({
    name: file.name,
    mimeType: file.mimeType,
    buffer: file.buffer,
  });
}

/** Open the draft editor for a fresh question with a source type pre-selected. */
async function openEditorWithSourceType(
  page: Page,
  expertQueue: ExpertQueuePage,
  questionText: string,
): Promise<void> {
  await openDraftEditor(page, expertQueue, questionText);
  await selectSourceType(page, "Other");
  // The "add source" flow requires a source name before the URL is accepted.
  await page.getByPlaceholder("Other Source Name").fill("E2E Upload Source");
}

test.describe("UPL document upload sources", () => {
  test("UPL-01 unsupported file type is rejected with a clear toast", async ({
    page,
    expertQueue,
    request,
    adminToken,
  }) => {
    const { questionId, questionText } = await seedUploadQuestion(
      request,
      adminToken,
    );
    try {
      await openEditorWithSourceType(page, expertQueue, questionText);
      await uploadFixtureFile(page, TXT);
      await expectToast(page, "Only PDF, DOC and DOCX files are allowed.");
      // Nothing was added as a source.
      await expect(page.getByText("source added", { exact: false })).toHaveCount(0);
    } finally {
      await deleteQuestions(request, adminToken, [questionId]);
    }
  });

  test("UPL-02 oversized file (>20MB) is rejected with a clear toast", async ({
    page,
    expertQueue,
    request,
    adminToken,
  }) => {
    const { questionId, questionText } = await seedUploadQuestion(
      request,
      adminToken,
    );
    try {
      await openEditorWithSourceType(page, expertQueue, questionText);
      await uploadFixtureFile(page, OVERSIZED);
      await expectToast(page, "File size must not exceed 20MB.");
      await expect(page.getByText("source added", { exact: false })).toHaveCount(0);
    } finally {
      await deleteQuestions(request, adminToken, [questionId]);
    }
  });

  test("UPL-03 Zoho WorkDrive URL mode regression (reject/accept)", async ({
    page,
    expertQueue,
    request,
    adminToken,
  }) => {
    const { questionId, questionText } = await seedUploadQuestion(
      request,
      adminToken,
    );
    try {
      await openEditorWithSourceType(page, expertQueue, questionText);

      // Non-Zoho URL is rejected in the default URL mode.
      const urlInput = page.getByPlaceholder("Other Source Link URL");
      await urlInput.fill("https://example.com/paddy-guide");
      await urlInput.press("Enter");
      await expectToast(page, "Only Zoho WorkDrive URLs are allowed.");

      // A Zoho WorkDrive URL is accepted and listed.
      const zohoUrl = "https://workdrive.zoho.com/file/e2e-upload-check";
      await urlInput.fill(zohoUrl);
      await urlInput.press("Enter");
      await expect(
        page.getByText(zohoUrl, { exact: true }).first(),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await deleteQuestions(request, adminToken, [questionId]);
    }
  });

  for (const file of [PDF, DOC, DOCX]) {
    test(`UPL-04 ${file.name} uploads, shows as a source, and persists uploadedDocument`, async ({
      page,
      expertQueue,
      request,
      adminToken,
      expertToken,
    }) => {
      test.slow();
      const { questionId, questionText } = await seedUploadQuestion(
        request,
        adminToken,
      );
      try {
        await openEditorWithSourceType(page, expertQueue, questionText);

        await uploadFixtureFile(page, file);
        await expectToast(page, "Document uploaded and added as a source.");

        // The added-source row shows the filename, not the /api/answers/... URL.
        await expect(
          page.getByText(file.name, { exact: true }).first(),
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          page.getByText("/api/answers/documents/", { exact: false }),
        ).toHaveCount(0);
        await expect(page.getByText("1 source added")).toBeVisible();

        // Submit the answer through the real UI (first-response editor).
        await expertQueue.fillAnswer(ANSWER_TEXT);
        await expertQueue.submit();
        await expectToast(page, "Your response has been submitted. Thank you!");

        // The persisted answer carries the uploadedDocument metadata.
        await expect
          .poll(
            async () => {
              const full = await getQuestionFull(request, expertToken, questionId);
              const src = full.submission?.history?.[0]?.answer?.sources?.[0] as
                | {
                    uploadedDocument?: {
                      id?: string;
                      filename?: string;
                      mimeType?: string;
                      size?: number;
                    };
                  }
                | undefined;
              return src?.uploadedDocument ?? null;
            },
            { timeout: 30_000 },
          )
          .toEqual({
            id: expect.any(String),
            filename: file.name,
            mimeType: file.mimeType,
            size: file.buffer.length,
          });
      } finally {
        await deleteQuestions(request, adminToken, [questionId]);
      }
    });
  }

  test("UPL-05 uploaded document downloads from a read-only display", async ({
    page,
    expertQueue,
    request,
    adminToken,
  }) => {
    test.slow();
    test.setTimeout(300_000);
    const { questionId, questionText } = await seedUploadQuestion(
      request,
      adminToken,
    );
    try {
      await openEditorWithSourceType(page, expertQueue, questionText);
      await uploadFixtureFile(page, PDF);
      await expectToast(page, "Document uploaded and added as a source.");
      await expertQueue.fillAnswer(ANSWER_TEXT);
      await expertQueue.submit();
      await expectToast(page, "Your response has been submitted. Thank you!");

      // The question now has a submission history; once answered it leaves the
      // expert's "My Queue" (the allocated list only shows questions awaiting an
      // empty answer), so the read-only display of the submitted answer is
      // reached through the "All Questions" tab -> question details -> the
      // answer's "View More" dialog (ViewMoreContent / SourceItemDisplay).
      const questionsPage = new QuestionsPage(page);
      await questionsPage.goto();
      await questionsPage.setSourceMode("manual");
      // The question cell is truncated to 50 chars, so match the unique
      // `[E2E …]` marker prefix that survives truncation, not the full text.
      const marker = questionText.slice(0, questionText.indexOf("]") + 1);
      await questionsPage.openRowContaining(marker);

      // "Answer Details" dialog renders the source as a download link
      // (SourceItemDisplay) — clicking it downloads the original file.
      const viewMore = page.getByRole("button", { name: "View More" }).first();
      await expect(viewMore).toBeVisible({ timeout: 30_000 });
      await viewMore.click();
      const dialog = page.getByRole("dialog", { name: "Answer Details" });
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      const downloadPromise = page.waitForEvent("download", {
        timeout: 20_000,
      });
      await dialog.getByText(PDF.name, { exact: true }).first().click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(PDF.name);
    } finally {
      await deleteQuestions(request, adminToken, [questionId]);
    }
  });
});
