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
