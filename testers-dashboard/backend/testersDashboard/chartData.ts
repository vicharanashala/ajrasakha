// Trend chart data for the Testers Dashboard - daily Trust Score, Farmer
// Experience Score, average response latency, and average review TAT,
// feeding all 4 chart tabs (they just plot different fields from the same
// array).

import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import { timeToMinutes, parseTestDateToISO } from './normalize.js';
import { RESPONSE_TIME_KEY, type TypeBranch } from './filters.js';
import { calculateTrustScore, calculateExperienceScore, trustScoreHasData, experienceScoreHasData } from './kpis.js';
import { TAT_STAGES } from './diagnostics.js';

export interface ScoreTrendPoint {
    date: string;
    trust: number;
    // Whether this day has real applicable data behind Trust Score (kpis.ts's
    // trustScoreHasData) - trust still reports its computed number; the
    // frontend renders a gap instead of the misleading floor when false.
    trustHasData: boolean;
    experience: number;
    // Same distinction as trustHasData, for Farmer Experience Score.
    experienceHasData: boolean;
    avgLatency: number;
    // Count of rows this day with a parseable Response Time reading -
    // avgLatency is 0 both when readings genuinely averaged to ~0min and when
    // there were zero readings; this lets the frontend tell those apart.
    avgLatencySampleCount: number;
    avgReviewTat: number;
    avgReviewTatSampleCount: number;
}

export interface ChartData {
    scoreTrend: ScoreTrendPoint[];
}

// The real recording period starts around 2026 - a small number of rows
// carry an obviously-wrong Test Date years earlier, which stretches the
// chart's x-axis and compresses all the real data into its right-hand edge.
// Chart-only: those rows still count everywhere else on the dashboard (KPIs,
// diagnostics, filters), just not plotted here.
const CHART_START_DATE = '2026-01-01';

// Groups the given (already filtered) rows by their parsed ISO Test Date,
// then computes one point per day. Rows whose Test Date doesn't parse, or
// falls before CHART_START_DATE, are excluded entirely, not grouped under a
// bogus bucket - parseTestDateToISO itself also excludes future-dated rows.
//
// `now` is injectable purely so "today" is deterministic in tests -
// production callers should omit it, consistent with applyDateRangeFilter
// in filters.ts.
export function calculateChartData(
    rows: TestersDashboardRecord[],
    now: Date = new Date(),
    typeBranch: TypeBranch = 'all',
): ChartData {
    const dailyGroups: Record<string, TestersDashboardRecord[]> = {};
    rows.forEach((r) => {
        // Grouped by the normalized ISO date, not the raw string - the live
        // sheet mixes date formats, and sorting those as raw strings does
        // NOT produce chronological order.
        const iso = parseTestDateToISO(r['Test Date'], now);
        if (iso && iso >= CHART_START_DATE) {
            if (!dailyGroups[iso]) dailyGroups[iso] = [];
            dailyGroups[iso].push(r);
        }
    });

    const sortedDates = Object.keys(dailyGroups).sort();
    const scoreTrend: ScoreTrendPoint[] = sortedDates.map((d) => {
        const dayRows = dailyGroups[d];
        // Same functions the KPI cards use, so the chart's daily values are
        // always consistent with what the cards show - typeBranch passed
        // through so the Static branch's fixed weight table applies here too.
        const trust = calculateTrustScore(dayRows, typeBranch).score;
        const trustHasData = trustScoreHasData(dayRows);
        const experience = calculateExperienceScore(dayRows).score;
        const experienceHasData = experienceScoreHasData(dayRows);

        let sumMin = 0;
        let countMin = 0;
        dayRows.forEach((r) => {
            const m = timeToMinutes(r[RESPONSE_TIME_KEY]);
            if (m !== null) {
                sumMin += m;
                countMin++;
            }
        });
        const avgLatency = countMin ? Math.round((sumMin / countMin) * 10) / 10 : 0;

        let tatSum = 0;
        let tatCount = 0;
        dayRows.forEach((r) => {
            TAT_STAGES.forEach((stage) => {
                const m = timeToMinutes(r[stage.key]);
                if (m !== null) {
                    tatSum += m;
                    tatCount++;
                }
            });
        });
        const avgReviewTat = tatCount ? Math.round((tatSum / tatCount) * 10) / 10 : 0;

        return {
            date: d,
            trust,
            trustHasData,
            experience,
            experienceHasData,
            avgLatency,
            avgLatencySampleCount: countMin,
            avgReviewTat,
            avgReviewTatSampleCount: tatCount,
        };
    });

    return { scoreTrend };
}
