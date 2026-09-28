import { describe, it, expect } from "vitest";
import { formatAchievementPct, paginate } from "./adminSummaryFormat";

describe("formatAchievementPct", () => {
    it.each([
        ["zero actual", 0, "0.0%"],
        ["below 1%", (8 / 1836) * 100, "0.4%"],
        ["0.8%", 0.8, "0.8%"],
        ["between 1% and 100%", 25, "25.0%"],
        ["exactly 100%", 100, "100.0%"],
        ["above 100%", 150, "150.0%"],
        ["zero target (API sends 0)", 0, "0.0%"],
        ["not a number", Number.NaN, "0.0%"],
    ])("%s: %f -> %s", (_label, value, expected) => {
        expect(formatAchievementPct(value)).toBe(expected);
    });
});

describe("paginate (10 per page)", () => {
    const testers = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

    it.each([
        // count, page, rangeStart, rangeEnd, totalPages, rows shown
        [0, 1, 0, 0, 1, 0],
        [1, 1, 1, 1, 1, 1],
        [5, 1, 1, 5, 1, 5],
        [10, 1, 1, 10, 1, 10],
        [11, 1, 1, 10, 2, 10],
        [11, 2, 11, 11, 2, 1],
        [20, 2, 11, 20, 2, 10],
        [35, 1, 1, 10, 4, 10],
        [35, 2, 11, 20, 4, 10],
        [35, 4, 31, 35, 4, 5],
    ])("%i testers, page %i -> %i-%i of %i pages", (count, page, start, end, totalPages, shown) => {
        const slice = paginate(testers(count), page, 10);
        expect(slice.rangeStart).toBe(start);
        expect(slice.rangeEnd).toBe(end);
        expect(slice.totalPages).toBe(totalPages);
        expect(slice.items).toHaveLength(shown);
        expect(slice.total).toBe(count);
    });

    it("shows the remaining records on the last page", () => {
        expect(paginate(testers(35), 4, 10).items).toEqual([31, 32, 33, 34, 35]);
    });

    it("clamps a page past the end to the last page (e.g. after the list shrinks)", () => {
        const slice = paginate(testers(12), 5, 10);
        expect(slice.page).toBe(2);
        expect(slice.items).toEqual([11, 12]);
    });

    it("clamps a page below 1 to the first page", () => {
        expect(paginate(testers(12), 0, 10).page).toBe(1);
    });
});
