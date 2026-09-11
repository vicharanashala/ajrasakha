import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import csv from 'csv-parser';
import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import { normalizeDefectSeverity, isNAlike, matchesAny, isYes } from './normalize.js';
import {
    TAT_STAGES,
    moduleGroupFor,
    dynamicSubBucketFor,
    MIN_ROWS_FOR_WEAKEST_MODULE,
    ACE_MODULE_KEYS,
    ACE_COMING_SOON_MODULES,
    calculateAceModulePerformance,
    calculateDiagnostics,
    type DynamicSubBucket,
} from './diagnostics.js';

// Same loader as filters.test.ts/kpis.test.ts - real live CSV, parsed the
// same way TestersDashboardService.parseCSV does. Pulled FRESH at test run
// time (not a cached snapshot) - this session has repeatedly confirmed the
// live sheet keeps changing between sessions (the 302-vs-316 defect-count
// drift, the *_DYNAMIC row-count drift, the Joydeep-total drift), so every
// number asserted below was independently computed against this exact same
// file immediately before writing these assertions, not carried over from
// an earlier phase's snapshot.
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

describe('moduleGroupFor', () => {
    it('buckets GDB/GDP variants as GDB', () => {
        expect(moduleGroupFor('GDB')).toBe('GDB');
        expect(moduleGroupFor('gdb')).toBe('GDB');
        expect(moduleGroupFor('GDP')).toBe('GDB');
    });

    it('buckets plain Dynamic/Dynmic as Dynamic', () => {
        expect(moduleGroupFor('Dynamic')).toBe('Dynamic');
        expect(moduleGroupFor('Dynmic')).toBe('Dynamic');
    });

    // The fix landed earlier this session: an exact `=== "Dynamic"` check
    // was silently excluding ~550 real Test Log 2.0 rows from Weakest
    // Module. This must still bucket the Weather/Mandi/Scheme compound
    // variants as Dynamic (their subtypes are Dynamic's own sub-breakdown,
    // see dynamicSubBucketFor below).
    it('buckets Test Log 2.0 compound Dynamic variants as Dynamic (the *_DYNAMIC fix)', () => {
        expect(moduleGroupFor('WEATHER DYNAMIC')).toBe('Dynamic');
        expect(moduleGroupFor('MANDI DYNAMIC')).toBe('Dynamic');
        expect(moduleGroupFor('SCHEME DYNAMIC')).toBe('Dynamic');
    });

    // Static Dynamic was briefly its own top-level module (an earlier
    // confirmation from Hemanth), but he later explicitly reversed that:
    // "You can remove static dynamic category." It must now return null -
    // same as any other unrecognized value - and specifically must NOT fall
    // into the general "contains dynamic" match either, even though the
    // string "static dynamic" does contain "dynamic" as a substring; that
    // exclusion check has to run first, before the general match, for
    // exactly this reason.
    it('excludes Static Dynamic entirely - returns null, not its own bucket and not absorbed into Dynamic', () => {
        expect(moduleGroupFor('STATIC DYNAMIC')).toBeNull();
        expect(moduleGroupFor('Static Dynamic')).toBeNull();
        expect(moduleGroupFor('static dynamic')).toBeNull();
    });

    it('buckets Unique/Uniuqe as Unique Questions and Outreach as Outreach', () => {
        expect(moduleGroupFor('Unique')).toBe('Unique Questions');
        expect(moduleGroupFor('Uniuqe')).toBe('Unique Questions');
        expect(moduleGroupFor('Outreach')).toBe('Outreach');
    });

    it('returns null for unmapped values (Quality Checking, blank, leaked garbage)', () => {
        expect(moduleGroupFor('Quality Checking')).toBeNull();
        expect(moduleGroupFor('')).toBeNull();
        expect(moduleGroupFor('Ithagani Shireesha')).toBeNull();
    });
});

describe('dynamicSubBucketFor', () => {
    // Gates on moduleGroupFor(typeOfQuestion) === 'Dynamic' first - a row
    // has to genuinely BE Dynamic-typed before Category/Type of Question
    // text is consulted for which sub-bucket it falls into. So every case
    // below that expects a real bucket back needs a Type of Question value
    // that actually resolves to Dynamic (plain "Dynamic" or a "contains
    // dynamic" compound value), even when the test is really about Category
    // being the signal that picks the specific sub-bucket.
    it('resolves from Question Category first (Sheet 1.0 signal), given the row is Dynamic-typed', () => {
        expect(dynamicSubBucketFor('Climate, Weather and Stress Management', 'Dynamic')).toBe('Weather');
        expect(dynamicSubBucketFor('Market Prices, MSP and Marketing', 'Dynamic')).toBe('Mandi Prices');
        expect(dynamicSubBucketFor('Agricultural Schemes and Subsidies', 'Dynamic')).toBe('Government Schemes');
    });

    // The bug this gate fixes: a row that is really GDB/Unique/Outreach/
    // Quality Checking/Static Dynamic - i.e. NOT Dynamic-typed AND not
    // blank either - must not get a Dynamic sub-bucket just because its
    // Question Category happens to mention "climate"/"weather"/"market"/
    // "scheme". Confirmed against the live CSV: 585 rows were wrongly
    // resolving to a sub-bucket this way before the gate was added.
    //
    // Blank Type of Question is deliberately NOT covered by this test
    // anymore - see 'resolves via Category alone when Type of Question is
    // blank/empty' below for that carve-out and why it exists.
    it('does not resolve a sub-bucket from Category alone when the row has a real non-Dynamic type', () => {
        expect(dynamicSubBucketFor('Climate, Weather and Stress Management', 'GDB')).toBeNull();
        expect(dynamicSubBucketFor('Market Prices, MSP and Marketing', 'Unique')).toBeNull();
        expect(dynamicSubBucketFor('Agricultural Schemes and Subsidies', 'Outreach')).toBeNull();
        expect(dynamicSubBucketFor('Climate, Weather and Stress Management', 'Static Dynamic')).toBeNull();
    });

    // The Sheet-1.0-era fix: these rows predate the Type of Question column
    // entirely, so their Type of Question is blank - but their Question
    // Category (and, on manual inspection of the live CSV, their query
    // text too - e.g. "Will it rain tomorrow?") genuinely says Weather/
    // Mandi/Schemes. A blank Type of Question now falls through to the
    // Category check instead of being gated out, recovering 85 Weather /
    // 43 Mandi Prices rows of genuine data that were previously discarded.
    it('resolves via Category alone when Type of Question is blank/empty (Sheet 1.0 fix)', () => {
        expect(dynamicSubBucketFor('Climate, Weather and Stress Management', undefined)).toBe('Weather');
        expect(dynamicSubBucketFor('Climate, Weather and Stress Management', '')).toBe('Weather');
        expect(dynamicSubBucketFor('Climate, Weather and Stress Management', '   ')).toBe('Weather');
        expect(dynamicSubBucketFor('Market Prices, MSP and Marketing', undefined)).toBe('Mandi Prices');
        expect(dynamicSubBucketFor('Agricultural Schemes and Subsidies', undefined)).toBe('Government Schemes');
    });

    // The carve-out is narrow: ONLY a truly blank Type of Question gets the
    // Category-alone fallback. A row genuinely tagged with a different type
    // (GDB/Outreach/Static Dynamic) still must not resolve, even though its
    // Question Category also happens to say Weather - these are the
    // confirmed cross-contamination leaks (a single Dynamic row's answer
    // landing in all 3 domain columns), and relaxing the gate for them
    // would let that leak back in as if it were genuine domain data.
    it('does NOT extend the blank-type fallback to GDB/Outreach/Static Dynamic rows, even with a matching Category', () => {
        expect(dynamicSubBucketFor('Climate, Weather and Stress Management', 'GDB')).toBeNull();
        expect(dynamicSubBucketFor('Climate, Weather and Stress Management', 'Outreach')).toBeNull();
        expect(dynamicSubBucketFor('Climate, Weather and Stress Management', 'Static Dynamic')).toBeNull();
        expect(dynamicSubBucketFor('Climate, Weather and Stress Management', 'Unique')).toBeNull();
    });

    it('falls back to Type of Question when Category does not resolve (Test Log 2.0 fix)', () => {
        expect(dynamicSubBucketFor('', 'WEATHER DYNAMIC')).toBe('Weather');
        expect(dynamicSubBucketFor(undefined, 'MANDI DYNAMIC')).toBe('Mandi Prices');
        expect(dynamicSubBucketFor('', 'SCHEME DYNAMIC')).toBe('Government Schemes');
    });

    // Static Dynamic used to be a 4th dynamicSubBucketFor bucket (replacing
    // the old "Soil Testing", which never had any real identifying field in
    // the data), then was briefly promoted to its own top-level module
    // instead (see moduleGroupFor) - and per Hemanth's final confirmation
    // ("You can remove static dynamic category") it's now excluded from the
    // Weakest Modules system entirely, at every level. dynamicSubBucketFor
    // now enforces this itself (via the moduleGroupFor gate above), not just
    // by relying on callers to pre-filter it away.
    it('does not resolve Static Dynamic to any sub-bucket', () => {
        expect(dynamicSubBucketFor('', 'STATIC DYNAMIC')).toBeNull();
        expect(dynamicSubBucketFor(undefined, 'Static Dynamic')).toBeNull();
        expect(dynamicSubBucketFor('Some Unrelated Category', 'STATIC DYNAMIC')).toBeNull();
    });

    it('prefers Category over Type of Question when both would resolve differently', () => {
        // Category should win - it's checked first and only falls through
        // to Type of Question when Category itself is empty/unresolved.
        expect(dynamicSubBucketFor('Market Prices, MSP and Marketing', 'WEATHER DYNAMIC')).toBe('Mandi Prices');
    });

    it('returns null when neither field resolves', () => {
        expect(dynamicSubBucketFor('Some Unrelated Category', 'Some Unrelated Type')).toBeNull();
        expect(dynamicSubBucketFor(undefined, undefined)).toBeNull();
    });
});

describe('calculateAceModulePerformance / calculateDiagnostics against the real live CSV (fresh pull)', () => {
    // Overall Module Performance now scores 6 ACE modules from their own
    // related columns (Farmer Interaction, Agri Advisory, Knowledge & GDB,
    // Dynamic Advisory, Multilingual & Voice, Communication &
    // Notifications) rather than grouping rows into a Type-of-Question
    // bucket (the old GDB/Unique Questions/Outreach/Dynamic sub-type
    // system this replaced). Independently verified via a fresh CSV pull
    // immediately before writing this test - re-derive with a one-off
    // script against backend/data/testers-dashboard/updated.csv to
    // spot-check, since this WILL drift as the live sheet keeps changing.
    it('all 6 ACE modules match a fresh independent computation, in fixed order', () => {
        const result = calculateDiagnostics(records);
        expect(records.length).toBe(17872);

        expect(result.modulePerformance.map((m) => m.key)).toEqual(ACE_MODULE_KEYS);
        expect(result.modulePerformance.length).toBe(6);

        const byKey = Object.fromEntries(result.modulePerformance.map((m) => [m.key, m]));

        expect(byKey['farmer_interaction'].overallScore).toBe(100);
        expect(byKey['farmer_interaction'].applicableRowCount).toBe(14117);
        expect(byKey['farmer_interaction'].subMetrics).toEqual([
            { key: 'question_framed', label: 'Question Correctly Framed', value: 100, applicable: 14117 },
        ]);

        // Agri Advisory's Scientific Accuracy is no longer Static-only - it
        // now uses the same isScientificAccuracyEligible scoping as Trust
        // Score's A_sci (any recognized Type of Question, Static or
        // Dynamic), so its applicable count/score match A_sci exactly.
        expect(byKey['agri_advisory'].overallScore).toBe(95);
        expect(byKey['agri_advisory'].applicableRowCount).toBe(10667);
        expect(byKey['agri_advisory'].subMetrics).toEqual([
            { key: 'scientific_accuracy_static', label: 'Scientific Accuracy', value: 95, applicable: 10667 },
        ]);

        // Knowledge & GDB's Scientific Accuracy sub-metric is no longer
        // GDB-only, nor "correct"-only - it now uses the exact same scoping
        // (isScientificAccuracyEligible) AND match rule
        // (isScientificallyCorrect) as Agri Advisory/A_sci, so its value and
        // applicable count match Agri Advisory's exactly.
        expect(byKey['knowledge_gdb'].overallScore).toBe(97);
        expect(byKey['knowledge_gdb'].applicableRowCount).toBe(11373);
        expect(byKey['knowledge_gdb'].subMetrics).toEqual([
            { key: 'correct_source_links', label: 'Correct Source Links', value: 99, applicable: 9491 },
            { key: 'scientific_accuracy_gdb', label: 'Scientific Accuracy', value: 95, applicable: 10667 },
        ]);

        expect(byKey['dynamic_advisory'].overallScore).toBe(96.3);
        expect(byKey['dynamic_advisory'].applicableRowCount).toBe(2223);
        expect(byKey['dynamic_advisory'].subMetrics).toEqual([
            { key: 'weather_accuracy', label: 'Weather Accuracy', value: 99, applicable: 1449 },
            { key: 'mandi_accuracy', label: 'Mandi Accuracy', value: 90, applicable: 373 },
            { key: 'scheme_accuracy', label: 'Scheme Accuracy', value: 100, applicable: 401 },
        ]);

        expect(byKey['multilingual_voice'].overallScore).toBe(89.4);
        expect(byKey['multilingual_voice'].applicableRowCount).toBe(13388);
        expect(byKey['multilingual_voice'].subMetrics).toEqual([
            { key: 'translation_quality', label: 'Translation Quality', value: 98, applicable: 11770 },
            { key: 'voice_input_quality', label: 'Voice Input Quality (Clear)', value: 82, applicable: 6956 },
            { key: 'voice_output_quality', label: 'Voice Output Quality (Clear)', value: 90, applicable: 7541 },
            { key: 'voice_input_working', label: 'Voice Input Working', value: 91, applicable: 7250 },
            { key: 'voice_output_working', label: 'Voice Output Working', value: 86, applicable: 7068 },
        ]);

        expect(byKey['communication_notifications'].overallScore).toBe(73);
        expect(byKey['communication_notifications'].applicableRowCount).toBe(6001);
        expect(byKey['communication_notifications'].subMetrics).toEqual([
            { key: 'notification_success', label: 'Notification Success', value: 60, applicable: 6001 },
            { key: 'notification_experience', label: 'Notification Experience', value: 86, applicable: 2689 },
        ]);

        expect(result.modulePerformance.every((m) => m.eligible)).toBe(true);
    });

    // Regression guard for the blank-Type-of-Question fix to dynamicSubBucketFor
    // (diagnostics.ts): confirms, against the live CSV, that every row newly
    // pulled into a Weather/Mandi/Scheme bucket by the fix has a genuinely
    // blank Type of Question - i.e. the fix did NOT also start counting
    // GDB/Outreach/Static Dynamic/other real-typed rows (the confirmed
    // cross-contamination leaks, which must stay excluded).
    it('the blank-Type-of-Question fallback only ever recovers rows whose Type of Question is truly blank', () => {
        const buckets: DynamicSubBucket[] = ['Weather', 'Mandi Prices', 'Government Schemes'];
        for (const bucket of buckets) {
            const bucketRows = records.filter((r) => dynamicSubBucketFor(r['Question Category'], r['Type of Question']) === bucket);
            const newlyIncluded = bucketRows.filter((r) => moduleGroupFor(r['Type of Question']) !== 'Dynamic');
            expect(newlyIncluded.every((r) => !(r['Type of Question'] || '').trim())).toBe(true);
        }
    });

    // Live-CSV pin for the fix's actual effect: Weather gains rows (99% ->
    // still 99%, more applicable), Mandi's pct dips slightly (fresh
    // low-scoring blank-type rows dilute it: 91% -> 90%), Schemes is
    // untouched (its 16 wrongly-excluded rows are Outreach-tagged, not
    // blank, and remain excluded - see dynamicSubBucketFor's own comment).
    it('newly-included blank-type row counts match the confirmed investigation (82 Weather, 71 Mandi, 0 Schemes)', () => {
        const countNewlyIncluded = (bucket: DynamicSubBucket) =>
            records.filter(
                (r) =>
                    dynamicSubBucketFor(r['Question Category'], r['Type of Question']) === bucket &&
                    moduleGroupFor(r['Type of Question']) !== 'Dynamic',
            ).length;
        expect(countNewlyIncluded('Weather')).toBe(82);
        expect(countNewlyIncluded('Mandi Prices')).toBe(71);
        expect(countNewlyIncluded('Government Schemes')).toBe(0);
    });

    // The lowest-scoring eligible module wins, independent of its position
    // in the fixed display order (Communication & Notifications is last,
    // 6th, not first).
    it('weakestModule is Communication & Notifications, mainly Notification Success + Notification Experience', () => {
        const result = calculateDiagnostics(records);
        expect(result.weakestModule).toBe('Communication & Notifications');
        expect(result.weakestModuleScore).toBe(73);
        expect(result.weakestModuleRowCount).toBe(6001);
        expect(result.weakestModuleReason).toEqual(['Notification Success', 'Notification Experience']);

        expect(result.modulePerformance.findIndex((m) => m.key === 'communication_notifications')).toBe(5);
        result.modulePerformance.forEach((m) => {
            if (m.key !== 'communication_notifications' && m.eligible && m.overallScore !== null) {
                expect(m.overallScore).toBeGreaterThanOrEqual(73);
            }
        });
    });

    // Independent cross-check (not calling calculateAceModulePerformance) of
    // Communication & Notifications' 2 sub-metrics, proving the module's own
    // NA-exclusion/formula behavior against real data, not just synthetic
    // fixtures.
    it("independently recomputes Communication & Notifications' Notification Success and Notification Experience from raw records", () => {
        const successApplicable = records.filter((r) => !isNAlike(r['Notification Received?']));
        const successPositive = successApplicable.filter((r) => matchesAny(r['Notification Received?'], ['received on time']));
        const successPct = Math.round((successPositive.length / successApplicable.length) * 100);

        const experienceApplicable = records.filter(
            (r) =>
                !isNAlike(r['Notification Received?']) &&
                !isNAlike(r['Notification on Same Thread?']) &&
                !isNAlike(r['Notification Linked Correct Q-ID?']),
        );
        const experiencePositive = experienceApplicable.filter(
            (r) =>
                matchesAny(r['Notification Received?'], ['received on time', 'received late', 'yes']) &&
                isYes(r['Notification on Same Thread?']) &&
                isYes(r['Notification Linked Correct Q-ID?']),
        );
        const experiencePct = Math.round((experiencePositive.length / experienceApplicable.length) * 100);

        const entry = calculateAceModulePerformance(records).find((m) => m.key === 'communication_notifications')!;
        expect(entry.subMetrics.find((sm) => sm.key === 'notification_success')).toEqual({
            key: 'notification_success',
            label: 'Notification Success',
            value: successPct,
            applicable: successApplicable.length,
        });
        expect(entry.subMetrics.find((sm) => sm.key === 'notification_experience')).toEqual({
            key: 'notification_experience',
            label: 'Notification Experience',
            value: experiencePct,
            applicable: experienceApplicable.length,
        });
    });

    // Critical+High (this diagnostic) is a deliberately WIDER scope than
    // kpis.ts's countCriticalBugs (Critical only) - same distinction
    // already documented in kpis.ts's calculatePreviousPeriodStats. Both
    // scopes are still genuinely needed: criticalDefectCount stays
    // Critical+High here because the frontend's separate "Critical Defect
    // Tickets" card (diagnostics.openTickets) is intentionally that wider
    // scope too - its own empty state literally reads "No active
    // critical/high defects." Only the "All Critical Defects" SUMMARY
    // card's headline number moved to Critical-only
    // (kpis.criticalBreakdown.countCriticalBugs), matching Release
    // Health's Critical Defects count - this diagnostics.ts field itself
    // was deliberately left unchanged, per that card's audit.
    //
    // criticalOnly is computed via normalizeDefectSeverity (not a hand-
    // rolled CRITICAL/CRTICAL check) so it exercises the exact same
    // definition kpis.ts's countCriticalBugs uses, including the
    // "Extreme" -> "Critical" merge - a plain CRITICAL/CRTICAL check would
    // undercount by however many EXTREME rows exist (1, in this dataset),
    // silently drifting from what countCriticalBugs actually returns.
    it('criticalDefectCount is Critical+High, a wider scope than kpis.ts countCriticalBugs (Critical only)', () => {
        const result = calculateDiagnostics(records);
        const criticalOnly = records.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'Critical').length;
        expect(criticalOnly).toBe(121); // matches kpis.test.ts's countCriticalBugs
        expect(result.criticalDefectCount).toBe(412);
        expect(result.criticalDefectCount).toBeGreaterThan(criticalOnly);
    });

    it('openTickets deduplicates by URL and only includes rows with a valid http link', () => {
        const result = calculateDiagnostics(records);
        expect(result.openTickets.length).toBe(29);
        const urls = result.openTickets.map((t) => t.url);
        expect(new Set(urls).size).toBe(urls.length); // no duplicate URLs
        for (const ticket of result.openTickets) {
            expect(ticket.url.toLowerCase().startsWith('http')).toBe(true);
            expect(['Critical', 'High']).toContain(ticket.severity);
        }
    });

    it('Biggest Bottleneck stage averages match a fresh independent computation (2 stages spot-checked)', () => {
        const result = calculateDiagnostics(records);
        const byName = Object.fromEntries(result.stageStats.map((s) => [s.name, s.avg]));
        // Independently recomputed via a completely separate manual loop
        // (not calling timeToMinutes) immediately before writing this test.
        expect(byName['Review 1']).toBeCloseTo(1.6755, 3);
        expect(byName['Moderator']).toBeCloseTo(15.2427, 3);
        expect(result.bottleneckName).toBe('Moderator');
        expect(result.bottleneckTime).toBeCloseTo(15.2427, 3);
    });

    it('stageStats covers all 7 TAT_STAGES in order', () => {
        const result = calculateDiagnostics(records);
        expect(result.stageStats.map((s) => s.name)).toEqual(TAT_STAGES.map((s) => s.name));
    });

    it('returns sane defaults for an empty dataset', () => {
        const result = calculateDiagnostics([]);
        expect(result.bottleneckName).toBe('None');
        expect(result.bottleneckTime).toBe(0);
        expect(result.weakestModule).toBe('None');
        expect(result.weakestModuleScore).toBeNull();
        expect(result.weakestModuleRowCount).toBe(0);
        expect(result.weakestModuleReason).toEqual([]);
        expect(result.criticalDefectCount).toBe(0);
        expect(result.openTickets).toEqual([]);
        expect(result.modulePerformance.length).toBe(6);
        expect(
            result.modulePerformance.every((m) => m.applicableRowCount === 0 && m.eligible === false && m.overallScore === null),
        ).toBe(true);
        expect(result.comingSoonModules).toEqual(ACE_COMING_SOON_MODULES);
    });

    // Modules 8-10 (module 7 doesn't exist in the business list) are listed
    // after the 6 scored modules for the card to render as "Coming soon",
    // but must never factor into weakestModule - it's a static list that
    // doesn't even depend on rows.
    it('comingSoonModules lists modules 8-10 in order, unscored, and excluded from weakestModule', () => {
        const result = calculateDiagnostics(records);
        expect(result.comingSoonModules).toEqual([
            { key: 'review_quality', label: 'Review & Quality' },
            { key: 'farmer_context', label: 'Farmer Context' },
            { key: 'ace_platform_integrations', label: 'ACE Platform & Integrations' },
        ]);
        const modulePerformanceKeys = result.modulePerformance.map((m) => m.key);
        result.comingSoonModules.forEach((m) => expect(modulePerformanceKeys).not.toContain(m.key));
        // weakestModule is still picked from modulePerformance alone (6
        // scored modules) - unaffected by comingSoonModules' existence.
        expect(ACE_MODULE_KEYS.length).toBe(6);
        expect(result.weakestModule).toBe('Communication & Notifications');
    });
});

describe('calculateAceModulePerformance - ACE module formulas (synthetic)', () => {
    // 1. Farmer Interaction - isQuestionFramedApplicable excludes the
    // leaked "English" value (a Language Tested answer that landed in this
    // column) in addition to blank/NA; isQuestionWellFramed only counts
    // "Well Framed" variants and a plain yes/y as correct.
    it('Farmer Interaction excludes blank/NA/leaked-English rows and only counts Well Framed/yes as correct', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Question Correctly Framed?': 'Well Framed' },
            { 'Question Correctly Framed?': 'yes' },
            { 'Question Correctly Framed?': 'Not Well Framed' },
            { 'Question Correctly Framed?': 'Ambiguous' },
            { 'Question Correctly Framed?': '' },
            { 'Question Correctly Framed?': 'NA' },
            { 'Question Correctly Framed?': 'English' },
        ];
        const [farmerInteraction] = calculateAceModulePerformance(rows);
        expect(farmerInteraction.key).toBe('farmer_interaction');
        // 2 correct (Well Framed, yes) / 4 applicable (excludes blank/NA/English).
        expect(farmerInteraction.subMetrics).toEqual([
            { key: 'question_framed', label: 'Question Correctly Framed', value: 50, applicable: 4 },
        ]);
        expect(farmerInteraction.overallScore).toBe(50);
    });

    // 2. Agri Advisory - scoped via isScientificAccuracyEligible (any
    // recognized Type of Question - GDB, Unique, Outreach, OR Dynamic), the
    // same shared scoping Trust Score's A_sci and Knowledge & GDB's own
    // Scientific Accuracy sub-metric reuse. A row with no recognized Type of
    // Question at all (e.g. "Quality Checking") must still be excluded, even
    // though it has real data - proves the gate excludes untagged/garbage
    // rows specifically, not Dynamic rows.
    it('Agri Advisory includes Dynamic rows but excludes rows with no recognized Type of Question', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'Correct' },
            { 'Type of Question': 'Unique', 'Answer Scientifically Correct?': 'yes' },
            { 'Type of Question': 'Outreach', 'Answer Scientifically Correct?': 'Incorrect' },
            { 'Type of Question': 'Dynamic', 'Answer Scientifically Correct?': 'Correct' },
            { 'Type of Question': 'Quality Checking', 'Answer Scientifically Correct?': 'Correct' },
        ];
        const [, agriAdvisory] = calculateAceModulePerformance(rows);
        expect(agriAdvisory.key).toBe('agri_advisory');
        // 3 correct (Correct, yes, and the Dynamic row's Correct, via
        // isScientificallyCorrect) / 4 applicable rows - the "Quality
        // Checking" row is excluded (no recognized Type of Question), the
        // Dynamic row is included.
        expect(agriAdvisory.subMetrics).toEqual([
            { key: 'scientific_accuracy_static', label: 'Scientific Accuracy', value: 75, applicable: 4 },
        ]);
    });

    // 3. Knowledge & GDB - Correct Source Links is global (NOT scoped to
    // Scientific Accuracy's eligibility rule at all), while Scientific
    // Accuracy now shares BOTH Agri Advisory/A_sci's scoping
    // (isScientificAccuracyEligible - Static + Dynamic, no longer GDB-only)
    // AND its match rule (isScientificallyCorrect - accepts a plain yes/y
    // too). It used to keep its own stricter "correct"-only match left over
    // from its GDB-only days; that's gone now, so a "yes" answer counts the
    // same way here as it does in Agri Advisory. A "Quality Checking" row's
    // real data still doesn't count towards Scientific Accuracy (no
    // recognized Type of Question).
    it('Knowledge & GDB Scientific Accuracy now matches Agri Advisory exactly - same scoping and match rule (accepts yes/y)', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Type of Question': 'GDB', 'Correct Source Links Provided?': 'Yes', 'Answer Scientifically Correct?': 'Correct' },
            { 'Type of Question': 'GDB', 'Correct Source Links Provided?': 'No', 'Answer Scientifically Correct?': 'yes' },
            { 'Type of Question': 'Dynamic', 'Correct Source Links Provided?': 'Yes', 'Answer Scientifically Correct?': 'Incorrect' },
            { 'Type of Question': 'Quality Checking', 'Correct Source Links Provided?': 'Yes', 'Answer Scientifically Correct?': 'Correct' },
        ];
        const [, agriAdvisory, knowledgeGdb] = calculateAceModulePerformance(rows);
        expect(knowledgeGdb.key).toBe('knowledge_gdb');
        // Correct Source Links: 3 Yes / 4 (global, all 4 rows applicable) -
        // unaffected by this fix.
        // Scientific Accuracy: the GDB + Dynamic rows count (3 applicable,
        // the "Quality Checking" row excluded); "Correct" AND the plain
        // "yes" both count as positive now -> 2/3 = 67%.
        expect(knowledgeGdb.subMetrics).toEqual([
            { key: 'correct_source_links', label: 'Correct Source Links', value: 75, applicable: 4 },
            { key: 'scientific_accuracy_gdb', label: 'Scientific Accuracy', value: 67, applicable: 3 },
        ]);

        // The whole point of the fix: Knowledge & GDB's Scientific Accuracy
        // sub-metric must be byte-for-byte identical to Agri Advisory's on
        // the exact same rows, since both now reuse the same scoping AND
        // match functions - proving the two can't drift apart again.
        const kgSci = knowledgeGdb.subMetrics.find((sm) => sm.key === 'scientific_accuracy_gdb')!;
        const agriSci = agriAdvisory.subMetrics.find((sm) => sm.key === 'scientific_accuracy_static')!;
        expect(kgSci.value).toBe(agriSci.value);
        expect(kgSci.applicable).toBe(agriSci.applicable);
    });

    // 4. Dynamic Advisory - unlike Trust Score's A_dom (which defaults an
    // empty domain to 100 so it doesn't drag the blended average down), a
    // sub-metric with zero applicable rows must be SKIPPED here entirely -
    // Weakest Module must never let an empty domain masquerade as perfect.
    it('Dynamic Advisory skips a sub-metric with zero applicable rows, never defaulting it to 100 (unlike Trust Score A_dom)', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Question Category': 'Climate, Weather and Stress Management', 'Type of Question': 'Dynamic', 'Weather Q Answered Correctly?': 'Yes' },
            { 'Question Category': 'Climate, Weather and Stress Management', 'Type of Question': 'Dynamic', 'Weather Q Answered Correctly?': 'No' },
            // No Mandi Prices or Government Schemes rows at all.
        ];
        const [, , , dynamicAdvisory] = calculateAceModulePerformance(rows);
        expect(dynamicAdvisory.key).toBe('dynamic_advisory');
        expect(dynamicAdvisory.subMetrics).toEqual([
            { key: 'weather_accuracy', label: 'Weather Accuracy', value: 50, applicable: 2 },
            { key: 'mandi_accuracy', label: 'Mandi Accuracy', value: null, applicable: 0 },
            { key: 'scheme_accuracy', label: 'Scheme Accuracy', value: null, applicable: 0 },
        ]);
        // overallScore is Weather's own 50%, not an average that includes
        // 2 phantom 100s for the empty Mandi/Scheme domains.
        expect(dynamicAdvisory.overallScore).toBe(50);
    });

    // 5. Multilingual & Voice - Voice Input/Output Quality only count
    // "Clear" as positive (stricter than calculateVoiceSuccess's 0-10 scale,
    // which also credits "Good"/"yes"/"correct") - and overallScore averages
    // only the sub-metrics with real applicable data.
    it('Multilingual & Voice Quality sub-metrics only count Clear as positive, and skip sub-metrics with no data', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Voice Input Quality': 'Clear', 'Voice Output Quality': 'Good' },
            { 'Voice Input Quality': 'Good', 'Voice Output Quality': 'Clear' },
        ];
        const [, , , , multilingualVoice] = calculateAceModulePerformance(rows);
        expect(multilingualVoice.key).toBe('multilingual_voice');
        const byKey = Object.fromEntries(multilingualVoice.subMetrics.map((sm) => [sm.key, sm]));
        // Only 1 of 2 rows is "Clear" for each field - "Good" does not count,
        // unlike calculateVoiceSuccess's blended score which credits it.
        expect(byKey['voice_input_quality']).toEqual({ key: 'voice_input_quality', label: 'Voice Input Quality (Clear)', value: 50, applicable: 2 });
        expect(byKey['voice_output_quality']).toEqual({ key: 'voice_output_quality', label: 'Voice Output Quality (Clear)', value: 50, applicable: 2 });
        // Translation Quality and both Voice Working fields are entirely
        // blank across these rows - null, not 0, and skipped from the average.
        expect(byKey['translation_quality'].value).toBeNull();
        expect(byKey['voice_input_working'].value).toBeNull();
        expect(byKey['voice_output_working'].value).toBeNull();
        expect(multilingualVoice.overallScore).toBe(50);
    });

    // 6. Communication & Notifications - Notification Success only counts
    // "Received on Time" (narrower than Notification Experience's own
    // Notification Received? condition, which also accepts "Received
    // Late"/"yes") - a "Received Late" row counts for neither Success's
    // numerator nor (missing the other 2 fields) Experience's denominator.
    it('Notification Success is narrower than Notification Experience\'s Notification Received? condition', () => {
        const rows: TestersDashboardRecord[] = [
            {
                'Notification Received?': 'Received on Time',
                'Notification on Same Thread?': 'Yes',
                'Notification Linked Correct Q-ID?': 'Yes',
            },
            { 'Notification Received?': 'Received Late', 'Notification on Same Thread?': 'Yes', 'Notification Linked Correct Q-ID?': 'Yes' },
            { 'Notification Received?': 'Not Received' },
        ];
        const [, , , , , communicationNotifications] = calculateAceModulePerformance(rows);
        expect(communicationNotifications.key).toBe('communication_notifications');
        // Notification Success: only the 1st row is "Received on Time" -> 1/3.
        // Notification Experience: both the 1st and 2nd rows satisfy all 3
        // conditions ("Received Late" DOES count there) -> 2/2 = 100%.
        expect(communicationNotifications.subMetrics).toEqual([
            { key: 'notification_success', label: 'Notification Success', value: 33, applicable: 3 },
            { key: 'notification_experience', label: 'Notification Experience', value: 100, applicable: 2 },
        ]);
    });

    // Eligibility: MIN_ROWS_FOR_WEAKEST_MODULE gates on the UNION of rows
    // applicable to at least one sub-metric, not any single sub-metric's own
    // count - a module below that union threshold is never eligible to win
    // Weakest Module, even with a terrible score.
    it('a module below MIN_ROWS_FOR_WEAKEST_MODULE applicable rows (union across sub-metrics) is ineligible regardless of score', () => {
        expect(MIN_ROWS_FOR_WEAKEST_MODULE).toBe(10);
        const rows: TestersDashboardRecord[] = Array.from({ length: 9 }, () => ({ 'Question Correctly Framed?': 'Incorrectly Framed' }));
        const [farmerInteraction] = calculateAceModulePerformance(rows);
        expect(farmerInteraction.applicableRowCount).toBe(9);
        expect(farmerInteraction.eligible).toBe(false);
        expect(farmerInteraction.overallScore).toBe(0);
    });

    it('calculateDiagnostics never selects an ineligible module as weakestModule, even when it scores lower than every eligible module', () => {
        const tinyTerribleRows: TestersDashboardRecord[] = Array.from({ length: 9 }, () => ({
            'Question Correctly Framed?': 'Incorrectly Framed',
        }));
        const healthyRows: TestersDashboardRecord[] = Array.from({ length: 12 }, () => ({
            'Type of Question': 'GDB',
            'Answer Scientifically Correct?': 'Correct',
        }));
        const result = calculateDiagnostics([...tinyTerribleRows, ...healthyRows]);
        const farmerInteraction = result.modulePerformance.find((m) => m.key === 'farmer_interaction')!;
        expect(farmerInteraction.eligible).toBe(false);
        expect(farmerInteraction.overallScore).toBe(0);
        // Farmer Interaction would win on score alone (0% vs Agri Advisory's
        // 100%), but its ineligibility must keep it from being weakestModule.
        expect(result.weakestModule).toBe('Agri Advisory');
    });

    // "Mainly affected by X and Y" - weakestMetricLabels must be genuinely
    // derived from ranking THIS module's own applicable sub-metric values,
    // not a hardcoded per-module guess.
    it('weakestMetricLabels is genuinely derived from the module\'s own lowest-scoring applicable sub-metrics, not hardcoded (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [
            // "Received Late" fails Notification Success's narrower
            // "Received on Time"-only positive, but DOES satisfy
            // Notification Experience's broader Notification Received?
            // condition (given same-thread + correct-Q-ID also hold).
            { 'Notification Received?': 'Received on Time', 'Notification on Same Thread?': 'Yes', 'Notification Linked Correct Q-ID?': 'Yes' },
            { 'Notification Received?': 'Received Late', 'Notification on Same Thread?': 'Yes', 'Notification Linked Correct Q-ID?': 'Yes' },
            { 'Notification Received?': 'Received Late', 'Notification on Same Thread?': 'Yes', 'Notification Linked Correct Q-ID?': 'Yes' },
            { 'Notification Received?': 'Received on Time', 'Notification on Same Thread?': 'Yes', 'Notification Linked Correct Q-ID?': 'Yes' },
        ];
        const [, , , , , communicationNotifications] = calculateAceModulePerformance(rows);
        // Notification Success: 2/4 = 50% (only the 2 "Received on Time" rows).
        // Notification Experience: 4/4 = 100% ("Received Late" counts here).
        expect(communicationNotifications.subMetrics.find((sm) => sm.key === 'notification_success')!.value).toBe(50);
        expect(communicationNotifications.subMetrics.find((sm) => sm.key === 'notification_experience')!.value).toBe(100);
        expect(communicationNotifications.weakestMetricLabels[0]).toBe('Notification Success');
    });
});

// Sheet 3.0's real Test Log tab was fetched and inspected before merging it
// in (Step 0 of the Sheet 3.0 sync work) - every distinct Type of
// Question/Question Category value it actually contains was tabulated
// against the live sheet and confirmed by name here, NOT assumed. This
// isn't testing sheetMerge.ts's merge mechanics (see sheetMerge.test.ts for
// that, with synthetic fixtures) - it's confirming that once Sheet 3.0's
// real rows are physically present in updated.csv (post-sync), the
// EXISTING generic moduleGroupFor/dynamicSubBucketFor logic - unchanged by
// the Sheet 3.0 work - resolves all of them correctly with zero new
// per-value mapping code, exactly as the Step 0 investigation predicted.
describe('Sheet 3.0 real values resolve via the existing moduleGroupFor/dynamicSubBucketFor logic (no new mapping needed)', () => {
    // Confirmed via a direct Sheets API fetch of Sheet 3.0's "Test Log" tab
    // immediately before this test was written - the complete, exact set of
    // Type of Question values found there (1006 real data rows): GDB (173),
    // Unique (201), Outreach (228), Dynamic (56), WEATHER DYNAMIC (202),
    // MANDI DYNAMIC (31), SCHEME DYNAMIC (77), STATIC DYNAMIC (3), and 4
    // blank rows. No value outside this list exists in Sheet 3.0.
    it('every Type of Question value confirmed present in Sheet 3.0 resolves to the correct moduleGroupFor bucket', () => {
        expect(moduleGroupFor('GDB')).toBe('GDB');
        expect(moduleGroupFor('Unique')).toBe('Unique Questions');
        expect(moduleGroupFor('Outreach')).toBe('Outreach');
        expect(moduleGroupFor('Dynamic')).toBe('Dynamic');
        expect(moduleGroupFor('WEATHER DYNAMIC')).toBe('Dynamic');
        expect(moduleGroupFor('MANDI DYNAMIC')).toBe('Dynamic');
        expect(moduleGroupFor('SCHEME DYNAMIC')).toBe('Dynamic');
        // Static Dynamic was excluded from every moduleGroupFor bucket
        // after this test was originally written (Hemanth: "You can remove
        // static dynamic category") - Sheet 3.0's 3 confirmed STATIC
        // DYNAMIC rows now resolve to null here too, same as any other
        // unrecognized value, not their own bucket.
        expect(moduleGroupFor('STATIC DYNAMIC')).toBeNull();
        expect(moduleGroupFor('')).toBeNull();
    });

    it('the 3 compound *_DYNAMIC values confirmed in Sheet 3.0 resolve to their correct Dynamic sub-bucket', () => {
        expect(dynamicSubBucketFor('', 'WEATHER DYNAMIC')).toBe('Weather');
        expect(dynamicSubBucketFor('', 'MANDI DYNAMIC')).toBe('Mandi Prices');
        expect(dynamicSubBucketFor('', 'SCHEME DYNAMIC')).toBe('Government Schemes');
    });

    // Sheet 1.0+2.0 ALONE (i.e. updated.csv before Sheet 3.0 was ever added
    // to TESTERS_DASHBOARD_SHEETS) were independently measured immediately
    // before the Sheet 3.0 sync work: WEATHER DYNAMIC=626, MANDI
    // DYNAMIC=111, SCHEME DYNAMIC=245, STATIC DYNAMIC=10. Asserting merely
    // "count > 0" or "count >= Sheet 3.0's own contribution" would be true
    // even WITHOUT Sheet 3.0 ever having merged (2.0 alone already clears
    // Sheet 3.0's individual counts) - not a real proof the merge happened.
    // Asserting >= that pre-3.0 baseline PLUS Sheet 3.0's own confirmed
    // contribution (202/31/77/3 - see the comment above) is what actually
    // distinguishes "3.0 merged in" from "3.0 never ran."
    it('WEATHER DYNAMIC/MANDI DYNAMIC/SCHEME DYNAMIC/STATIC DYNAMIC counts include Sheet 3.0s contribution on top of the pre-3.0 baseline', () => {
        const rawTypeCounts = new Map<string, number>();
        for (const r of records) {
            const raw = (r['Type of Question'] || '').trim().toUpperCase();
            if (['WEATHER DYNAMIC', 'MANDI DYNAMIC', 'SCHEME DYNAMIC', 'STATIC DYNAMIC'].includes(raw)) {
                rawTypeCounts.set(raw, (rawTypeCounts.get(raw) || 0) + 1);
            }
        }
        expect(rawTypeCounts.get('WEATHER DYNAMIC') || 0).toBeGreaterThanOrEqual(626 + 202);
        expect(rawTypeCounts.get('MANDI DYNAMIC') || 0).toBeGreaterThanOrEqual(111 + 31);
        expect(rawTypeCounts.get('SCHEME DYNAMIC') || 0).toBeGreaterThanOrEqual(245 + 77);
        expect(rawTypeCounts.get('STATIC DYNAMIC') || 0).toBeGreaterThanOrEqual(10 + 3);
    });
});
