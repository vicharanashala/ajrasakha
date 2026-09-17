// Trend chart data for the Testers Dashboard - daily Trust Score, Farmer
// Experience Score, average response latency, and average review TAT,
// feeding all 4 chart tabs (they just plot different fields from the same
// array).

import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import { timeToMinutes, parseTestDateToISO } from './normalize.js';
import { RESPONSE_TIME_KEY } from './filters.js';
import { calculateTrustScore, calculateExperienceScore, trustScoreHasData, experienceScoreHasData } from './kpis.js';
import { TAT_STAGES } from './diagnostics.js';

export interface ScoreTrendPoint {
    date: string;
    trust: number;
    // Whether this day has real applicable data behind Trust Score, not
    // just A_dom's zero-rows-defaults-to-100 floor - see kpis.ts's
    // trustScoreHasData. trust still reports its computed number; the
    // frontend renders a gap instead of the misleading floor when false.
    trustHasData: boolean;
    experience: number;
    // Same distinction as trustHasData, for Farmer Experience Score - see
    // kpis.ts's experienceScoreHasData.
    experienceHasData: boolean;
    avgLatency: number;
    // Count of rows this day with a parseable Response Time reading -
    // avgLatency is 0 both when every reading genuinely averaged to ~0min
    // and when there were zero readings; this lets the frontend tell those
    // apart (0 readings -> gap, not a plotted 0).
    avgLatencySampleCount: number;
    avgReviewTat: number;
    // Same distinction as avgLatencySampleCount, for Review TAT.
    avgReviewTatSampleCount: number;
}

export interface ChartData {
    scoreTrend: ScoreTrendPoint[];
}

// The real recording period starts around June 2026 - a small number of
// rows carry an obviously-wrong Test Date years earlier (2022, 2023, 2025),
// which stretches the chart's x-axis and compresses all the real data into
// its right-hand edge. Chart-only, same treatment as the future-date
// cutoff below: those rows still count everywhere else on the dashboard
// (KPIs, diagnostics, filters), just not plotted here.
const CHART_START_DATE = '2026-01-01';

// Groups the given (already filtered) rows by their parsed ISO Test Date,
// then computes one point per day. Rows whose Test Date doesn't parse, or
// falls before CHART_START_DATE, are excluded entirely, not grouped under a
// bogus bucket - parseTestDateToISO itself also excludes (returns null for)
// a Test Date later than today (IST), so a row with a confirmed data-entry
// mistake landing it months ahead of the real recording period (month
// incremented while the day stayed fixed) is excluded everywhere, not just
// from this chart.
//
// `now` is injectable (defaults to the real current time) purely so "today"
// is deterministic in tests - production callers should omit it. Same
// pattern as applyDateRangeFilter in filters.ts, which this cutoff is
// deliberately kept consistent with.
export function calculateChartData(rows: TestersDashboardRecord[], now: Date = new Date()): ChartData {
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
        // always consistent with what the cards show for that same period.
        const trust = calculateTrustScore(dayRows).score;
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
