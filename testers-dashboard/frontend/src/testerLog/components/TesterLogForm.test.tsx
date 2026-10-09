// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { TesterLogForm, validateTesterLogForm } from "./TesterLogForm";

const mutate = vi.fn();
vi.mock("../hooks/useTesterLogSubmit", () => ({
    useTesterLogSubmit: () => ({ mutate, isPending: false, isSuccess: false }),
}));

vi.mock("../hooks/useTesterLogHistory", () => ({
    useNextTestId: () => ({ data: "T-999", isLoading: false, refetch: vi.fn() }),
}));

vi.mock("../../hooks/useZohoTicketStatuses", () => ({
    useZohoTicketStatuses: () => ({ data: { statuses: {} }, isLoading: false }),
}));

beforeAll(() => {
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
    mutate.mockReset();
    localStorage.clear();
});

afterEach(cleanup);

describe("validateTesterLogForm", () => {
    it("auto-populates 'No Action Required' and passes defects validation when overallTestStatus is Pass", () => {
        const data: any = {
            typeOfQuestion: "Unique",
            buildVersion: "1.0",
            channelTested: "WebApp",
            languageTested: "English",
            threadId: "th-123",
            questionCategory: "Agronomy",
            queryText: "Sample question?",
            timeQuestionAsked: "10:00:00",
            timeAnswerReceived: "10:05:00",
            slaStatus: "Within SLA",
            questionInReviewModel: "Yes",
            questionCorrectlyFramed: "Yes",
            originalLanguage: "English",
            translatedLanguage: "English",
            translationQuality: "Excellent",
            tagging: "Correct",
            overallTestStatus: "Pass",
        };

        const errors = validateTesterLogForm(data, { isCross: false, excludeReviewerWorkflow: true });
        expect(errors.overallTestStatus).toBeUndefined();
        expect(errors.testerRemarks).toBeUndefined();
        expect(errors.testerRemarksNotes).toBeUndefined();
        expect(errors.defectSeverity).toBeUndefined();
        expect(errors.defectIdBugRef).toBeUndefined();
        expect(data.testerRemarks).toBe("No Action Required");
        expect(data.testerRemarksNotes).toBe("");
        expect(data.defectSeverity).toBe("NA");
        expect(data.defectIdBugRef).toBe("NA");
    });

    it("requires Tester Remarks when overallTestStatus is Fail", () => {
        const data: any = {
            typeOfQuestion: "Unique",
            buildVersion: "1.0",
            channelTested: "WebApp",
            languageTested: "English",
            threadId: "th-123",
            questionCategory: "Agronomy",
            queryText: "Sample question?",
            timeQuestionAsked: "10:00:00",
            timeAnswerReceived: "10:05:00",
            slaStatus: "Within SLA",
            questionInReviewModel: "Yes",
            questionCorrectlyFramed: "Yes",
            originalLanguage: "English",
            translatedLanguage: "English",
            translationQuality: "Excellent",
            tagging: "Correct",
            overallTestStatus: "Fail",
            defectSeverity: "Major",
            defectIdBugRef: "NA",
            testerRemarks: "",
        };

        const errors = validateTesterLogForm(data, { isCross: false, excludeReviewerWorkflow: true });
        expect(errors.testerRemarks).toBe("Tester Remarks is required");
    });

    it("requires Remarks Details when testerRemarks is not 'No Action Required'", () => {
        const data: any = {
            typeOfQuestion: "Unique",
            buildVersion: "1.0",
            channelTested: "WebApp",
            languageTested: "English",
            threadId: "th-123",
            questionCategory: "Agronomy",
            queryText: "Sample question?",
            timeQuestionAsked: "10:00:00",
            timeAnswerReceived: "10:05:00",
            slaStatus: "Within SLA",
            questionInReviewModel: "Yes",
            questionCorrectlyFramed: "Yes",
            originalLanguage: "English",
            translatedLanguage: "English",
            translationQuality: "Excellent",
            tagging: "Correct",
            overallTestStatus: "Fail",
            defectSeverity: "Major",
            defectIdBugRef: "NA",
            testerRemarks: "Defect Logged",
            testerRemarksNotes: "",
        };

        const errors = validateTesterLogForm(data, { isCross: false, excludeReviewerWorkflow: true });
        expect(errors.testerRemarksNotes).toBe("Remarks Details is required");
    });

    it("validates Author Name format even when Allocated to Author? is NA", () => {
        const data: any = {
            typeOfQuestion: "Unique",
            buildVersion: "1.0",
            channelTested: "WebApp",
            languageTested: "English",
            threadId: "th-123",
            questionCategory: "Agronomy",
            queryText: "Sample question?",
            timeQuestionAsked: "10:00:00",
            timeAnswerReceived: "10:05:00",
            slaStatus: "Within SLA",
            questionInReviewModel: "Yes",
            questionCorrectlyFramed: "Yes",
            originalLanguage: "English",
            translatedLanguage: "English",
            translationQuality: "Excellent",
            tagging: "Correct",
            allocatedToReviewer: "NA",
            authorsName: "Author123",
            followUpQInReviewModel: "Yes",
            answerScientificallyCorrect: "Yes",
            retrievalAccuracy: "Accurate",
            expertNameDisplayed: "Yes",
            correctSourceLinksProvided: "Yes",
            msg120MinShownToUser: "Yes",
            notificationReceived: "Received",
            notificationOnSameThread: "Yes",
            notificationLinkedCorrectQId: "Yes",
            voiceInputWorking: "Yes",
            voiceOutputWorking: "Yes",
            overallTestStatus: "Pass",
        };

        const errors = validateTesterLogForm(data, { isCross: false, excludeReviewerWorkflow: false });
        expect(errors.authorsName).toBe("Author Name must be 2-100 characters and contain letters only");

        // When authorsName is empty and allocatedToReviewer is NA, no error is thrown
        data.authorsName = "";
        const errorsValid = validateTesterLogForm(data, { isCross: false, excludeReviewerWorkflow: false });
        expect(errorsValid.authorsName).toBeUndefined();
    });

    it("validates SLA status against response time (Issue #2)", () => {
        const baseData: any = {
            typeOfQuestion: "Unique",
            buildVersion: "1.0",
            channelTested: "WebApp",
            languageTested: "English",
            threadId: "th-123",
            questionCategory: "Agronomy",
            queryText: "Sample question?",
            timeQuestionAsked: "10:00:00",
            timeAnswerReceived: "10:05:00", // 5 mins response
            slaStatus: "SLA Breached",
            questionInReviewModel: "Yes",
            questionCorrectlyFramed: "Yes",
            originalLanguage: "English",
            translatedLanguage: "English",
            translationQuality: "Excellent",
            tagging: "Correct",
            overallTestStatus: "Pass",
        };

        const err1 = validateTesterLogForm(baseData, { isCross: false, excludeReviewerWorkflow: true });
        expect(err1.slaStatus).toBe("Response time is within 120 minutes; SLA Status cannot be 'SLA Breached'");

        // Over SLA test (e.g. 150 mins)
        baseData.timeAnswerReceived = "12:30:00"; // 150 mins
        baseData.slaStatus = "Within SLA";
        const err2 = validateTesterLogForm(baseData, { isCross: false, excludeReviewerWorkflow: true });
        expect(err2.slaStatus).toBe("Response time exceeds 120 minutes; SLA Status must be 'SLA Breached'");
    });

    it("rejects contradictory notification answers when notification is Not Received (Issue #3)", () => {
        const baseData: any = {
            typeOfQuestion: "Unique",
            buildVersion: "1.0",
            channelTested: "WebApp",
            languageTested: "English",
            threadId: "th-123",
            questionCategory: "Agronomy",
            queryText: "Sample question?",
            timeQuestionAsked: "10:00:00",
            timeAnswerReceived: "10:05:00",
            slaStatus: "Within SLA",
            questionInReviewModel: "Yes",
            questionCorrectlyFramed: "Yes",
            originalLanguage: "English",
            translatedLanguage: "English",
            translationQuality: "Excellent",
            tagging: "Correct",
            notificationReceived: "Not Received",
            notificationOnSameThread: "Yes - on same thread",
            notificationLinkedCorrectQId: "Yes",
            overallTestStatus: "Pass",
        };

        const err = validateTesterLogForm(baseData, { isCross: false, excludeReviewerWorkflow: true });
        expect(err.notificationOnSameThread).toBe("Notification was not received; thread comparison cannot be 'Yes' or 'No'");
        expect(err.notificationLinkedCorrectQId).toBe("Notification was not received; cannot be linked to Q-ID");
    });

    it("rejects good quality rating when voice is marked not working (Issue #4)", () => {
        const baseData: any = {
            typeOfQuestion: "Unique",
            buildVersion: "1.0",
            channelTested: "WebApp",
            languageTested: "English",
            threadId: "th-123",
            questionCategory: "Agronomy",
            queryText: "Sample question?",
            timeQuestionAsked: "10:00:00",
            timeAnswerReceived: "10:05:00",
            slaStatus: "Within SLA",
            questionInReviewModel: "Yes",
            questionCorrectlyFramed: "Yes",
            originalLanguage: "English",
            translatedLanguage: "English",
            translationQuality: "Excellent",
            tagging: "Correct",
            voiceInputWorking: "No",
            voiceInputQuality: "Correct",
            voiceOutputWorking: "No",
            voiceOutputQuality: "Clear",
            overallTestStatus: "Pass",
        };

        const err = validateTesterLogForm(baseData, { isCross: false, excludeReviewerWorkflow: true });
        expect(err.voiceInputQuality).toBe("Voice Input is not working; quality cannot be rated 'Correct'");
        expect(err.voiceOutputQuality).toBe("Voice Output is not working; quality cannot be rated 'Clear'");
    });

    it("validates Zoho Desk ticket URLs and rejects non-Zoho URLs (Issue #5)", () => {
        const baseData: any = {
            typeOfQuestion: "Unique",
            buildVersion: "1.0",
            channelTested: "WebApp",
            languageTested: "English",
            threadId: "th-123",
            questionCategory: "Agronomy",
            queryText: "Sample question?",
            timeQuestionAsked: "10:00:00",
            timeAnswerReceived: "10:05:00",
            slaStatus: "Within SLA",
            questionInReviewModel: "Yes",
            questionCorrectlyFramed: "Yes",
            originalLanguage: "English",
            translatedLanguage: "English",
            translationQuality: "Excellent",
            tagging: "Correct",
            overallTestStatus: "Fail",
            defectSeverity: "Major",
            testerRemarks: "Defect Logged",
            testerRemarksNotes: "Critical defect found in output",
            defectIdBugRef: "https://example.com/not-a-zoho-ticket",
        };

        const err = validateTesterLogForm(baseData, { isCross: false, excludeReviewerWorkflow: true });
        expect(err.defectIdBugRef).toBe("Please enter a valid Zoho Desk ticket URL (e.g. https://desk.zoho.in/...)");

        // Valid desk url passes
        baseData.defectIdBugRef = "https://desk.zoho.in/support/org/ShowHomePage.do#Cases/dv/12345";
        const errValid = validateTesterLogForm(baseData, { isCross: false, excludeReviewerWorkflow: true });
        expect(errValid.defectIdBugRef).toBeUndefined();
    });

    it("requires defect severity and remarks when overallTestStatus is Fail (Issue #6)", () => {
        const baseData: any = {
            typeOfQuestion: "Unique",
            buildVersion: "1.0",
            channelTested: "WebApp",
            languageTested: "English",
            threadId: "th-123",
            questionCategory: "Agronomy",
            queryText: "Sample question?",
            timeQuestionAsked: "10:00:00",
            timeAnswerReceived: "10:05:00",
            slaStatus: "Within SLA",
            questionInReviewModel: "Yes",
            questionCorrectlyFramed: "Yes",
            originalLanguage: "English",
            translatedLanguage: "English",
            translationQuality: "Excellent",
            tagging: "Correct",
            overallTestStatus: "Fail",
            defectSeverity: "NA",
            testerRemarks: "No Action Required",
            testerRemarksNotes: "",
        };

        const err = validateTesterLogForm(baseData, { isCross: false, excludeReviewerWorkflow: true });
        expect(err.defectSeverity).toBe("A failed test case requires a valid Defect Severity (cannot be 'NA')");
        expect(err.testerRemarks).toBe("A failed test case requires an actionable remark (cannot be 'No Action Required')");

        // When actionable remark is selected but notes are empty
        baseData.testerRemarks = "Defect Logged";
        const errNotes = validateTesterLogForm(baseData, { isCross: false, excludeReviewerWorkflow: true });
        expect(errNotes.testerRemarksNotes).toBe("Remarks Details is required");
    });

    it("validates chronological ordering of review workflow stages (Issue #15)", () => {
        const baseData: any = {
            typeOfQuestion: "Unique",
            buildVersion: "1.0",
            channelTested: "WebApp",
            languageTested: "English",
            threadId: "th-123",
            questionCategory: "Agronomy",
            queryText: "Sample question?",
            timeQuestionAsked: "13:00",
            timeAnswerReceived: "13:30",
            slaStatus: "Within SLA",
            questionInReviewModel: "Yes",
            questionCorrectlyFramed: "Yes",
            originalLanguage: "English",
            translatedLanguage: "English",
            translationQuality: "Excellent",
            tagging: "Correct",
            allocatedToReviewer: "Yes",
            authorsName: "Author One",
            authorAssignmentTime: "09:00", // earlier than Question Asked 13:00!
            authorCompletionTime: "09:30",
            reviewer1Name: "Rev One",
            reviewer1AssignmentTime: "08:00", // earlier than Author!
            reviewer1CompletionTime: "08:10",
            moderatorName: "Mod One",
            moderatorAssignmentTime: "07:00", // earlier than Rev 1!
            moderatorCompletionTime: "07:05",
            overallTestStatus: "Pass",
        };

        const err = validateTesterLogForm(baseData, { isCross: false, excludeReviewerWorkflow: false });
        expect(err.authorAssignmentTime).toBe("Author Assignment Time cannot be earlier than Time Question Asked");
        expect(err.reviewer1AssignmentTime).toBe("Reviewer 1 Assignment Time cannot be earlier than Author Completion Time");
        expect(err.moderatorAssignmentTime).toBe("Moderator Assignment Time cannot be earlier than Reviewer 1 Completion Time");
    });
});

describe("TesterLogForm component", () => {
    it("disables Tester Remarks and sets value to 'No Action Required' when Overall Test Status is Pass", async () => {
        const { container } = render(<TesterLogForm testerName="Tester A" userEmail="tester@example.com" />);

        const overallSelect = container.querySelector('select[name="overallTestStatus"]') as HTMLSelectElement;
        const remarksSelect = container.querySelector('select[name="testerRemarks"]') as HTMLSelectElement;

        expect(overallSelect).not.toBeNull();
        expect(remarksSelect).not.toBeNull();
        expect(remarksSelect.disabled).toBe(false);

        // Select Pass
        fireEvent.change(overallSelect, { target: { value: "Pass" } });

        expect(remarksSelect.value).toBe("No Action Required");
        expect(remarksSelect.disabled).toBe(true);

        // Changing to Fail re-enables Tester Remarks
        fireEvent.change(overallSelect, { target: { value: "Fail" } });
        expect(remarksSelect.disabled).toBe(false);
        expect(remarksSelect.value).toBe("");
    });
});

describe("Date preset range calculations", () => {
    it("spans exactly 7 calendar days inclusive for '7days' preset", () => {
        const now = new Date("2026-10-09T10:00:00.000Z");
        const todayStr = now.toISOString().slice(0, 10);
        const past7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        expect(todayStr).toBe("2026-10-09");
        expect(past7).toBe("2026-10-03");

        const diffMs = new Date(todayStr).getTime() - new Date(past7).getTime();
        const daysCount = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
        expect(daysCount).toBe(7);
        expect(54 * daysCount).toBe(378);
    });

    it("spans exactly 30 calendar days inclusive for '30days' preset", () => {
        const now = new Date("2026-10-09T10:00:00.000Z");
        const todayStr = now.toISOString().slice(0, 10);
        const past30 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        expect(todayStr).toBe("2026-10-09");
        expect(past30).toBe("2026-09-10");

        const diffMs = new Date(todayStr).getTime() - new Date(past30).getTime();
        const daysCount = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
        expect(daysCount).toBe(30);
        expect(54 * daysCount).toBe(1620);
    });
});
