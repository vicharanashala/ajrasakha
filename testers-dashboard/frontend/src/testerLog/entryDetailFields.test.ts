import { describe, it, expect } from "vitest";
import {
    CROSS_PLATFORM_FIELD_PAIRS,
    CROSS_PLATFORM_ONLY_KEYS,
    ENTRY_DETAIL_GROUPS,
    entryDetailGroupsFor,
} from "./entryDetailFields";
import { synthesizeOverallTestStatus } from "./types";

const keysOf = (groups: typeof ENTRY_DETAIL_GROUPS) => groups.flatMap((g) => g.fields.map((f) => f.key));

describe("entryDetailGroupsFor", () => {
    it("leaves a single-channel entry's groups exactly as they are", () => {
        expect(entryDetailGroupsFor(false)).toBe(ENTRY_DETAIL_GROUPS);
    });

    it("never lists a WhatsApp-side field in the general groups, for any entry", () => {
        const waKeys = CROSS_PLATFORM_FIELD_PAIRS.map((p) => p.waKey);
        for (const isCross of [false, true]) {
            const keys = keysOf(entryDetailGroupsFor(isCross));
            for (const k of waKeys) expect(keys).not.toContain(k);
        }
    });

    it("moves a Both entry's per-channel fields into the comparison, dropping the emptied Timing & SLA group", () => {
        const groups = entryDetailGroupsFor(true);
        const keys = keysOf(groups);
        for (const { webKey } of CROSS_PLATFORM_FIELD_PAIRS) expect(keys).not.toContain(webKey);
        expect(groups.map((g) => g.title)).not.toContain("Timing & SLA");
        // Shared fields stay where they were.
        expect(keys).toContain("channelTested");
        expect(keys).toContain("overallTestStatus");
        expect(keys).toContain("notificationOnSameThread");
        expect(keys).toContain("voiceInputQuality");
    });

    it("lists the cross-platform-only keys the admin editor hides off a Both entry", () => {
        expect(CROSS_PLATFORM_ONLY_KEYS).toEqual(expect.arrayContaining([
            "waThreadId", "waResponseTimeMins", "waOverallTestStatus", "webOverallTestStatus", "crossPlatformDiscrepancyNotes",
        ]));
        // The Web App half lives in the common fields, which are never hidden.
        expect(CROSS_PLATFORM_ONLY_KEYS).not.toContain("threadId");
        expect(CROSS_PLATFORM_ONLY_KEYS).not.toContain("slaStatus");
    });
});

describe("synthesizeOverallTestStatus", () => {
    it.each([
        ["Pass", "Pass", "Pass"],
        ["Fail", "Fail", "Fail"],
        ["NA", "NA", "NA"],
        ["pass", "PASS", "Pass"],
        ["Pass", "Fail", "Partial"],
        ["Partial", "Partial", "Partial"],
        ["Pass", "NA", "Partial"],
    ])("web %s + WhatsApp %s -> %s", (web, wa, expected) => {
        expect(synthesizeOverallTestStatus(web, wa)).toBe(expected);
    });

    it("is undefined until both statuses are set", () => {
        expect(synthesizeOverallTestStatus("Pass", "")).toBeUndefined();
        expect(synthesizeOverallTestStatus(undefined, "Fail")).toBeUndefined();
    });
});
