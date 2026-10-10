import { describe, it, expect } from "vitest";
import { parseToMs, hmsDiff, isTimeEarlier, isTimeInFuture, getLocalDatetimeMax } from "./timingUtils";
import { TRANSLATION_ERROR_MAP, getTranslationErrorOptions } from "../types";

describe("timingUtils", () => {
    describe("parseToMs", () => {
        it("returns null for empty or undefined input", () => {
            expect(parseToMs()).toBeNull();
            expect(parseToMs("")).toBeNull();
            expect(parseToMs("   ")).toBeNull();
        });

        it("parses HH:MM and HH:MM:SS format", () => {
            expect(parseToMs("01:00:00")).toBe(3600 * 1000);
            expect(parseToMs("12:30:00")).toBe((12 * 3600 + 30 * 60) * 1000);
            expect(parseToMs("12:00")).toBe(12 * 3600 * 1000);
        });

        it("parses ISO datetime strings", () => {
            const ms = parseToMs("2026-10-05T12:00:00");
            expect(ms).not.toBeNull();
            expect(new Date(ms!).getUTCHours()).toBeDefined();
        });
    });

    describe("isTimeEarlier", () => {
        it("returns false if either timestamp is missing or invalid", () => {
            expect(isTimeEarlier("11:00", "")).toBe(false);
            expect(isTimeEarlier("", "12:00")).toBe(false);
            expect(isTimeEarlier(undefined, "12:00")).toBe(false);
        });

        it("detects when end time is earlier than start time (anomaly case TL-0057)", () => {
            expect(isTimeEarlier("11:00:00", "12:00:00")).toBe(true);
            expect(isTimeEarlier("11:00", "12:00")).toBe(true);
            expect(isTimeEarlier("2026-10-05T11:00:00", "2026-10-05T12:00:00")).toBe(true);
        });

        it("returns false when end time is later than start time", () => {
            expect(isTimeEarlier("12:00:05", "12:00:00")).toBe(false);
            expect(isTimeEarlier("13:00", "12:00")).toBe(false);
        });

        it("returns false when start and end times are identical", () => {
            expect(isTimeEarlier("12:00:00", "12:00:00")).toBe(false);
        });
    });

    describe("isTimeInFuture", () => {
        const fixedNow = new Date("2026-10-05T12:00:00Z").getTime();

        it("returns false for empty or undefined input", () => {
            expect(isTimeInFuture(undefined, undefined, fixedNow)).toBe(false);
            expect(isTimeInFuture("", undefined, fixedNow)).toBe(false);
        });

        it("detects future years (anomaly case TL-0058: year 2030)", () => {
            expect(isTimeInFuture("2030-01-01T10:00:00", undefined, fixedNow)).toBe(true);
            expect(isTimeInFuture("2030-01-01T10:05:00", undefined, fixedNow)).toBe(true);
            expect(isTimeInFuture("2030-01-01T10:00", undefined, fixedNow)).toBe(true);
        });

        it("returns false for past or current timestamps", () => {
            expect(isTimeInFuture("2026-10-01T10:00:00", undefined, fixedNow)).toBe(false);
            expect(isTimeInFuture("2026-10-05T11:59:00Z", undefined, fixedNow)).toBe(false);
        });

        it("allows timestamps within the 5-minute grace period", () => {
            // 2 minutes into the future (within 5-min grace)
            const twoMinFuture = new Date(fixedNow + 2 * 60 * 1000).toISOString();
            expect(isTimeInFuture(twoMinFuture, undefined, fixedNow)).toBe(false);

            // 10 minutes into the future (beyond 5-min grace)
            const tenMinFuture = new Date(fixedNow + 10 * 60 * 1000).toISOString();
            expect(isTimeInFuture(tenMinFuture, undefined, fixedNow)).toBe(true);
        });

        it("detects future time on same day when defaultDate is provided", () => {
            const today = "2026-10-05";
            const noon = new Date("2026-10-05T12:00:00").getTime();
            // 11:00 AM is past
            expect(isTimeInFuture("11:00:00", today, noon)).toBe(false);
            // 15:00 PM is future relative to noon
            expect(isTimeInFuture("15:00:00", today, noon)).toBe(true);
        });
    });

    describe("getLocalDatetimeMax", () => {
        it("returns a valid datetime-local string format", () => {
            const maxStr = getLocalDatetimeMax();
            expect(maxStr).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
        });
    });

    describe("hmsDiff", () => {
        it("computes HH:MM:SS difference correctly", () => {
            expect(hmsDiff("12:00:00", "12:01:30")).toBe("00:01:30");
            expect(hmsDiff("10:00:00", "11:15:45")).toBe("01:15:45");
        });

        it("returns empty string when end is earlier than start and not a midnight crossing", () => {
            expect(hmsDiff("12:00:00", "11:00:00")).toBe("");
        });

        it("computes difference correctly when times cross midnight (e.g. 23:55 to 00:04)", () => {
            expect(hmsDiff("23:55:00", "00:04:00")).toBe("00:09:00");
            expect(hmsDiff("23:30:00", "00:30:00")).toBe("01:00:00");
        });
    });

    describe("isTimeEarlier midnight handling", () => {
        it("returns false for valid midnight crossing (e.g. asked 23:55, answered 00:04)", () => {
            expect(isTimeEarlier("00:04:00", "23:55:00")).toBe(false);
            expect(isTimeEarlier("00:30:00", "23:30:00")).toBe(false);
        });

        it("returns true for genuinely inverted daytime times (e.g. asked 12:00, answered 11:00)", () => {
            expect(isTimeEarlier("11:00:00", "12:00:00")).toBe(true);
        });
    });

    describe("Translation Quality to Error Type mapping", () => {
        it("maps Good to No Error only", () => {
            expect(getTranslationErrorOptions("Good")).toEqual(["No Error"]);
            expect(TRANSLATION_ERROR_MAP["Good"]).toEqual(["No Error"]);
        });

        it("maps Acceptable to Grammar Error only", () => {
            expect(getTranslationErrorOptions("Acceptable")).toEqual(["Grammar Error"]);
            expect(TRANSLATION_ERROR_MAP["Acceptable"]).toEqual(["Grammar Error"]);
        });

        it("maps Not Acceptable to Intent Error, Word Error, Partial Translation", () => {
            expect(getTranslationErrorOptions("Not Acceptable")).toEqual([
                "Intent Error",
                "Word Error",
                "Partial Translation",
            ]);
            expect(TRANSLATION_ERROR_MAP["Not Acceptable"]).toEqual([
                "Intent Error",
                "Word Error",
                "Partial Translation",
            ]);
        });

        it("maps NA to NA only", () => {
            expect(getTranslationErrorOptions("NA")).toEqual(["NA"]);
            expect(TRANSLATION_ERROR_MAP["NA"]).toEqual(["NA"]);
        });

        it("returns empty array for empty, undefined, or unknown quality", () => {
            expect(getTranslationErrorOptions("")).toEqual([]);
            expect(getTranslationErrorOptions(undefined)).toEqual([]);
            expect(getTranslationErrorOptions("Unknown")).toEqual([]);
        });
    });
});

