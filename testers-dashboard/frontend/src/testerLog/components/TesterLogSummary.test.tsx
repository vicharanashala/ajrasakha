// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { TesterLogSummary } from "./TesterLogSummary";
import { TesterLogHistory } from "./TesterLogHistory";

const mockSummary = {
    totalTests: 1,
    passed: 1,
    failed: 0,
    expectedOutput: 0,
    anomalyFound: 0,
    passRate: 100,
    failRate: 0,
    slaMetRate: 100,
    slaMet: 1,
    slaBreached: 0,
    avgResponseMinutes: 5,
    totalDefects: 0,
    defectsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    byQuestionType: { Unique: 1 },
    byChannel: { WebApp: 1 },
    byLanguage: { English: 1 },
    scientificAccuracy: { rate: 100, correct: 1, incorrect: 0, totalChecked: 1 },
    voiceStats: { inputWorking: 0, outputWorking: 0 },
    crossPlatformStats: { parityRate: 0, matchedAnswers: 0, totalCrossPlatform: 0 },
    targetVsAchieved: {
        daysCount: 1,
        rows: [
            { questionType: "Unique", targetTotal: 8, achievedTotal: 1, targetWebApp: 4, achievedWebApp: 1, targetWhatsApp: 4, achievedWhatsApp: 0, completionRate: 12.5 },
            { questionType: "GDB", targetTotal: 8, achievedTotal: 0, targetWebApp: 4, achievedWebApp: 0, targetWhatsApp: 4, achievedWhatsApp: 0, completionRate: 0 },
            { questionType: "Outreach", targetTotal: 11, achievedTotal: 0, targetWebApp: 6, achievedWebApp: 0, targetWhatsApp: 5, achievedWhatsApp: 0, completionRate: 0 },
            { questionType: "Dynamic - Weather", targetTotal: 19, achievedTotal: 0, targetWebApp: 9, achievedWebApp: 0, targetWhatsApp: 10, achievedWhatsApp: 0, completionRate: 0 },
            { questionType: "Dynamic - Scheme", targetTotal: 6, achievedTotal: 0, targetWebApp: 3, achievedWebApp: 0, targetWhatsApp: 3, achievedWhatsApp: 0, completionRate: 0 },
            { questionType: "Dynamic - Mandi", targetTotal: 2, achievedTotal: 0, targetWebApp: 1, achievedWebApp: 0, targetWhatsApp: 1, achievedWhatsApp: 0, completionRate: 0 },
            { questionType: "Static Dynamic", targetTotal: 0, achievedTotal: 0, targetWebApp: 0, achievedWebApp: 0, targetWhatsApp: 0, achievedWhatsApp: 0, completionRate: 0 },
        ],
        total: {
            questionType: "Total",
            targetTotal: 54,
            achievedTotal: 1,
            rawAchievedTotal: 1,
            targetWebApp: 27,
            achievedWebApp: 1,
            rawAchievedWebApp: 1,
            targetWhatsApp: 27,
            achievedWhatsApp: 0,
            rawAchievedWhatsApp: 0,
            completionRate: 1.9,
        },
    },
};

const mockEntry = {
    _id: "entry-1",
    testDate: "2026-10-09",
    testId: "TL-0001",
    typeOfQuestion: "Unique",
    buildVersion: "1.0",
    channelTested: "WebApp",
    languageTested: "English",
    threadId: "th-123",
    queryText: "How to grow wheat?",
    timeQuestionAsked: "10:00:00",
    timeAnswerReceived: "10:05:00",
    responseTimeMins: "00:05:00",
    slaStatus: "Within SLA",
    questionInReviewModel: "Yes",
    questionCorrectlyFramed: "Yes",
    originalLanguage: "English",
    translatedLanguage: "English",
    translationQuality: "Excellent",
    translationErrorType: "NA",
    tagging: "Correct",
    allocatedToReviewer: "Yes",
    authorsName: "Author One",
    authorAssignmentTime: "10:01:00",
    authorCompletionTime: "10:03:00",
    authorTatMins: "00:02:00",
    reviewer1Name: "Rev One",
    review1TatMins: "00:01:00",
    reviewer2Name: "Rev Two",
    review2TatMins: "00:01:00",
    moderatorName: "Mod One",
    moderatorTatMins: "00:01:00",
    overallTestStatus: "Pass",
    testerRemarks: "No Action Required",
    createdAt: "2026-10-09T10:06:00.000Z",
};

vi.mock("../hooks/useTesterLogSummary", () => ({
    useTesterLogSummary: () => ({
        data: mockSummary,
        isLoading: false,
        isError: false,
    }),
}));

vi.mock("../hooks/useTesterLogHistory", () => ({
    useTesterLogHistory: () => ({
        data: {
            entries: [mockEntry],
            total: 1,
            page: 1,
            totalPages: 1,
        },
        isLoading: false,
        isError: false,
    }),
}));

beforeAll(() => {
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe("TesterLogSummary component", () => {
    it("renders the target vs achieved table for today by default", () => {
        render(<TesterLogSummary />);
        expect(screen.getByText("Target vs. Achieved Comparison Analytics")).toBeTruthy();
        expect(screen.getByText("Today's Target Tracker")).toBeTruthy();
        expect(screen.getAllByText("Unique").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Dynamic - Weather")).toBeTruthy();
        expect(screen.getByText("Static Dynamic")).toBeTruthy();
    });

    it("displays the target vs achieved table for a custom single date just like for today", () => {
        const { container } = render(<TesterLogSummary />);

        // Switch to Custom date preset
        const customButton = screen.getByRole("button", { name: "Custom" });
        fireEvent.click(customButton);

        // Enter single date in From input
        const fromInput = container.querySelector('input[type="date"]') as HTMLInputElement;
        expect(fromInput).not.toBeNull();
        fireEvent.change(fromInput, { target: { value: "2026-10-08" } });

        // Header tracker badge should display Target Tracker for that specific single date
        expect(screen.getByText("Target Tracker (2026-10-08)")).toBeTruthy();
        expect(screen.getByText(/Daily testing targets for 2026-10-08 \(54 total: 27 Web App, 27 WhatsApp\)/)).toBeTruthy();
        expect(screen.getByText("Target vs. Achieved Comparison Analytics")).toBeTruthy();
    });

    it("does not render obsolete sprintCycle or dbPersistence fields", () => {
        render(<TesterLogSummary />);

        // Click test ID to expand the history row
        const testIdBadge = screen.getByText("TL-0001");
        fireEvent.click(testIdBadge);

        expect(screen.queryByText("Sprint / Cycle:")).toBeNull();
        expect(screen.queryByText("Saved in Database:")).toBeNull();
    });

    it("displays reviewer2 and moderator fields in expanded details", () => {
        render(<TesterLogSummary />);

        const testIdBadge = screen.getByText("TL-0001");
        fireEvent.click(testIdBadge);

        expect(screen.getByText("Reviewer 2 Name:")).toBeTruthy();
        expect(screen.getByText("Rev Two")).toBeTruthy();
        expect(screen.getByText("Moderator Name:")).toBeTruthy();
        expect(screen.getByText("Mod One")).toBeTruthy();
    });
});

describe("TesterLogHistory component", () => {
    it("renders search box, status tabs, and 11 column table headers", () => {
        render(<TesterLogHistory />);
        expect(screen.getByPlaceholderText("Search thread, query, defect...")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Pass" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Defects" })).toBeTruthy();

        expect(screen.getByText("Category / Type")).toBeTruthy();
        expect(screen.getByText("Channel / Lang")).toBeTruthy();
        expect(screen.getByText("SLA")).toBeTruthy();
        expect(screen.getByText("Defect")).toBeTruthy();
    });

    it("does not render obsolete sprintCycle and renders full expanded reviewer details", () => {
        render(<TesterLogHistory />);

        const testIdBadge = screen.getByText("TL-0001");
        fireEvent.click(testIdBadge);

        expect(screen.queryByText("Sprint / Cycle:")).toBeNull();
        expect(screen.getByText("Reviewer 2 Name:")).toBeTruthy();
        expect(screen.getByText("Rev Two")).toBeTruthy();
    });
});
