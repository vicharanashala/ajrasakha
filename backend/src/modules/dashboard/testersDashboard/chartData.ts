// Trend chart data for the Testers Dashboard - daily Trust Score,
// Farmer Experience Score, average response latency, and average review
// TAT, feeding all 4 chart tabs (they just plot different fields from the
// same array).
//
// Ported near-verbatim from frontend/src/features/testersDashboard/TestersDashboard.tsx
// (Phase 5, the final phase of moving KPI/diagnostics/chart calculation
// server-side - composes normalize.ts (Phase 1), filters.ts (Phase 2),
// kpis.ts (Phase 3), and diagnostics.ts (Phase 4) rather than duplicating
// any of their logic).

import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import { timeToMinutes, parseTestDateToISO } from './normalize.js';
import { RESPONSE_TIME_KEY } from './filters.js';
import { calculateTrustScore, calculateExperienceScore, trustScoreHasData, experienceScoreHasData } from './kpis.js';
import { TAT_STAGES } from './diagnostics.js';

export interface ScoreTrendPoint {
    date: string;
    trust: number;
    // Does this day have real applicable data behind Trust Score, not just
    // A_dom's zero-rows-defaults-to-100 default with the other 5
    // sub-metrics at a genuine 0? False on a day where every row is
    // essentially blank across all 6 sub-metric fields - trust still
    // reports its computed number (kept for API completeness/debugging),
    // but the frontend renders that point as a gap rather than plotting the
    // misleading ~20% floor. See kpis.ts's trustScoreHasData for the exact
    // per-field check and why this is a chart-only concern, not a change to
    // calculateTrustScore itself (which the main dashboard's Trust Score
    // card still relies on unchanged).
    trustHasData: boolean;
    experience: number;
    // Same distinction as trustHasData, for Farmer Experience Score - see
    // kpis.ts's experienceScoreHasData. Farmer Experience's 5 sub-metrics
    // all correctly default to 0 (no non-zero phantom default like A_dom),
    // so this exists purely to distinguish a genuine 0% from no-data-at-all,
    // not to fix a floor bug like Trust Score's.
    experienceHasData: boolean;
    avgLatency: number;
    // Count of rows this day with a parseable Response Time reading -
    // avgLatency is 0 both when every reading genuinely averaged to ~0min
    // AND when there were zero readings at all; this field lets the
    // frontend tell those apart (0 readings -> render a gap, not a plotted
    // 0) without changing avgLatency's own calculation, which was already
    // correct.
    avgLatencySampleCount: number;
    avgReviewTat: number;
    // Same distinction as avgLatencySampleCount, for Review TAT (summed
    // across all 7 TAT_STAGES, same as avgReviewTat itself).
    avgReviewTatSampleCount: number;
}

export interface ChartData {
    scoreTrend: ScoreTrendPoint[];
}

// Matches the frontend's `chartData` useMemo exactly - groups the given
// (already filtered) rows by their parsed ISO Test Date, then computes one
// point per day. Rows whose Test Date doesn't parse (parseTestDateToISO
// returns null) are excluded entirely, not grouped under a bogus bucket.
export function calculateChartData(rows: TestersDashboardRecord[]): ChartData {
    const dailyGroups: Record<string, TestersDashboardRecord[]> = {};
    rows.forEach((r) => {
        // Group by the normalized ISO date rather than the raw string - the
        // live sheet mixes DD-MM-YYYY, DD/MM/YYYY, DD-MM-YY, etc, and sorting
        // those as raw strings does NOT produce chronological order.
        const iso = parseTestDateToISO(r['Test Date']);
        if (iso) {
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
