// Pure header-reconciliation/merge logic for combining N Google Sheets'
// Test Log rows into one dataset for updated.csv. Deliberately separated
// from TestersDashboardService's actual Google Sheets API fetching (I/O) so
// this can be unit tested with synthetic fixtures instead of live network
// calls - TestersDashboardService.syncFromSheet() does the fetching and
// passes already-fetched raw rows (or null on failure) into
// mergeSheetSources() below.
//
// Generalizes what was originally a hardcoded pairwise Sheet-1-vs-Sheet-2
// merge (see git history) into an N-way merge: whichever configured sheet
// is first to produce usable rows becomes the header baseline, and every
// other sheet - regardless of how many are configured - is compared
// against that same baseline. Added for Sheet 3.0 (see sheetMerge.test.ts
// and the sync commit this shipped in for the real-data investigation that
// justified its header quirks and confirmed no Type of Question/Question
// Category value mapping was needed).

export interface SheetSourceConfig {
    id: string;
    tab: string;
    label: string;
}

export interface SheetFetchResult {
    label: string;
    // null means this sheet failed to fetch (network/auth error) or came
    // back with zero rows - the caller (syncFromSheet) maps both cases to
    // null so this function only ever has to reason about "usable rows" vs
    // "not," never about why.
    rawRows: string[][] | null;
}

// Column B === "Test Date" is present and unambiguous in every known
// sheet's real header row regardless of column-A quirks (see
// SHEET_HEADER_QUIRKS below, which is exactly why anchoring on column A
// instead would be unreliable) - finds the real header row past each
// sheet's boilerplate rows (e.g. "Prepared by: ... Version: 1.0").
export function findHeaderRowIndex(rows: string[][]): number {
    for (let i = 0; i < rows.length; i++) {
        const secondCell = (rows[i][1] || '').trim();
        if (secondCell === 'Test Date') return i;
    }
    return -1;
}

// Sheet headers can differ cosmetically without being a real mismatch -
// Sheet 2.0 (and 3.0) append " (HH:MM:SS)" to 14 Assignment/Completion Time
// column headers (Author, Reviewer1-5, Moderator) - none of these raw
// timestamp fields are used in any calculation, only their derived
// "* TAT (mins) [Auto]" columns are, and those already match exactly.
// Stripping this suffix before comparing means this known-cosmetic
// difference alone never blocks an otherwise-safe merge.
export function normalizeHeaderCellForComparison(cell: string): string {
    return cell.trim().replace(/\s*\(HH:MM:SS\)\s*$/, '');
}

export function headersMatch(header1: string[], header2: string[]): boolean {
    if (header1.length !== header2.length) return false;
    return header1.every(
        (cell, i) => normalizeHeaderCellForComparison(cell) === normalizeHeaderCellForComparison(header2[i]),
    );
}

// Known per-sheet header quirks, keyed by that sheet's `label` (see
// SheetSourceConfig) - a declarative lookup instead of `if (label ===
// '2.0')` branches scattered through the merge loop. Adding a new sheet
// with its own header quirk means adding an entry here, not touching
// mergeSheetSources() itself.
export interface SheetHeaderQuirks {
    // Column A's header text to substitute when the real header cell is
    // blank/whitespace-only - a data-quality gap in the raw sheet itself,
    // not something fixable at the source.
    blankFirstColumnHeader?: string;
    // Exact raw header cell text -> corrected text.
    headerRenames?: Record<string, string>;
}

// Sheet 2.0's confirmed quirks (10-Aug header-alignment work): column A's
// header is blank instead of "Test ID", and "Thread ID" is Sheet 2.0's name
// for what Sheet 1.0 calls "Question ID" (same field, confirmed same
// position/content, just renamed). Sheet 3.0 was independently verified
// (real header fetched and compared against 1.0 via headersMatch() before
// this was written - see the sync commit this shipped in) to have the
// EXACT SAME two quirks, not a new one of its own - hence it shares this
// one entry rather than getting a near-duplicate.
const SHARED_QUIRKS_2_0_STYLE: SheetHeaderQuirks = {
    blankFirstColumnHeader: 'Test ID',
    headerRenames: { 'Thread ID': 'Question ID' },
};

export const SHEET_HEADER_QUIRKS: Record<string, SheetHeaderQuirks> = {
    '2.0': SHARED_QUIRKS_2_0_STYLE,
    '3.0': SHARED_QUIRKS_2_0_STYLE,
};

export function applyHeaderQuirks(headerRow: string[], label: string): string[] {
    const quirks = SHEET_HEADER_QUIRKS[label];
    if (!quirks) return headerRow;
    return headerRow.map((cell, index) => {
        if (index === 0 && cell.trim() === '' && quirks.blankFirstColumnHeader) {
            return quirks.blankFirstColumnHeader;
        }
        const renamed = quirks.headerRenames?.[cell.trim()];
        return renamed ?? cell;
    });
}

export interface MergedSheetSummary {
    label: string;
    count: number;
}

export interface SkippedSheetSummary {
    label: string;
    reason: string;
}

export interface MergeResult {
    // null only when every configured sheet failed/mismatched - nothing
    // usable to write.
    header: string[] | null;
    // Data rows only (header not included), all successfully-merged
    // sheets' rows concatenated in source-array order.
    rows: string[][];
    merged: MergedSheetSummary[];
    skipped: SkippedSheetSummary[];
}

// Merges N already-fetched sheets' raw rows into one dataset. Whichever
// sheet is first (in `results` order) to produce usable rows becomes the
// header baseline every later sheet is compared against - a generalization
// of the old pairwise "Sheet 1 vs Sheet 2" comparison to N sheets, with no
// hardcoded assumption about which position is "the mandatory one": if the
// first-configured sheet fails, the next one to succeed becomes the
// baseline instead, and the sync still proceeds with whatever sheets DO
// produce usable, header-matching rows - a single sheet failing (fetch
// error, missing header row, or a real header mismatch) is never fatal to
// the others.
export function mergeSheetSources(results: SheetFetchResult[]): MergeResult {
    let baselineHeader: string[] | null = null;
    let baselineLabel = '';
    const rows: string[][] = [];
    const merged: MergedSheetSummary[] = [];
    const skipped: SkippedSheetSummary[] = [];

    for (const { label, rawRows } of results) {
        if (!rawRows) {
            skipped.push({ label, reason: 'failed to fetch or returned no rows' });
            continue;
        }

        const headerIndex = findHeaderRowIndex(rawRows);
        if (headerIndex === -1) {
            skipped.push({ label, reason: 'could not find the header row (column B = "Test Date")' });
            continue;
        }

        const header = applyHeaderQuirks(rawRows[headerIndex], label);
        const dataRows = rawRows.slice(headerIndex + 1);

        if (baselineHeader === null) {
            baselineHeader = header;
            baselineLabel = label;
            rows.push(...dataRows);
            merged.push({ label, count: dataRows.length });
            continue;
        }

        if (!headersMatch(baselineHeader, header)) {
            skipped.push({ label, reason: `header does not match the ${baselineLabel} baseline` });
            continue;
        }

        rows.push(...dataRows);
        merged.push({ label, count: dataRows.length });
    }

    return { header: baselineHeader, rows, merged, skipped };
}
