// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ITesterLogEntry } from "../types";

const mutate = vi.fn();
vi.mock("../hooks/useTesterLogAdminActions", () => ({
    useUpdateTesterLogEntry: () => ({ mutate, isPending: false }),
    useDeleteTesterLogEntry: () => ({ mutate: vi.fn(), isPending: false }),
}));

const pageOf = (entries: ITesterLogEntry[]) => ({
    data: { success: true, entries, total: entries.length, page: 1, limit: 25, totalPages: 1 },
    isLoading: false,
    isError: false,
});
let tableEntries: ITesterLogEntry[] = [];
vi.mock("../hooks/useTesterLogHistory", () => ({
    useTesterOptions: () => ({ data: [] }),
    useTesterLogSummary: () => ({ data: undefined }),
    useAllTesterLogEntries: () => pageOf(tableEntries),
}));

import { TesterEntryDetailDialog } from "./TesterEntryDetailDialog";
import { TesterEntryEditDialog } from "./TesterEntryEditDialog";
import { TesterDataView } from "./TesterDataView";

beforeAll(() => {
    // Radix ScrollArea / Select measure themselves; jsdom has no layout.
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});
beforeEach(() => mutate.mockReset());
afterEach(cleanup);

const base: ITesterLogEntry = {
    _id: "64b7f0c2a1b2c3d4e5f60718",
    testId: "T-100",
    sprintCycle: "Sprint 7",
    testerName: "Tester One",
    testDate: "2026-09-01",
    typeOfQuestion: "Unique",
    threadId: "web-thread-1",
    timeQuestionAsked: "2026-09-01T10:00:00",
    timeAnswerReceived: "2026-09-01T10:05:00",
    responseTimeMins: "00:05:00",
    slaStatus: "Within SLA",
    notificationReceived: "Yes",
    voiceInputWorking: "Yes",
    voiceOutputWorking: "No",
    overallTestStatus: "Partial",
};

const webOnly: ITesterLogEntry = {
    ...base,
    channelTested: "WebApp",
    // Stale values from before the channel was changed - must not show.
    waThreadId: "stale-wa-thread",
    waResponseTimeMins: "00:09:09",
};
const whatsAppOnly: ITesterLogEntry = { ...base, channelTested: "WhatsApp", threadId: "wa-only-thread" };
const both: ITesterLogEntry = {
    ...base,
    channelTested: "Both",
    waThreadId: "wa-thread-1",
    waTimeQuestionAsked: "2026-09-01T11:00:00",
    waTimeAnswerReceived: "2026-09-01T11:03:00",
    waResponseTimeMins: "00:03:00",
    waSlaStatus: "SLA Breached",
    waNotificationReceived: "Received Late",
    waVoiceInputWorking: "No",
    waVoiceOutputWorking: "Yes",
    webOverallTestStatus: "Pass",
    waOverallTestStatus: "Fail",
    crossPlatformDiscrepancyNotes: "WhatsApp answer was truncated",
};
// A Both entry saved before the WhatsApp fields existed.
const oldBoth: ITesterLogEntry = { ...base, channelTested: "Both" };

function openView(entry: ITesterLogEntry) {
    render(<TesterEntryDetailDialog entry={entry} />);
    fireEvent.click(screen.getByRole("button", { name: /view/i }));
    return screen.getByRole("dialog");
}

type Platform = "WebApp" | "WhatsApp";

function tab(dialog: HTMLElement, name: Platform) {
    return within(dialog).getByRole("tab", { name: new RegExp(`^${name}`) });
}

// Radix Tabs switches on mousedown, not click.
function selectTab(dialog: HTMLElement, name: Platform) {
    fireEvent.mouseDown(tab(dialog, name), { button: 0 });
}

// Only the selected platform's panel is mounted.
function panel(dialog: HTMLElement) {
    return within(within(dialog).getByRole("tabpanel"));
}

// The value shown under a field label.
function valueIn(scope: ReturnType<typeof panel>, label: string) {
    return scope.getByText(label).nextElementSibling?.textContent;
}

// The summary strip's value for e.g. "WhatsApp Response Time".
function summaryValue(dialog: HTMLElement, label: string) {
    const strip = dialog.querySelector('[aria-label="Cross-platform summary"]')!;
    const dt = [...strip.querySelectorAll("dt")].find((d) => d.textContent === label);
    return dt?.nextElementSibling?.textContent;
}

describe("Test ID", () => {
    it("View shows the tester-entered Test ID, never the database id", () => {
        const dialog = openView(webOnly);
        expect(dialog.textContent).not.toContain(webOnly._id);
        expect(dialog.textContent).not.toContain("TL-005");
        expect(dialog.textContent).toContain("Test ID: T-100");
        expect(within(dialog).getByText("Test ID").nextElementSibling?.textContent).toBe("T-100");
    });

    it("Edit shows the tester-entered Test ID as an editable field, never the database id", () => {
        const dialog = openEdit(webOnly);
        expect(dialog.textContent).not.toContain(webOnly._id);
        expect(dialog.textContent).not.toContain("TL-005");
        fireEvent.change(input("testId")!, { target: { value: "T-101" } });
        save();
        expect(mutate).toHaveBeenCalledWith({ id: webOnly._id, changes: { testId: "T-101" } }, expect.anything());
    });

    it("an entry without a Test ID shows —", () => {
        const dialog = openView({ ...webOnly, testId: undefined });
        expect(dialog.textContent).toContain("Test ID: —");
    });
});

describe("Sprint Cycle", () => {
    it("is not shown in View, even when the entry has one", () => {
        const dialog = openView(webOnly);
        expect(dialog.textContent).not.toMatch(/Sprint/i);
        expect(within(dialog).getByText("Build / Version")).toBeTruthy();
    });

    it("is not shown in Edit, and saving other fields does not send it", () => {
        const dialog = openEdit(webOnly);
        expect(dialog.textContent).not.toMatch(/Sprint/i);
        expect(input("sprintCycle")).toBeNull();
        fireEvent.change(input("slaStatus")!, { target: { value: "SLA Breached" } });
        save();
        expect(mutate.mock.calls[0][0].changes).toEqual({ slaStatus: "SLA Breached" });
    });
});

describe("View Details", () => {
    it.each([
        ["WebApp-only", webOnly],
        ["WhatsApp-only", whatsAppOnly],
    ])("a %s entry keeps the single-channel layout", (_label, entry) => {
        const dialog = openView(entry);
        expect(within(dialog).queryByText("Cross-Platform Comparison")).toBeNull();
        expect(within(dialog).queryByText("Cross-Platform Discrepancy Notes")).toBeNull();
        expect(within(dialog).queryAllByRole("tab")).toHaveLength(0);
        expect(within(dialog).getByText("Timing & SLA")).toBeTruthy();
        expect(within(dialog).getByText(entry.threadId!)).toBeTruthy();
        expect(within(dialog).queryByText("stale-wa-thread")).toBeNull();
        expect(within(dialog).queryByText("00:09:09")).toBeNull();
    });

    it("a Both entry opens on the WebApp tab, showing only WebApp fields", () => {
        const dialog = openView(both);
        expect(within(dialog).getByText("Cross-Platform Comparison")).toBeTruthy();
        expect(within(dialog).getAllByText("Cross-Platform").length).toBeGreaterThan(0);
        // The per-channel fields moved out of their usual group.
        expect(within(dialog).queryByText("Timing & SLA")).toBeNull();

        expect(tab(dialog, "WebApp").getAttribute("aria-selected")).toBe("true");
        expect(tab(dialog, "WhatsApp").getAttribute("aria-selected")).toBe("false");
        const web = panel(dialog);
        expect(valueIn(web, "Thread ID")).toBe("web-thread-1");
        expect(valueIn(web, "Response Time [Auto]")).toBe("00:05:00");
        expect(valueIn(web, "SLA Status")).toBe("Within SLA");
        expect(valueIn(web, "Notification Received?")).toBe("Yes");
        expect(valueIn(web, "Voice Output Working?")).toBe("No");
        expect(valueIn(web, "Web Overall Test Status")).toBe("Pass");
        expect(valueIn(web, "Time Question Asked")).not.toBe("—");
        expect(web.queryByText(/^WhatsApp /)).toBeNull();
        expect(within(dialog).queryByText("wa-thread-1")).toBeNull();
    });

    it("the WhatsApp tab shows only the WhatsApp fields", () => {
        const dialog = openView(both);
        selectTab(dialog, "WhatsApp");
        expect(tab(dialog, "WhatsApp").getAttribute("aria-selected")).toBe("true");

        const wa = panel(dialog);
        expect(valueIn(wa, "WhatsApp Thread ID")).toBe("wa-thread-1");
        expect(valueIn(wa, "WhatsApp Response Time [Auto]")).toBe("00:03:00");
        expect(valueIn(wa, "WhatsApp SLA Status")).toBe("SLA Breached");
        expect(valueIn(wa, "WhatsApp Notification Received?")).toBe("Received Late");
        expect(valueIn(wa, "WhatsApp Voice Input Working?")).toBe("No");
        expect(valueIn(wa, "WhatsApp Voice Output Working?")).toBe("Yes");
        expect(valueIn(wa, "WhatsApp Overall Test Status")).toBe("Fail");
        expect(valueIn(wa, "WhatsApp Time Answer Received")).not.toBe("—");
        expect(within(dialog).queryByText("web-thread-1")).toBeNull();
    });

    it("the summary compares both platforms without switching tabs, and the notes sit below", () => {
        const dialog = openView(both);
        expect(summaryValue(dialog, "WebApp Response Time")).toBe("00:05:00");
        expect(summaryValue(dialog, "WhatsApp Response Time")).toBe("00:03:00");
        expect(summaryValue(dialog, "WebApp Overall Test Status")).toBe("Pass");
        expect(summaryValue(dialog, "WhatsApp Overall Test Status")).toBe("Fail");

        const notes = within(dialog).getByText("Cross-Platform Discrepancy Notes").closest("section") as HTMLElement;
        expect(valueIn(within(notes), "WebApp vs WhatsApp Discrepancy Notes")).toBe("WhatsApp answer was truncated");
    });

    it("an old Both entry without WhatsApp fields shows fallbacks", () => {
        const dialog = openView(oldBoth);
        expect(summaryValue(dialog, "WhatsApp Response Time")).toBe("—");
        expect(summaryValue(dialog, "WhatsApp Overall Test Status")).toBe("—");
        expect(summaryValue(dialog, "WebApp Response Time")).toBe("00:05:00");

        selectTab(dialog, "WhatsApp");
        const wa = panel(dialog);
        for (const label of [
            "WhatsApp Thread ID", "WhatsApp Time Question Asked", "WhatsApp Response Time [Auto]",
            "WhatsApp SLA Status", "WhatsApp Overall Test Status",
        ]) {
            expect(valueIn(wa, label)).toBe("—");
        }
        const notes = within(dialog).getByText("Cross-Platform Discrepancy Notes").closest("section") as HTMLElement;
        expect(within(notes).getByText("No discrepancies noted.")).toBeTruthy();
    });
});

function openEdit(entry: ITesterLogEntry) {
    render(<TesterEntryEditDialog entry={entry} open onOpenChange={() => {}} />);
    return screen.getByRole("dialog");
}
const input = (key: keyof ITesterLogEntry) =>
    document.getElementById(`tester-entry-edit-${key}`) as HTMLInputElement | HTMLSelectElement | null;
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

describe("Edit", () => {
    it("a WebApp-only entry shows no tabs or WhatsApp inputs and saves as before", () => {
        const dialog = openEdit(webOnly);
        expect(within(dialog).queryAllByRole("tab")).toHaveLength(0);
        expect(input("waThreadId")).toBeNull();
        expect(input("waSlaStatus")).toBeNull();
        fireEvent.change(input("slaStatus")!, { target: { value: "SLA Breached" } });
        save();
        expect(mutate).toHaveBeenCalledWith({ id: webOnly._id, changes: { slaStatus: "SLA Breached" } }, expect.anything());
    });

    it("a Both entry edits WebApp fields on the WebApp tab and WhatsApp fields on the WhatsApp tab", () => {
        const dialog = openEdit(both);
        expect(within(dialog).getByText("Cross-Platform Comparison")).toBeTruthy();
        // WebApp tab first: the web inputs are there, the WhatsApp ones aren't.
        expect(input("slaStatus")).not.toBeNull();
        expect(input("waSlaStatus")).toBeNull();
        expect(input("responseTimeMins")).toBeNull(); // [Auto], read-only
        fireEvent.change(input("threadId")!, { target: { value: "web-thread-2" } });

        selectTab(dialog, "WhatsApp");
        expect(input("slaStatus")).toBeNull();
        expect(input("waResponseTimeMins")).toBeNull(); // [Auto], read-only
        expect(panel(dialog).getByText("00:03:00")).toBeTruthy();
        fireEvent.change(input("waThreadId")!, { target: { value: "wa-thread-2" } });
        fireEvent.change(input("waSlaStatus")!, { target: { value: "Within SLA" } });
        fireEvent.change(input("crossPlatformDiscrepancyNotes")!, { target: { value: "Fixed" } });

        save();
        expect(mutate).toHaveBeenCalledWith({
            id: both._id,
            changes: {
                threadId: "web-thread-2",
                waThreadId: "wa-thread-2",
                waSlaStatus: "Within SLA",
                crossPlatformDiscrepancyNotes: "Fixed",
            },
        }, expect.anything());
    });

    it("keeps edits made on one tab after switching tabs, and badges the tab holding them", () => {
        const dialog = openEdit(both);
        selectTab(dialog, "WhatsApp");
        fireEvent.change(input("waSlaStatus")!, { target: { value: "Within SLA" } });
        selectTab(dialog, "WebApp");
        expect(tab(dialog, "WhatsApp").textContent).toBe("WhatsApp1 changed");
        expect(tab(dialog, "WebApp").textContent).toBe("WebApp");

        selectTab(dialog, "WhatsApp");
        expect(input("waSlaStatus")!.value).toBe("Within SLA");
    });

    it("re-derives Overall Test Status from the channel statuses, as the form does, and the summary follows", () => {
        const dialog = openEdit(both);
        selectTab(dialog, "WhatsApp");
        fireEvent.change(input("waOverallTestStatus")!, { target: { value: "Pass" } });
        expect(input("overallTestStatus")!.value).toBe("Pass");
        expect(summaryValue(dialog, "WhatsApp Overall Test Status")).toBe("Pass");
        // Still overridable afterwards.
        fireEvent.change(input("overallTestStatus")!, { target: { value: "Fail" } });
        save();
        expect(mutate.mock.calls[0][0].changes).toEqual({ waOverallTestStatus: "Pass", overallTestStatus: "Fail" });
    });

    it("switching a single-channel entry to Both reveals the tabs", () => {
        const dialog = openEdit(whatsAppOnly);
        expect(within(dialog).queryAllByRole("tab")).toHaveLength(0);
        fireEvent.change(input("channelTested")!, { target: { value: "Both" } });
        expect(within(dialog).getAllByRole("tab")).toHaveLength(2);
        selectTab(dialog, "WhatsApp");
        expect(input("waSlaStatus")).not.toBeNull();
    });

    it("does not send hidden WhatsApp edits once the channel is switched away from Both", () => {
        const dialog = openEdit(both);
        selectTab(dialog, "WhatsApp");
        fireEvent.change(input("waSlaStatus")!, { target: { value: "Within SLA" } });
        fireEvent.change(input("channelTested")!, { target: { value: "WebApp" } });
        expect(within(dialog).queryAllByRole("tab")).toHaveLength(0);
        save();
        expect(mutate.mock.calls[0][0].changes).toEqual({ channelTested: "WebApp" });
    });

    it("an old Both entry without WhatsApp fields opens with them empty and saves only what changed", () => {
        const dialog = openEdit(oldBoth);
        selectTab(dialog, "WhatsApp");
        expect(input("waThreadId")!.value).toBe("");
        fireEvent.change(input("waThreadId")!, { target: { value: "wa-new" } });
        save();
        expect(mutate.mock.calls[0][0].changes).toEqual({ waThreadId: "wa-new" });
    });
});

describe("Tester Data table", () => {
    it("shows Both as plain text like the other channels, with both response times", () => {
        tableEntries = [
            both,
            { ...webOnly, _id: "64b7f0c2a1b2c3d4e5f60719" },
            { ...oldBoth, _id: "64b7f0c2a1b2c3d4e5f6071a" },
            { ...whatsAppOnly, _id: "64b7f0c2a1b2c3d4e5f6071b" },
        ];
        render(<TesterDataView />);
        const [header, bothRow, webRow, oldBothRow, waRow] = screen.getAllByRole("row");

        // Channel Tested: identical markup for every channel - only the text differs.
        const channelCol = within(header).getAllByRole("columnheader").findIndex((th) => th.textContent === "Channel Tested");
        const channelCell = (row: HTMLElement) => within(row).getAllByRole("cell")[channelCol];
        expect(channelCell(bothRow).textContent).toBe("Both");
        expect(channelCell(webRow).textContent).toBe("WebApp");
        expect(channelCell(waRow).textContent).toBe("WhatsApp");

        // Test ID column: the tester-entered ID, never the database id.
        expect(within(header).getAllByRole("columnheader").map((th) => th.textContent)).toContain("Test ID");
        expect(within(bothRow).getAllByRole("cell")[1].textContent).toBe("T-100");
        for (const row of [bothRow, webRow, oldBothRow, waRow]) {
            expect(row.textContent).not.toMatch(/64b7f0c2a1b2c3d4e5f607/);
        }
        const markup = (row: HTMLElement) => channelCell(row).innerHTML.replace(/Both|WebApp|WhatsApp/g, "");
        expect(markup(bothRow)).toBe(markup(webRow));
        expect(markup(waRow)).toBe(markup(webRow));

        expect(bothRow.textContent).toContain("Web 00:05:00");
        expect(bothRow.textContent).toContain("WA 00:03:00");

        expect(within(webRow).getByText("00:05:00")).toBeTruthy();
        expect(webRow.textContent).not.toContain("00:09:09");

        expect(oldBothRow.textContent).toContain("WA —");
    });
});
