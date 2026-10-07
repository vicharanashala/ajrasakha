// Database Logs Analytics Score Trend: one point per calendar day with
// entries, each recalculated from that day's entries only. Days come from the
// stored testDate (createdAt fallback) - no year cap, no start-date cutoff.

import { dbEntryDate } from '../services/dbFilterOptions.js';
import { type Entry, average, responseMinutes, round1 } from './values.js';
import { experienceScore, trustScore } from './kpis.js';
import { tatReadings } from './diagnostics.js';
import type { DbChartData } from './types.js';

export function calculateDbChartData(entries: Entry[], typeBranch: string): DbChartData {
    const byDay = new Map<string, Entry[]>();
    for (const e of entries) {
        const day = dbEntryDate(e);
        if (day) byDay.set(day, [...(byDay.get(day) ?? []), e]);
    }

    const scoreTrend = [...byDay.keys()].sort().map((date) => {
        const day = byDay.get(date)!;
        const trust = trustScore(day, typeBranch);
        const experience = experienceScore(day);
        const latencies = day.map(responseMinutes).filter((m): m is number => m !== null);
        const tats = day.flatMap(tatReadings);
        return {
            date,
            trust: trust.score,
            trustHasData: trust.hasData,
            experience: experience.score,
            experienceHasData: experience.hasData,
            avgLatency: round1(average(latencies) ?? 0),
            avgLatencySampleCount: latencies.length,
            avgReviewTat: round1(average(tats) ?? 0),
            avgReviewTatSampleCount: tats.length,
        };
    });
    return { scoreTrend };
}
