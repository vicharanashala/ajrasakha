import { describe, it, expect } from 'vitest';
import {
    findHeaderRowIndex,
    normalizeHeaderCellForComparison,
    headersMatch,
    applyHeaderQuirks,
    mergeSheetSources,
    type SheetFetchResult,
} from './sheetMerge.js';

// Synthetic fixtures only - the real 1.0/2.0/3.0 header/value data this
// module's quirks (SHEET_HEADER_QUIRKS) were built from was verified
// directly against the live Google Sheets before this was written (see the
// sync commit this shipped in); these tests exercise the pure merge logic
// in isolation, not the real API calls.

const BASELINE_HEADER = [' ', 'Test Date', 'Tester Name', 'Type of Question', 'Question Category'];
// A blank column-A header, corrected form is 'Test ID' - matches the real
// column A of every sheet (1.0's real header literally starts with
// "Test ID," per parseCSV's anchor string, but the raw fetched header row
// itself is blank/whitespace for 2.0 and 3.0 - using a plain 'Test ID'
// baseline here since that's what applyHeaderQuirks produces for any sheet
// with the quirk applied, and what 1.0's raw header already has natively).
const FIXED_BASELINE_HEADER = ['Test ID', 'Test Date', 'Tester Name', 'Type of Question', 'Question Category'];

function makeRawRows(header: string[], dataRows: string[][], boilerplateRowsBefore = 1): string[][] {
    const boilerplate = Array.from({ length: boilerplateRowsBefore }, () => ['Prepared by: someone', 'Version: 1.0']);
    return [...boilerplate, header, ...dataRows];
}

describe('findHeaderRowIndex', () => {
    it('finds the row where column B is "Test Date", skipping boilerplate rows above it', () => {
        const rows = makeRawRows(BASELINE_HEADER, [['1', '2026-08-01']], 2);
        expect(findHeaderRowIndex(rows)).toBe(2);
    });

    it('returns -1 when no row has "Test Date" in column B', () => {
        expect(findHeaderRowIndex([['a', 'b'], ['c', 'd']])).toBe(-1);
    });
});

describe('normalizeHeaderCellForComparison / headersMatch', () => {
    it('strips the "(HH:MM:SS)" suffix before comparing', () => {
        expect(normalizeHeaderCellForComparison('Author Assignment Time (HH:MM:SS)')).toBe('Author Assignment Time');
        expect(normalizeHeaderCellForComparison('Author Assignment Time')).toBe('Author Assignment Time');
    });

    it('matches headers that are identical after the suffix strip, even if only one side has it', () => {
        const a = ['Test ID', 'Author Assignment Time (HH:MM:SS)'];
        const b = ['Test ID', 'Author Assignment Time'];
        expect(headersMatch(a, b)).toBe(true);
    });

    it('does not match headers of different lengths or genuinely different column names', () => {
        expect(headersMatch(['a', 'b'], ['a'])).toBe(false);
        expect(headersMatch(['a', 'b'], ['a', 'c'])).toBe(false);
    });
});

describe('applyHeaderQuirks', () => {
    it('applies the shared 2.0-style quirk (blank column A -> Test ID, Thread ID -> Question ID) to both 2.0 and 3.0', () => {
        const raw = [' ', 'Test Date', 'Thread ID'];
        expect(applyHeaderQuirks(raw, '2.0')).toEqual(['Test ID', 'Test Date', 'Question ID']);
        expect(applyHeaderQuirks(raw, '3.0')).toEqual(['Test ID', 'Test Date', 'Question ID']);
    });

    it('leaves a sheet with no configured quirks (e.g. 1.0, or an unknown label) untouched', () => {
        const raw = [' ', 'Test Date', 'Thread ID'];
        expect(applyHeaderQuirks(raw, '1.0')).toEqual(raw);
        expect(applyHeaderQuirks(raw, 'some-future-sheet')).toEqual(raw);
    });

    it('only substitutes column A when it is genuinely blank, not any other blank cell', () => {
        const raw = ['Test ID', 'Test Date', ''];
        expect(applyHeaderQuirks(raw, '2.0')).toEqual(['Test ID', 'Test Date', '']);
    });
});

describe('mergeSheetSources', () => {
    it('merges 2 sheets whose headers match after quirk-fixing (e.g. 1.0 baseline + 2.0-style sheet)', () => {
        const sheet1: SheetFetchResult = {
            label: '1.0',
            rawRows: makeRawRows(FIXED_BASELINE_HEADER, [
                ['T1', '2026-08-01', 'Alice', 'GDB', 'Weed Management'],
                ['T2', '2026-08-02', 'Bob', 'Unique', 'Disease Management'],
            ]),
        };
        const sheet2: SheetFetchResult = {
            label: '2.0',
            // Raw header has the blank-column-A + "Thread ID" quirks -
            // applyHeaderQuirks must resolve this to match sheet1's header
            // before mergeSheetSources accepts it.
            rawRows: makeRawRows([' ', 'Test Date', 'Tester Name', 'Type of Question', 'Question Category'], [
                ['T3', '2026-08-03', 'Carol', 'Outreach', 'Irrigation and Water Management'],
            ]),
        };

        const result = mergeSheetSources([sheet1, sheet2]);

        expect(result.header).toEqual(FIXED_BASELINE_HEADER);
        expect(result.rows).toHaveLength(3);
        expect(result.merged).toEqual([
            { label: '1.0', count: 2 },
            { label: '2.0', count: 1 },
        ]);
        expect(result.skipped).toEqual([]);
        // Rows preserved in source order, 1.0 first then 2.0.
        expect(result.rows[0][0]).toBe('T1');
        expect(result.rows[2][0]).toBe('T3');
    });

    it('skips a 3rd sheet whose header genuinely does not match the baseline, cleanly with a reason, without dropping the other 2 merged sheets', () => {
        const sheet1: SheetFetchResult = {
            label: '1.0',
            rawRows: makeRawRows(FIXED_BASELINE_HEADER, [['T1', '2026-08-01', 'Alice', 'GDB', 'Weed Management']]),
        };
        const sheet2: SheetFetchResult = {
            label: '2.0',
            rawRows: makeRawRows([' ', 'Test Date', 'Tester Name', 'Type of Question', 'Question Category'], [
                ['T2', '2026-08-02', 'Bob', 'Unique', 'Disease Management'],
            ]),
        };
        const sheet3Mismatched: SheetFetchResult = {
            label: 'mismatched',
            // A genuinely different column layout - not fixable by the
            // known 2.0-style quirk, and 'mismatched' has no entry in
            // SHEET_HEADER_QUIRKS at all so applyHeaderQuirks is a no-op.
            rawRows: makeRawRows(['Test ID', 'Test Date', 'A Totally Different Column'], [
                ['T3', '2026-08-03', 'unexpected'],
            ]),
        };

        const result = mergeSheetSources([sheet1, sheet2, sheet3Mismatched]);

        expect(result.merged).toEqual([
            { label: '1.0', count: 1 },
            { label: '2.0', count: 1 },
        ]);
        expect(result.rows).toHaveLength(2);
        expect(result.skipped).toEqual([
            { label: 'mismatched', reason: 'header does not match the 1.0 baseline' },
        ]);
    });

    it('a sheet that failed to fetch (rawRows: null) is skipped cleanly - does not throw, other sheets still merge', () => {
        const sheet1: SheetFetchResult = {
            label: '1.0',
            rawRows: makeRawRows(FIXED_BASELINE_HEADER, [['T1', '2026-08-01', 'Alice', 'GDB', 'Weed Management']]),
        };
        const sheetFailed: SheetFetchResult = { label: 'broken', rawRows: null };
        const sheet2: SheetFetchResult = {
            label: '2.0',
            rawRows: makeRawRows([' ', 'Test Date', 'Tester Name', 'Type of Question', 'Question Category'], [
                ['T2', '2026-08-02', 'Bob', 'Unique', 'Disease Management'],
            ]),
        };

        expect(() => mergeSheetSources([sheet1, sheetFailed, sheet2])).not.toThrow();
        const result = mergeSheetSources([sheet1, sheetFailed, sheet2]);

        expect(result.merged).toEqual([
            { label: '1.0', count: 1 },
            { label: '2.0', count: 1 },
        ]);
        expect(result.skipped).toEqual([{ label: 'broken', reason: 'failed to fetch or returned no rows' }]);
        expect(result.rows).toHaveLength(2);
    });

    it('a sheet with no findable header row (no "Test Date" in column B) is skipped, not fatal', () => {
        const sheet1: SheetFetchResult = {
            label: '1.0',
            rawRows: makeRawRows(FIXED_BASELINE_HEADER, [['T1', '2026-08-01', 'Alice', 'GDB', 'Weed Management']]),
        };
        const sheetNoHeader: SheetFetchResult = { label: 'no-header', rawRows: [['garbage', 'rows'], ['no', 'header']] };

        const result = mergeSheetSources([sheet1, sheetNoHeader]);

        expect(result.merged).toEqual([{ label: '1.0', count: 1 }]);
        expect(result.skipped).toEqual([
            { label: 'no-header', reason: 'could not find the header row (column B = "Test Date")' },
        ]);
    });

    it('whichever sheet is first to produce usable rows becomes the baseline - not hardcoded to array position 0', () => {
        const sheet1Failed: SheetFetchResult = { label: '1.0', rawRows: null };
        const sheet2: SheetFetchResult = {
            label: '2.0',
            rawRows: makeRawRows([' ', 'Test Date', 'Tester Name', 'Type of Question', 'Question Category'], [
                ['T2', '2026-08-02', 'Bob', 'Unique', 'Disease Management'],
            ]),
        };

        const result = mergeSheetSources([sheet1Failed, sheet2]);

        // 2.0's own (quirk-fixed) header becomes the baseline since 1.0
        // never produced usable rows to compare against.
        expect(result.header).toEqual(FIXED_BASELINE_HEADER);
        expect(result.merged).toEqual([{ label: '2.0', count: 1 }]);
        expect(result.skipped).toEqual([{ label: '1.0', reason: 'failed to fetch or returned no rows' }]);
    });

    it('returns a null header and empty merged/rows when every sheet fails - nothing usable to write', () => {
        const result = mergeSheetSources([
            { label: '1.0', rawRows: null },
            { label: '2.0', rawRows: null },
        ]);
        expect(result.header).toBeNull();
        expect(result.rows).toEqual([]);
        expect(result.merged).toEqual([]);
        expect(result.skipped).toHaveLength(2);
    });

    it('handles an empty source list without throwing', () => {
        expect(() => mergeSheetSources([])).not.toThrow();
        const result = mergeSheetSources([]);
        expect(result.header).toBeNull();
        expect(result.merged).toEqual([]);
    });
});
