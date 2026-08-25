import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import csv from 'csv-parser';
import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import {
    EMPTY_FILTERS,
    applyNonDateFilters,
    applyDateRangeFilter,
    applyFilters,
    addDaysISO,
    getPreviousPeriodWindow,
    getPreviousPeriodRows,
    buildFilterOptions,
} from './filters.js';

// Loads the real live CSV the same way TestersDashboardService.parseCSV
// does (find the "Test ID," header row, skip boilerplate rows above it,
// filter out blank/"Project:" rows) - so these tests verify the ported
// filter functions against the actual production data, not a synthetic
// fixture. Real occurrence counts asserted below were independently
// computed by parsing this same file and tabulating distinct normalized
// values - not invented. Re-derive them with `grep`/a one-off script
// against backend/data/testers-dashboard/updated.csv to spot-check.
function loadRealRecords(): Promise<TestersDashboardRecord[]> {
    const csvPath = path.join(process.cwd(), 'data', 'testers-dashboard', 'updated.csv');
    let fileContent = fs.readFileSync(csvPath, 'utf8');
    const headerIndex = fileContent.indexOf('Test ID,');
    if (headerIndex !== -1) {
        fileContent = fileContent.substring(headerIndex);
    }

    return new Promise((resolve, reject) => {
        const results: TestersDashboardRecord[] = [];
        Readable.from([fileContent])
            .pipe(csv())
            .on('data', (data: TestersDashboardRecord) => {
                const testId = data['Test ID'] ? data['Test ID'].trim() : '';
                if (testId && !testId.startsWith('Project:') && !testId.startsWith('Test ID')) {
                    results.push(data);
                }
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

let records: TestersDashboardRecord[];

beforeAll(async () => {
    records = await loadRealRecords();
});

describe('applyNonDateFilters - each of the 9 dimensions against real data', () => {
    it('loaded the real dataset (sanity check on row count)', () => {
        expect(records.length).toBe(11193);
    });

    it('type=GDB matches the normalized GDB+gdb rows', () => {
        // "GDB": 2931 + "gdb": 196 = 3127
        const out = applyNonDateFilters(records, { ...EMPTY_FILTERS, type: 'GDB' }, false);
        expect(out.length).toBe(3127);
    });

    it('category=Weed Management (a punctuation-free category, no toTitleCase surprises)', () => {
        // "Weed Management": 455 (single spelling, both sheets)
        const out = applyNonDateFilters(records, { ...EMPTY_FILTERS, category: 'Weed Management' }, false);
        expect(out.length).toBe(455);
    });

    // Per Hemanth's confirmation, every real Build/Version value is the
    // same single build, canonically "1.0" - not a typo-cleanup merge of
    // several distinct real values (like the other FILTER_FIELDS
    // normalizers), so build=1.0 now matches every row with ANY non-blank
    // Build/Version value, not just the "0.1"-family spellings.
    it('build=1.0 matches every non-blank Build/Version row, regardless of original value', () => {
        const out = applyNonDateFilters(records, { ...EMPTY_FILTERS, build: '1.0' }, false);
        const nonBlankBuildRows = records.filter((r) => (r['Build / Version'] || '').trim() !== '');
        expect(out.length).toBe(nonBlankBuildRows.length);
    });

    it('channel=Web App and channel=WhatsApp match their compact-string variants', () => {
        // "Web App": 6842 + "Web app": 1 + "webapp": 1 = 6844
        expect(applyNonDateFilters(records, { ...EMPTY_FILTERS, channel: 'Web App' }, false).length).toBe(6844);
        // "WhatsApp": 3227 + "Whats App": 63 = 3290
        expect(applyNonDateFilters(records, { ...EMPTY_FILTERS, channel: 'WhatsApp' }, false).length).toBe(3290);
    });

    it('language=English matches all casing variants', () => {
        // "English": 9865 + "ENGLISH": 81 + "english": 1 = 9947
        const out = applyNonDateFilters(records, { ...EMPTY_FILTERS, language: 'English' }, false);
        expect(out.length).toBe(9947);
    });

    it('tester=Joydeep matches the plain-name spelling AND the confirmed Joydeep Singha Roy merge', () => {
        // "JOYDEEP": 788 + "Joydeep": 1 = 789, plus "Joydeep Singha Roy"
        // (390 + 339 = 729) which normalizeTesterName now merges into
        // "Joydeep" as the same confirmed person = 1518 total.
        const out = applyNonDateFilters(records, { ...EMPTY_FILTERS, tester: 'Joydeep' }, false);
        expect(out.length).toBe(1518);
    });

    it('status=Pass matches all casing + the "Pas" typo', () => {
        // "PASS": 4457 + "Pass": 2132 + "pass": 19 + "Pas": 1 = 6609
        const out = applyNonDateFilters(records, { ...EMPTY_FILTERS, status: 'Pass' }, false);
        expect(out.length).toBe(6609);
    });

    it('severity=Critical matches all casing + the "Crtical" typo', () => {
        // "Critical": 103 + "CRITICAL": 11 + "critical": 4 + "Crtical": 1 = 119
        const out = applyNonDateFilters(records, { ...EMPTY_FILTERS, severity: 'Critical' }, false);
        expect(out.length).toBe(119);
    });

    it('combining two filters ANDs them together', () => {
        const typeOnly = applyNonDateFilters(records, { ...EMPTY_FILTERS, type: 'GDB' }, false).length;
        const statusOnly = applyNonDateFilters(records, { ...EMPTY_FILTERS, status: 'Pass' }, false).length;
        const both = applyNonDateFilters(records, { ...EMPTY_FILTERS, type: 'GDB', status: 'Pass' }, false).length;
        // The AND result can't exceed either individual filter's count, and
        // isn't just their sum/product - a real cross-check that both
        // conditions are actually being applied together, not overwriting
        // each other.
        expect(both).toBeLessThanOrEqual(typeOnly);
        expect(both).toBeLessThanOrEqual(statusOnly);
        expect(both).toBeGreaterThan(0);
    });

    it('excludeFailures drops rows with a DB-save failure, wrongly-flagged duplicate, or Critical defect', () => {
        // Independently computed against the real CSV: 469 of 11193 rows
        // have "not saved" in Question/Answer Saved in DB?, are flagged
        // "wrongly identified as duplicate", or have Critical severity.
        const withFailures = applyNonDateFilters(records, EMPTY_FILTERS, false).length;
        const withoutFailures = applyNonDateFilters(records, EMPTY_FILTERS, true).length;
        expect(withFailures).toBe(records.length);
        expect(withoutFailures).toBe(10724);
        expect(withFailures - withoutFailures).toBe(469);
    });
});

describe('applyNonDateFilters - dynamicSubTypes (multi-select OR) against real data', () => {
    // Every count below was independently re-derived via a from-scratch
    // reimplementation of the Weather/climate, Mandi/market, Scheme
    // classification (NOT calling dynamicSubBucketFor or
    // applyNonDateFilters) against this exact same live CSV immediately
    // before writing these assertions - re-derive with a one-off script
    // against backend/data/testers-dashboard/updated.csv to spot-check,
    // since (like every other real-data count in this file) this WILL
    // drift as the live sheet keeps changing.
    it('empty/unset dynamicSubTypes applies no filter (matches EMPTY_FILTERS behavior)', () => {
        const out = applyNonDateFilters(records, EMPTY_FILTERS, false);
        expect(out.length).toBe(records.length);
    });

    it('single sub-type: Weather, Mandi Prices, Government Schemes each match their own real count', () => {
        expect(applyNonDateFilters(records, { ...EMPTY_FILTERS, dynamicSubTypes: ['Weather'] }, false).length).toBe(287);
        expect(applyNonDateFilters(records, { ...EMPTY_FILTERS, dynamicSubTypes: ['Mandi Prices'] }, false).length).toBe(280);
        expect(
            applyNonDateFilters(records, { ...EMPTY_FILTERS, dynamicSubTypes: ['Government Schemes'] }, false).length,
        ).toBe(11);
    });

    it('multiple sub-types combine with OR logic, not AND - Weather+Mandi is their disjoint union', () => {
        const weatherOnly = applyNonDateFilters(records, { ...EMPTY_FILTERS, dynamicSubTypes: ['Weather'] }, false).length;
        const mandiOnly = applyNonDateFilters(records, { ...EMPTY_FILTERS, dynamicSubTypes: ['Mandi Prices'] }, false).length;
        const combined = applyNonDateFilters(
            records,
            { ...EMPTY_FILTERS, dynamicSubTypes: ['Weather', 'Mandi Prices'] },
            false,
        ).length;
        // dynamicSubBucketFor assigns each row to at most one sub-bucket, so
        // Weather and Mandi Prices are disjoint sets - OR logic means their
        // combination is exactly the sum, not less (which AND logic, or a
        // bug matching only rows satisfying both, would produce).
        expect(combined).toBe(567);
        expect(combined).toBe(weatherOnly + mandiOnly);
    });

    it('Weather+Schemes combines correctly too', () => {
        expect(
            applyNonDateFilters(records, { ...EMPTY_FILTERS, dynamicSubTypes: ['Weather', 'Government Schemes'] }, false)
                .length,
        ).toBe(298);
    });

    it('all three sub-types selected matches their full combined real count', () => {
        expect(
            applyNonDateFilters(
                records,
                { ...EMPTY_FILTERS, dynamicSubTypes: ['Weather', 'Mandi Prices', 'Government Schemes'] },
                false,
            ).length,
        ).toBe(578);
    });

    it('is independent of the `type` filter - Weather matches without type=Dynamic being set', () => {
        const weatherAlone = applyNonDateFilters(records, { ...EMPTY_FILTERS, dynamicSubTypes: ['Weather'] }, false).length;
        const weatherWithTypeDynamic = applyNonDateFilters(
            records,
            { ...EMPTY_FILTERS, type: 'Dynamic', dynamicSubTypes: ['Weather'] },
            false,
        ).length;
        // Weather-classified rows exist outside type=Dynamic too (a row can
        // resolve to a sub-bucket via Question Category alone, regardless of
        // its Type of Question) - selecting the sub-type alone must not
        // silently require type=Dynamic too.
        expect(weatherAlone).toBe(287);
        expect(weatherAlone).toBeGreaterThan(weatherWithTypeDynamic);
    });
});

describe('applyDateRangeFilter / applyFilters against real dates', () => {
    // Fixed "now" so today/7days/30days are deterministic - matches the
    // real system date at port time, which falls inside this CSV's actual
    // 2026 date range, so the counts below are real, not synthetic.
    const NOW = new Date('2026-08-11T12:00:00.000Z');

    it('7days matches rows within 7 days of "now"', () => {
        const out = applyDateRangeFilter(records, '7days', undefined, undefined, NOW);
        expect(out.length).toBe(1634);
    });

    it('30days matches rows within 30 days of "now"', () => {
        const out = applyDateRangeFilter(records, '30days', undefined, undefined, NOW);
        expect(out.length).toBe(5054);
    });

    it('"all" and an empty custom range both return every row unfiltered', () => {
        expect(applyDateRangeFilter(records, 'all', undefined, undefined, NOW).length).toBe(records.length);
        expect(applyDateRangeFilter(records, 'custom', undefined, undefined, NOW).length).toBe(records.length);
    });

    it('applyFilters composes non-date and date filtering', () => {
        const dateOnly = applyDateRangeFilter(records, '7days', undefined, undefined, NOW).length;
        const combined = applyFilters(records, { ...EMPTY_FILTERS, dateRange: '7days', type: 'GDB' }, false, undefined, undefined, NOW).length;
        expect(combined).toBeLessThanOrEqual(dateOnly);
    });
});

describe('addDaysISO', () => {
    it('adds and subtracts whole days across a month boundary', () => {
        expect(addDaysISO('2026-08-01', -1)).toBe('2026-07-31');
        expect(addDaysISO('2026-07-31', 1)).toBe('2026-08-01');
    });
});

describe('getPreviousPeriodWindow', () => {
    const NOW = new Date('2026-08-11T12:00:00.000Z');

    it('returns null for "all"', () => {
        expect(getPreviousPeriodWindow('all', undefined, undefined, NOW)).toBeNull();
    });

    it('returns null for an open-ended custom range (only one of start/end set)', () => {
        expect(getPreviousPeriodWindow('custom', '2026-08-01', undefined, NOW)).toBeNull();
        expect(getPreviousPeriodWindow('custom', undefined, '2026-08-01', NOW)).toBeNull();
    });

    it('returns null for a custom range with neither date set yet', () => {
        expect(getPreviousPeriodWindow('custom', undefined, undefined, NOW)).toBeNull();
    });

    it('computes the correct 7-day previous window: [2026-07-29, 2026-08-04]', () => {
        const window = getPreviousPeriodWindow('7days', undefined, undefined, NOW);
        expect(window).toEqual({ prevStart: '2026-07-29', prevEnd: '2026-08-04' });
    });

    it('computes the correct 30-day previous window: [2026-06-13, 2026-07-12]', () => {
        const window = getPreviousPeriodWindow('30days', undefined, undefined, NOW);
        expect(window).toEqual({ prevStart: '2026-06-13', prevEnd: '2026-07-12' });
    });

    it('computes a custom-range previous window of the same length immediately before it', () => {
        // A 5-day custom range (Aug 1-5) should mirror to the 5 days
        // immediately before it (Jul 27-31).
        const window = getPreviousPeriodWindow('custom', '2026-08-01', '2026-08-05', NOW);
        expect(window).toEqual({ prevStart: '2026-07-27', prevEnd: '2026-07-31' });
    });
});

describe('getPreviousPeriodRows against real dates', () => {
    const NOW = new Date('2026-08-11T12:00:00.000Z');

    it('returns null when there is no well-defined previous period', () => {
        expect(getPreviousPeriodRows(records, EMPTY_FILTERS, false, undefined, undefined, NOW)).toBeNull();
    });

    it('7days previous-period window contains the expected real row count', () => {
        // Real rows with Test Date in [2026-07-29, 2026-08-04]: 1097
        const rows = getPreviousPeriodRows(records, { ...EMPTY_FILTERS, dateRange: '7days' }, false, undefined, undefined, NOW);
        expect(rows).not.toBeNull();
        expect(rows!.length).toBe(1097);
    });

    it('30days previous-period window contains the expected real row count', () => {
        // Real rows with Test Date in [2026-06-13, 2026-07-12]: 4594
        const rows = getPreviousPeriodRows(records, { ...EMPTY_FILTERS, dateRange: '30days' }, false, undefined, undefined, NOW);
        expect(rows).not.toBeNull();
        expect(rows!.length).toBe(4594);
    });

    it('the previous-period window never overlaps the current window', () => {
        const currentRows = applyDateRangeFilter(records, '7days', undefined, undefined, NOW);
        const prevRows = getPreviousPeriodRows(records, { ...EMPTY_FILTERS, dateRange: '7days' }, false, undefined, undefined, NOW)!;
        const currentIds = new Set(currentRows.map((r) => r['Test ID']));
        const overlap = prevRows.filter((r) => currentIds.has(r['Test ID']));
        expect(overlap.length).toBe(0);
    });

    it('applies the same non-date filters to the previous period as the current one', () => {
        const allPrev = getPreviousPeriodRows(records, { ...EMPTY_FILTERS, dateRange: '30days' }, false, undefined, undefined, NOW)!;
        const gdbPrev = getPreviousPeriodRows(records, { ...EMPTY_FILTERS, dateRange: '30days', type: 'GDB' }, false, undefined, undefined, NOW)!;
        expect(gdbPrev.length).toBeLessThan(allPrev.length);
        expect(gdbPrev.length).toBeGreaterThan(0);
    });
});

describe('buildFilterOptions', () => {
    it('excludes "Quality Checking" and always force-includes "Outreach" on real data', () => {
        const options = buildFilterOptions(records);
        expect(options.type).not.toContain('Quality Checking');
        expect(options.type).toContain('Outreach');
    });

    it('force-includes "Outreach" even with zero matching rows in the given dataset', () => {
        // A synthetic slice with no Outreach rows at all - proves the
        // force-include branch fires even when the natural dedup wouldn't
        // have produced "Outreach" on its own, not just that it happens to
        // survive because real data currently has 1268 Outreach rows.
        const noOutreachSubset = records.filter((r) => (r['Type of Question'] || '').trim().toUpperCase() !== 'OUTREACH');
        const options = buildFilterOptions(noOutreachSubset);
        expect(options.type).toContain('Outreach');
    });

    // A column-shift data-entry error in the source sheet leaks raw Tester
    // Name values into the Type of Question column ("Ithagani Shireesha",
    // "Lavanya Mathialagan" - 1 row each, real data). normalizeTypeOfQuestion's
    // title-case fallback passes them through unchanged, so before the
    // whitelist fix they showed up as bogus selectable options here (even
    // though moduleGroupFor already correctly excludes them from
    // calculations). Hardcoding a fixed 4-item list (Weather/Mandi/Scheme
    // Dynamic are Dynamic subtypes, not separately selectable at this top
    // level - see dynamicSubBucketFor in diagnostics.ts. "Static Dynamic"
    // was briefly a 5th top-level bucket per an earlier confirmation from
    // Hemanth, but he later explicitly reversed that ("You can remove
    // static dynamic category") - it's excluded here now too, same as
    // moduleGroupFor) means the type dropdown only ever shows exactly these
    // 4, in this exact order, regardless of what garbage leaks in next.
    it('shows exactly the 4 confirmed top-level Type of Question values, in fixed order, excluding leaked garbage', () => {
        const options = buildFilterOptions(records);
        expect(options.type).not.toContain('Ithagani Shireesha');
        expect(options.type).not.toContain('Lavanya Mathialagan');
        expect(options.type).not.toContain('Weather Dynamic');
        expect(options.type).not.toContain('Mandi Dynamic');
        expect(options.type).not.toContain('Scheme Dynamic');
        expect(options.type).toEqual(['GDB', 'Unique', 'Outreach', 'Dynamic']);
    });

    // Confirms "Static Dynamic" is now correctly excluded/unmatched, not
    // silently reassigned or absorbed into plain "Dynamic" - the reversal
    // this task made. Static Dynamic rows still exist in the raw data (see
    // diagnostics.test.ts for the real row count) - they just no longer
    // appear as a selectable Type of Question option.
    it('excludes "Static Dynamic" from the Type of Question dropdown (Hemanth reversed the earlier top-level-bucket confirmation)', () => {
        const options = buildFilterOptions(records);
        expect(options.type).not.toContain('Static Dynamic');
        expect(options.type).toHaveLength(4);
    });

    it('excludes an arbitrary unrecognized garbage value from the Type of Question dropdown (whitelist, not a specific blacklist)', () => {
        // Proves this protects against the NEXT leaked value too, not just
        // the two specific names currently in the live data - a synthetic
        // row with a Type of Question value that isn't any of the known-bad
        // OR known-good strings should still be excluded.
        const withGarbage = [...records, { ...records[0], 'Type of Question': 'Some Other Random Garbage' }];
        const options = buildFilterOptions(withGarbage);
        expect(options.type).not.toContain('Some Other Random Garbage');
    });

    // "English" (2 real rows) isn't a real channel - normalizeChannel's
    // title-case fallback passes it through unchanged, so before the
    // whitelist fix it showed up as a bogus 4th option alongside the 3
    // confirmed real channels. Same whitelist-not-blacklist principle as
    // Type of Question above.
    it('excludes leaked "English" garbage from the Channel Tested dropdown, whitelist-style', () => {
        const options = buildFilterOptions(records);
        expect(options.channel).not.toContain('English');
        expect(options.channel.sort()).toEqual(['Both', 'Web App', 'WhatsApp']);
    });

    it('excludes an arbitrary unrecognized garbage value from the Channel Tested dropdown (whitelist, not a specific blacklist)', () => {
        // Proves this protects against the NEXT leaked value too, not just
        // "English" specifically.
        const withGarbage = [...records, { ...records[0], 'Channel Tested': 'Some Other Random Garbage' }];
        const options = buildFilterOptions(withGarbage);
        expect(options.channel).not.toContain('Some Other Random Garbage');
        expect(options.channel.sort()).toEqual(['Both', 'Web App', 'WhatsApp']);
    });

    it('excludes blank/NIL/NA (unless keepNA) from every dropdown', () => {
        const options = buildFilterOptions(records);
        for (const key of Object.keys(options) as (keyof typeof options)[]) {
            expect(options[key]).not.toContain('');
            expect(options[key]).not.toContain('NIL');
        }
        // status keeps NA as a real option; everything else excludes it.
        // (Build/Version used to be a similar exception, but every real
        // value there - NA included - is now folded into "1.0" by
        // normalizeBuildVersion, so there's no distinct "NA" output left.)
        expect(options.status).toContain('NA');
        expect(options.build).not.toContain('NA');
        expect(options.severity).not.toContain('NA');
    });

    // Per Hemanth's confirmation: every real Build/Version value - typo
    // variants and NA alike - is the same single build, canonically "1.0".
    it('shows only "1.0" as a real Build/Version option', () => {
        const options = buildFilterOptions(records);
        expect(options.build).toEqual(['1.0']);
    });

    it('returns options sorted alphabetically', () => {
        const options = buildFilterOptions(records);
        const sorted = [...options.severity].sort((a, b) => a.localeCompare(b));
        expect(options.severity).toEqual(sorted);
    });
});
