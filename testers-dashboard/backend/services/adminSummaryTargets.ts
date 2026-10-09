import type {
    AdminSummaryCounts,
    AdminSummaryDailyTargets,
    ChannelCountSummary,
    QuestionTypeCountRow,
    QuestionTypeKey,
    TesterLogEntry,
} from '../interfaces/ITesterLogService.js';
import { normalizeChannel } from '../testersDashboard/normalize.js';

// Admin Summary target model - the business's Excel ("End to End Testing
// Pipeline") per-tester daily targets. This is the only place the Admin
// Summary's numbers are defined: the 54 / 27 / 27 totals are derived from
// the rows below (and pinned against the Excel by the tests), and the API
// sends them to the frontend, which has no target table of its own.
//
// Used by TesterLogService.getQuestionTypeSummary only. The tester-facing
// My Summary (getMySummary, TesterLogSummary.tsx) keeps its own tables and
// is deliberately not wired to this.
export const WORKING_MINUTES_PER_TESTER_PER_DAY = 450;

export const QUESTION_TYPE_TARGETS: {
    key: QuestionTypeKey;
    label: string;
    // typeOfQuestion values counted as this category, compared after
    // compactQuestionType (so case, spaces and dashes don't matter).
    // The Dynamic sub-types accept either word order, so "Weather Dynamic"
    // (today's form value) and a renamed "Dynamic - Weather" both count.
    aliases: string[];
    perDay: number;
    webAppPerDay: number;
    whatsAppPerDay: number;
}[] = [
    { key: 'unique', label: 'Unique', aliases: ['unique'], perDay: 8, webAppPerDay: 4, whatsAppPerDay: 4 },
    { key: 'gdb', label: 'GDB', aliases: ['gdb'], perDay: 8, webAppPerDay: 4, whatsAppPerDay: 4 },
    { key: 'outreach', label: 'Outreach', aliases: ['outreach'], perDay: 11, webAppPerDay: 6, whatsAppPerDay: 5 },
    { key: 'weather', label: 'Dynamic – Weather', aliases: ['weatherdynamic', 'dynamicweather'], perDay: 19, webAppPerDay: 9, whatsAppPerDay: 10 },
    { key: 'scheme', label: 'Dynamic – Scheme', aliases: ['schemedynamic', 'dynamicscheme'], perDay: 6, webAppPerDay: 3, whatsAppPerDay: 3 },
    { key: 'mandi', label: 'Dynamic – Mandi', aliases: ['mandidynamic', 'dynamicmandi'], perDay: 2, webAppPerDay: 1, whatsAppPerDay: 1 },
];

export const DAILY_TARGETS_PER_TESTER: AdminSummaryDailyTargets = {
    workingMinutes: WORKING_MINUTES_PER_TESTER_PER_DAY,
    total: QUESTION_TYPE_TARGETS.reduce((sum, t) => sum + t.perDay, 0),
    webApp: QUESTION_TYPE_TARGETS.reduce((sum, t) => sum + t.webAppPerDay, 0),
    whatsApp: QUESTION_TYPE_TARGETS.reduce((sum, t) => sum + t.whatsAppPerDay, 0),
};

function compactQuestionType(value?: string): string {
    return (value || '').toLowerCase().replace(/[^a-z]/g, '');
}

const KEY_BY_ALIAS = new Map<string, QuestionTypeKey>(
    QUESTION_TYPE_TARGETS.flatMap((t) => t.aliases.map((a) => [a, t.key] as [string, QuestionTypeKey])),
);

// typeOfQuestion -> one of the 6 Excel categories, or null. A bare
// "Dynamic" (no Weather/Scheme/Mandi) or a blank type has no target row and
// is not guessed into one - it is reported as uncategorized instead.
export function questionTypeKeyFor(typeOfQuestion?: string): QuestionTypeKey | null {
    return KEY_BY_ALIAS.get(compactQuestionType(typeOfQuestion)) ?? null;
}

// "Both" counts toward both channels' actuals (tested on each), so Web App +
// WhatsApp actuals can exceed the Total actual; a blank channel counts
// toward neither.
export function countsTowardsChannel(channelTested: string | undefined, channel: 'webApp' | 'whatsApp'): boolean {
    const normalized = normalizeChannel(channelTested);
    if (normalized === 'Both') return true;
    return channel === 'webApp' ? normalized === 'Web App' : normalized === 'WhatsApp';
}

// Calendar days in [start, end], inclusive; 0 for a missing or reversed range.
export function calendarDaysBetween(start: string | undefined, end: string | undefined): number {
    if (!start || !end) return 0;
    const sMs = Date.parse(`${start.slice(0, 10)}T00:00:00.000Z`);
    const eMs = Date.parse(`${end.slice(0, 10)}T00:00:00.000Z`);
    if (isNaN(sMs) || isNaN(eMs) || eMs < sMs) return 0;
    return Math.round((eMs - sMs) / (24 * 60 * 60 * 1000)) + 1;
}

// Testers work 6 days a week, each with their own weekly day off, so there's
// no shared off day to subtract - calendar days × 6/7, rounded, is the
// agreed stand-in. Every tester in a range is scored against this same
// figure, whether they logged anything or not.
export function workingDaysFor(calendarDays: number): number {
    return Math.round((calendarDays * 6) / 7);
}

// Actual ÷ target × 100, unrounded - the Admin Summary formats it for
// display (one decimal place), so e.g. 8 of 1,836 shows as 0.4%, not 0%.
// Not the shared normalize.ts pct(), which rounds to whole numbers for the
// Sheet Analytics KPIs. 0 when there is no target.
export function achievementPct(actual: number, target: number): number {
    return target > 0 ? (actual / target) * 100 : 0;
}

function channelSummary(target: number, actual: number): ChannelCountSummary {
    return { target, actual, achievementPct: achievementPct(actual, target) };
}

// The one place targets and actuals are computed, for any set of entries
// and headcount: a single tester (headcount 1), one row of the All Testers
// table (headcount 1) and the All Testers totals (headcount = testers
// listed) all go through here, so they can't drift apart. Every figure is
// per-type first; the Total row and the channel cards are sums of those.
export function summarizeEntries(
    entries: TesterLogEntry[],
    workingDays: number,
    headcount: number,
): AdminSummaryCounts {
    const scale = workingDays * headcount;
    let uncategorizedCount = 0;
    const perType = new Map<QuestionTypeKey, { actual: number; webApp: number; whatsApp: number }>(
        QUESTION_TYPE_TARGETS.map((t) => [t.key, { actual: 0, webApp: 0, whatsApp: 0 }]),
    );

    for (const entry of entries) {
        const key = questionTypeKeyFor(entry.typeOfQuestion);
        if (!key) {
            uncategorizedCount += 1;
            continue;
        }
        const counts = perType.get(key)!;
        counts.actual += 1;
        if (countsTowardsChannel(entry.channelTested, 'webApp')) counts.webApp += 1;
        if (countsTowardsChannel(entry.channelTested, 'whatsApp')) counts.whatsApp += 1;
    }

    const typeRows: QuestionTypeCountRow[] = QUESTION_TYPE_TARGETS.map((t) => {
        const counts = perType.get(t.key)!;
        const target = t.perDay * scale;
        return {
            key: t.key,
            label: t.label,
            target,
            actual: counts.actual,
            achievementPct: achievementPct(counts.actual, target),
            webApp: channelSummary(t.webAppPerDay * scale, counts.webApp),
            whatsApp: channelSummary(t.whatsAppPerDay * scale, counts.whatsApp),
        };
    });

    const sum = (pick: (r: QuestionTypeCountRow) => number) => typeRows.reduce((s, r) => s + pick(r), 0);
    const webApp = channelSummary(sum((r) => r.webApp.target), sum((r) => r.webApp.actual));
    const whatsApp = channelSummary(sum((r) => r.whatsApp.target), sum((r) => r.whatsApp.actual));
    const overall = channelSummary(sum((r) => r.target), sum((r) => r.actual));

    return {
        overall,
        webApp,
        whatsApp,
        byType: [...typeRows, { key: 'total', label: 'Total', ...overall, webApp, whatsApp }],
        counts: Object.fromEntries(typeRows.map((r) => [r.key, r.actual])) as Record<QuestionTypeKey, number>,
        uncategorizedCount,
    };
}
