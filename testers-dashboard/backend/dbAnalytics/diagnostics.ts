// Database Logs Analytics diagnostics - Biggest Bottleneck (reviewer-workflow
// TATs), Overall Module Performance (ACE modules) and Weakest Module, and the
// Zoho ticket lists - calculated from stored TesterLogEntry fields.

import type { ZohoTicketStatus } from '../interfaces/IZohoTicketStatusService.js';
import { type Entry, type Rate, average, defectSeverity, durationMinutes, rate, round1, voiceInputQuality, voiceOutputQuality, yesNo } from './values.js';
import {
    domainRate,
    notificationExperienceRate,
    notificationSuccessRate,
    questionFramedRate,
    retrievalRate,
    scientificAccuracyRate,
    sourceLinkRate,
    translationRate,
    typeGroup,
} from './kpis.js';
import type { DbAceModule, DbDiagnostics, DbTatStageStat, DbTicket } from './types.js';

// Reviewer-workflow stages and their stored durations ("HH:MM:SS", computed
// by the server). Entries whose Tagging skips the workflow simply have none.
export const DB_TAT_STAGES: { name: string; field: keyof Entry }[] = [
    { name: 'Authoring', field: 'authorTatMins' },
    { name: 'Review 1', field: 'review1TatMins' },
    { name: 'Review 2', field: 'review2TatMins' },
    { name: 'Review 3', field: 'review3TatMins' },
    { name: 'Review 4', field: 'review4TatMins' },
    { name: 'Review 5', field: 'review5TatMins' },
    { name: 'Moderator', field: 'moderatorTatMins' },
];

export function tatReadings(e: Entry): number[] {
    return DB_TAT_STAGES.map((s) => durationMinutes(e[s.field])).filter((m): m is number => m !== null);
}

// A module needs this many entries behind its metrics before it can be
// named the Weakest Module, so 1-2 entries can't decide it.
export const DB_MIN_ENTRIES_FOR_WEAKEST_MODULE = 10;

const COMING_SOON_MODULES = [
    { key: 'review_quality', label: 'Review & Quality' },
    { key: 'farmer_context', label: 'Farmer Context' },
    { key: 'ace_platform_integrations', label: 'ACE Platform & Integrations' },
];

interface SubMetricInput {
    key: string;
    label: string;
    rate: Rate;
    // Entries applicable to this sub-metric (for the module's entry count).
    applicableEntries: Entry[];
}

function moduleEntry(key: string, label: string, inputs: SubMetricInput[]): DbAceModule {
    const subMetrics = inputs.map((m) => ({
        key: m.key,
        label: m.label,
        value: m.rate.applicable ? m.rate.value : null,
        applicable: m.rate.applicable,
    }));
    const applicableRowCount = new Set(inputs.flatMap((m) => m.applicableEntries)).size;
    const scoreable = subMetrics.filter((m): m is typeof m & { value: number } => m.value !== null);
    const overall = average(scoreable.map((m) => m.value));
    return {
        key,
        label,
        subMetrics,
        applicableRowCount,
        eligible: applicableRowCount >= DB_MIN_ENTRIES_FOR_WEAKEST_MODULE,
        overallScore: overall === null ? null : round1(overall),
        weakestMetricLabels: [...scoreable].sort((a, b) => a.value - b.value).slice(0, 2).map((m) => m.label),
    };
}

// A sub-metric over the entries `outcome` classifies (non-null), positive when
// `positive` holds.
function subMetric<T>(key: string, label: string, entries: Entry[], outcome: (e: Entry) => T | null, positive: (o: T) => boolean): SubMetricInput {
    const applicableEntries = entries.filter((e) => outcome(e) !== null);
    return { key, label, rate: rate(applicableEntries.filter((e) => positive(outcome(e)!)).length, applicableEntries.length), applicableEntries };
}

function fromRate(key: string, label: string, r: Rate, applicableEntries: Entry[]): SubMetricInput {
    return { key, label, rate: r, applicableEntries };
}

export function aceModules(entries: Entry[]): DbAceModule[] {
    const gdb = entries.filter((e) => typeGroup(e) === 'GDB');
    const typed = entries.filter((e) => typeGroup(e) !== null);
    const sciApplicable = (list: Entry[]) => list.filter((e) => scientificAccuracyRate([e]).applicable > 0);

    return [
        moduleEntry('farmer_interaction', 'Farmer Interaction', [
            fromRate('question_framed', 'Question Correctly Framed', questionFramedRate(entries), entries.filter((e) => questionFramedRate([e]).applicable > 0)),
        ]),
        moduleEntry('agri_advisory', 'Agri Advisory', [
            fromRate('scientific_accuracy', 'Scientific Accuracy', scientificAccuracyRate(typed), sciApplicable(typed)),
        ]),
        // Knowledge & GDB: whether the knowledge base served the right answer
        // and sources - Retrieval Accuracy (a current Tester UI field) plus
        // source links and Scientific Accuracy on GDB questions.
        moduleEntry('knowledge_gdb', 'Knowledge & GDB', [
            fromRate('retrieval_accuracy', 'Retrieval Accuracy', retrievalRate(entries), entries.filter((e) => retrievalRate([e]).applicable > 0)),
            fromRate('correct_source_links', 'Correct Source Links', sourceLinkRate(entries), entries.filter((e) => sourceLinkRate([e]).applicable > 0)),
            fromRate('scientific_accuracy_gdb', 'Scientific Accuracy (GDB)', scientificAccuracyRate(gdb), sciApplicable(gdb)),
        ]),
        moduleEntry('dynamic_advisory', 'Dynamic Advisory', [
            fromRate('weather_accuracy', 'Weather Accuracy', domainRate(entries, 'weather'), entries.filter((e) => domainRate([e], 'weather').applicable > 0)),
            fromRate('mandi_accuracy', 'Mandi Accuracy', domainRate(entries, 'mandi'), entries.filter((e) => domainRate([e], 'mandi').applicable > 0)),
            fromRate('scheme_accuracy', 'Scheme Accuracy', domainRate(entries, 'scheme'), entries.filter((e) => domainRate([e], 'scheme').applicable > 0)),
        ]),
        moduleEntry('multilingual_voice', 'Multilingual & Voice', [
            fromRate('translation_quality', 'Translation Quality', translationRate(entries), entries.filter((e) => translationRate([e]).applicable > 0)),
            subMetric('voice_input_quality', 'Voice Input Quality (Correct)', entries, (e) => voiceInputQuality(e.voiceInputQuality), (o) => o === 'good'),
            subMetric('voice_output_quality', 'Voice Output Quality (Clear)', entries, (e) => voiceOutputQuality(e.voiceOutputQuality), (o) => o === 'good'),
            subMetric('voice_input_working', 'Voice Input Working', entries, (e) => yesNo(e.voiceInputWorking), (o) => o === 'yes'),
            subMetric('voice_output_working', 'Voice Output Working', entries, (e) => yesNo(e.voiceOutputWorking), (o) => o === 'yes'),
        ]),
        moduleEntry('communication_notifications', 'Communication & Notifications', [
            fromRate('notification_success', 'Notification Success', notificationSuccessRate(entries), entries.filter((e) => notificationSuccessRate([e]).applicable > 0)),
            fromRate('notification_experience', 'Notification Experience', notificationExperienceRate(entries), entries.filter((e) => notificationExperienceRate([e]).applicable > 0)),
        ]),
    ];
}

// Zoho's own Bugs Tracker tickets (cached), independent of the dashboard
// filters - Critical/High for the "Critical Defect Tickets" view, every
// ticket for "All Tickets".
export function zohoTicketLists(zohoTickets: Record<string, ZohoTicketStatus>): { openTickets: DbTicket[]; allTickets: DbTicket[] } {
    const allTickets = Object.values(zohoTickets).map((t) => ({ id: t.ticketId, url: t.url, severity: t.severity }));
    return { openTickets: allTickets.filter((t) => t.severity === 'Critical' || t.severity === 'High'), allTickets };
}

export function calculateDbDiagnostics(entries: Entry[], zohoTickets: Record<string, ZohoTicketStatus> = {}): DbDiagnostics {
    const stageStats: DbTatStageStat[] = DB_TAT_STAGES.map((s) => ({
        name: s.name,
        avg: average(entries.map((e) => durationMinutes(e[s.field])).filter((m): m is number => m !== null)) ?? 0,
    }));
    const bottleneck = stageStats.reduce<DbTatStageStat | null>((max, s) => (s.avg > (max?.avg ?? 0) ? s : max), null);

    const modulePerformance = aceModules(entries);
    const weakest = modulePerformance.reduce<DbAceModule | null>((w, m) => {
        if (!m.eligible || m.overallScore === null) return w;
        return !w || m.overallScore < w.overallScore! ? m : w;
    }, null);

    return {
        stageStats,
        bottleneckName: bottleneck ? bottleneck.name : 'None',
        bottleneckTime: bottleneck ? bottleneck.avg : 0,
        modulePerformance,
        comingSoonModules: COMING_SOON_MODULES,
        weakestModule: weakest ? weakest.label : 'None',
        weakestModuleRowCount: weakest ? weakest.applicableRowCount : 0,
        weakestModuleScore: weakest ? weakest.overallScore : null,
        weakestModuleReason: weakest ? weakest.weakestMetricLabels : [],
        criticalDefectCount: entries.filter((e) => ['Critical', 'High'].includes(defectSeverity(e) ?? '')).length,
        ...zohoTicketLists(zohoTickets),
    };
}
