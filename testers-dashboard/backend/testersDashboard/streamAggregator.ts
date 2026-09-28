import fs from 'fs';
import csv from 'csv-parser';
import type { TestersDashboardRecord, TestersDashboardSummaryResponse } from '../interfaces/ITestersDashboardService.js';
import type { ZohoTicketStatus } from '../interfaces/IZohoTicketStatusService.js';
import {
    normalizeTypeOfQuestion,
    normalizeBuildVersion,
    normalizeDefectSeverity,
    toTitleCase,
    normalizeQuestionCategory,
    normalizeChannel,
    normalizeTestStatus,
    normalizeTesterName,
    matchesAny,
    parseTestDateToISO,
    getTodayIST,
    isFutureTestDate,
    pct,
    timeToMinutes,
    calculateNotificationSuccess,
    calculateVoiceSuccess,
} from './normalize.js';
import {
    addDaysISO,
    getPreviousPeriodWindow,
    type TestersDashboardFilters,
    type NonDateFilterKey,
    type FilterFieldConfig,
    RESPONSE_TIME_KEY,
} from './filters.js';
import {
    dynamicSubBucketFor,
    calculateDiagnostics,
    type DynamicSubBucket,
} from './diagnostics.js';
import {
    calculateKpis,
    calculateChannelStats,
    calculateLanguageStats,
    calculateCriticalFailureCategories,
    calculateScientificAccuracy,
    type PreviousPeriodStats,
} from './kpis.js';
import { calculateChartData } from './chartData.js';

const STATIC_SUB_TYPES = new Set(['GDB', 'Unique', 'Outreach']);

const FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'type', csvKey: 'Type of Question', normalize: normalizeTypeOfQuestion },
    { key: 'category', csvKey: 'Question Category', normalize: normalizeQuestionCategory },
    { key: 'build', csvKey: 'Build / Version', normalize: normalizeBuildVersion },
    { key: 'channel', csvKey: 'Channel Tested', normalize: normalizeChannel },
    { key: 'language', csvKey: 'Language Tested', normalize: toTitleCase },
    { key: 'tester', csvKey: 'Tester Name', normalize: normalizeTesterName },
    { key: 'status', csvKey: 'Overall Test Status', normalize: normalizeTestStatus, keepNA: true },
    { key: 'severity', csvKey: 'Defect Severity', normalize: normalizeDefectSeverity },
];

export function toSlimRecord(data: Record<string, string>): TestersDashboardRecord {
    return {
        'Test ID': (data['Test ID'] || '').trim(),
        'Test Date': (data['Test Date'] || '').trim(),
        'Type of Question': (data['Type of Question'] || '').trim(),
        'Question Category': (data['Question Category'] || '').trim(),
        'Build / Version': (data['Build / Version'] || '').trim(),
        'Channel Tested': (data['Channel Tested'] || '').trim(),
        'Language Tested': (data['Language Tested'] || '').trim(),
        'Tester Name': (data['Tester Name'] || '').trim(),
        'Overall Test Status': (data['Overall Test Status'] || '').trim(),
        'Defect Severity': (data['Defect Severity'] || '').trim(),
        'SLA Status': (data['SLA Status'] || '').trim(),
        'Question in Review Model?': (data['Question in Review Model?'] || '').trim(),
        'Question Correctly Framed?': (data['Question Correctly Framed?'] || '').trim(),
        'Translation Quality': (data['Translation Quality'] || '').trim(),
        'Author TAT (mins) [Auto]': (data['Author TAT (mins) [Auto]'] || '').trim(),
        'Review1 TAT (mins) [Auto]': (data['Review1 TAT (mins) [Auto]'] || '').trim(),
        'Review2 TAT (mins) [Auto]': (data['Review2 TAT (mins) [Auto]'] || '').trim(),
        'Review3 TAT (mins) [Auto]': (data['Review3 TAT (mins) [Auto]'] || '').trim(),
        'Review4 TAT (mins) [Auto]': (data['Review4 TAT (mins) [Auto]'] || '').trim(),
        'Review5 TAT (mins) [Auto]': (data['Review5 TAT (mins) [Auto]'] || '').trim(),
        'Moderator TAT (mins) [Auto]': (data['Moderator TAT (mins) [Auto]'] || '').trim(),
        'Follow-up Q in Review Model?': (data['Follow-up Q in Review Model?'] || '').trim(),
        'Answer Scientifically Correct?': (data['Answer Scientifically Correct?'] || '').trim(),
        'Expert Name Displayed?': (data['Expert Name Displayed?'] || '').trim(),
        'Correct Expert Name displayed?': (data['Correct Expert Name displayed?'] || '').trim(),
        'Correct Source Links Provided?': (data['Correct Source Links Provided?'] || '').trim(),
        '120-min Msg Shown to User?': (data['120-min Msg Shown to User?'] || '').trim(),
        'Notification Received?': (data['Notification Received?'] || '').trim(),
        'Notification on Same Thread?': (data['Notification on Same Thread?'] || '').trim(),
        'Notification Linked Correct Q-ID?': (data['Notification Linked Correct Q-ID?'] || '').trim(),
        'Voice Input Working?': (data['Voice Input Working?'] || '').trim(),
        'Voice Output Working?': (data['Voice Output Working?'] || '').trim(),
        'Voice Input Quality': (data['Voice Input Quality'] || '').trim(),
        'Voice Output Quality': (data['Voice Output Quality'] || '').trim(),
        'Weather Q Answered Correctly?': (data['Weather Q Answered Correctly?'] || '').trim(),
        'Mandi Price Q Correct?': (data['Mandi Price Q Correct?'] || '').trim(),
        'Scheme Q Correct?': (data['Scheme Q Correct?'] || '').trim(),
        'Question Saved in DB?': (data['Question Saved in DB?'] || '').trim(),
        'Answer Saved in DB?': (data['Answer Saved in DB?'] || '').trim(),
        'Q-ID Consistent Across Systems?': (data['Q-ID Consistent Across Systems?'] || '').trim(),
        'WhatsApp vs Web Answer Match?': (data['WhatsApp vs Web Answer Match?'] || '').trim(),
        'Defect ID / Bug Ref\nZoho Desk Ticketing': (
            data['Defect ID / Bug Ref\nZoho Desk Ticketing'] ||
            data['Defect ID / Bug Ref'] ||
            ''
        ).trim(),
        'Response Time (mins) [Auto] (HH:MM:SS)': (
            data['Response Time (mins) [Auto] (HH:MM:SS)'] || ''
        ).trim(),
        'Time Answer Received (HH:MM:SS)': (
            data['Time Answer Received (HH:MM:SS)'] || ''
        ).trim(),
    };
}

export function rowMatchesNonDateFilters(
    r: TestersDashboardRecord,
    filters: TestersDashboardFilters,
    excludeFailures: boolean,
): boolean {
    if (excludeFailures) {
        if (
            matchesAny(r['Question Saved in DB?'], ['not saved']) ||
            matchesAny(r['Answer Saved in DB?'], ['not saved']) ||
            matchesAny(r['Q-ID Consistent Across Systems?'], ['wrongly identified as duplicate']) ||
            normalizeDefectSeverity(r['Defect Severity']) === 'Critical'
        ) {
            return false;
        }

        const isDynamic = dynamicSubBucketFor(r['Question Category'], r['Type of Question']) !== null;
        const isStatic = STATIC_SUB_TYPES.has(normalizeTypeOfQuestion(r['Type of Question']));
        if (!isDynamic && !isStatic) {
            return false;
        }
    }

    for (const field of FILTER_FIELDS) {
        const val = filters[field.key];
        if (val !== 'all') {
            const rowVal = field.normalize ? field.normalize(r[field.csvKey]) : r[field.csvKey];
            if (rowVal !== val) return false;
        }
    }

    if (filters.dynamicSubTypes.length > 0) {
        const sub = dynamicSubBucketFor(r['Question Category'], r['Type of Question']);
        if (!sub || !filters.dynamicSubTypes.includes(sub)) return false;
    }

    if (filters.staticSubTypes.length > 0) {
        const normType = normalizeTypeOfQuestion(r['Type of Question']);
        if (!filters.staticSubTypes.includes(normType)) return false;
    }

    if (filters.typeBranch === 'Dynamic' && filters.dynamicSubTypes.length === 0) {
        if (dynamicSubBucketFor(r['Question Category'], r['Type of Question']) === null) return false;
    } else if (filters.typeBranch === 'Static' && filters.staticSubTypes.length === 0) {
        if (!STATIC_SUB_TYPES.has(normalizeTypeOfQuestion(r['Type of Question']))) return false;
    }

    return true;
}

export function rowMatchesDateRange(
    iso: string | null,
    dateRange: string,
    customStart: string | undefined,
    customEnd: string | undefined,
    todayISO: string,
    last7StartISO: string,
    last30StartISO: string,
): boolean {
    const isCustomWithNoDatesYet = dateRange === 'custom' && !customStart && !customEnd;
    if (dateRange === 'all' || isCustomWithNoDatesYet) {
        return true;
    }

    if (!iso) return false;

    if (dateRange === 'today') {
        return iso === todayISO;
    }
    if (dateRange === '7days') {
        return iso >= last7StartISO && iso <= todayISO;
    }
    if (dateRange === '30days') {
        return iso >= last30StartISO && iso <= todayISO;
    }
    if (dateRange === 'custom') {
        if (customStart && iso < customStart) return false;
        if (customEnd && iso > customEnd) return false;
        return true;
    }

    return true;
}

export function calculatePreviousPeriodFromRows(
    prevRows: TestersDashboardRecord[],
    window: { prevStart: string; prevEnd: string },
): PreviousPeriodStats {
    const total = prevRows.length;
    const prevFailedRowCount = calculateCriticalFailureCategories(prevRows).distinctFailureRows;
    const prevPassedRowCount = total - prevFailedRowCount;
    const prevPassRate = pct(prevPassedRowCount, total);
    const prevFailRate = total ? 100 - prevPassRate : 0;
    const prevSciAccuracy = calculateScientificAccuracy(prevRows);

    let sumMin = 0;
    let countMin = 0;
    for (let i = 0; i < prevRows.length; i++) {
        const m = timeToMinutes(prevRows[i][RESPONSE_TIME_KEY]);
        if (m !== null) {
            sumMin += m;
            countMin++;
        }
    }

    const prevCriticalDefects = prevRows.filter((r) =>
        ['Critical', 'High'].includes(normalizeDefectSeverity(r['Defect Severity'])),
    ).length;
    const prevCriticalBugsOnly = prevRows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'Critical').length;
    const defectRecordedCount = prevRows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) !== '').length;
    const prevCriticalDefectsPct = pct(prevCriticalDefects, defectRecordedCount);
    const prevNotificationSuccess = calculateNotificationSuccess(prevRows);
    const prevVoiceSuccess = calculateVoiceSuccess(prevRows);

    return {
        totalTests: total,
        passRate: prevPassRate,
        failRate: prevFailRate,
        avgResponseMinutes: countMin ? Math.round((sumMin / countMin) * 10) / 10 : 0,
        scientificAccuracy: prevSciAccuracy.pct,
        openCriticalDefects: prevCriticalDefects,
        countCriticalBugs: prevCriticalBugsOnly,
        criticalDefectsPct: prevCriticalDefectsPct,
        notificationSuccess: prevNotificationSuccess.pct,
        voiceSuccess: prevVoiceSuccess.score,
        rangeLabel: `${window.prevStart} to ${window.prevEnd}`,
    };
}

export function streamAggregateSummary(
    csvPath: string,
    filters: TestersDashboardFilters,
    excludeFailures: boolean,
    customStart: string | undefined,
    customEnd: string | undefined,
    zohoTickets: Record<string, ZohoTicketStatus>,
    now: Date = new Date(),
): Promise<TestersDashboardSummaryResponse> {
    return new Promise((resolve, reject) => {
        const todayISO = getTodayIST(now);
        const last7StartISO = addDaysISO(todayISO, -6);
        const last30StartISO = addDaysISO(todayISO, -29);
        const prevWindow = getPreviousPeriodWindow(filters.dateRange, customStart, customEnd, now);

        const filterOptionSets = {
            type: new Set<string>(),
            category: new Set<string>(),
            build: new Set<string>(),
            channel: new Set<string>(),
            language: new Set<string>(),
            tester: new Set<string>(),
            status: new Set<string>(),
            severity: new Set<string>(),
        } as Record<NonDateFilterKey, Set<string>>;

        const currentPeriodRows: TestersDashboardRecord[] = [];
        const prevPeriodRows: TestersDashboardRecord[] = [];
        let totalRecords = 0;

        fs.createReadStream(csvPath)
            .pipe(csv())
            .on('data', (raw: Record<string, string>) => {
                const testId = raw['Test ID'] ? raw['Test ID'].trim() : '';
                if (!testId || testId.startsWith('Project:') || testId.startsWith('Test ID') || isFutureTestDate(raw['Test Date'])) {
                    return;
                }

                totalRecords++;
                const r = toSlimRecord(raw);

                // Collect filter options from all valid rows on the fly
                for (const field of FILTER_FIELDS) {
                    const rawVal = r[field.csvKey];
                    if (rawVal) {
                        const norm = field.normalize ? field.normalize(rawVal) : rawVal;
                        if (norm && norm !== 'NIL' && (field.keepNA || norm !== 'NA')) {
                            filterOptionSets[field.key].add(norm);
                        }
                    }
                }

                const nonDateMatch = rowMatchesNonDateFilters(r, filters, excludeFailures);
                if (nonDateMatch) {
                    const iso = parseTestDateToISO(r['Test Date'], now);
                    if (rowMatchesDateRange(iso, filters.dateRange, customStart, customEnd, todayISO, last7StartISO, last30StartISO)) {
                        currentPeriodRows.push(r);
                    }
                    if (prevWindow && iso && iso >= prevWindow.prevStart && iso <= prevWindow.prevEnd) {
                        prevPeriodRows.push(r);
                    }
                }
            })
            .on('end', () => {
                // Build filter options output
                const filterOptions = {} as Record<NonDateFilterKey, string[]>;
                for (const field of FILTER_FIELDS) {
                    let unique = Array.from(filterOptionSets[field.key]).sort((a, b) => a.localeCompare(b));
                    if (field.key === 'type') {
                        unique = ['GDB', 'Unique', 'Outreach', 'Dynamic'];
                    } else if (field.key === 'category') {
                        unique = unique.filter((v) => v !== 'General');
                    } else if (field.key === 'channel') {
                        const KNOWN_CHANNEL_VALUES = new Set(['Web App', 'WhatsApp', 'Both']);
                        unique = unique.filter((v) => KNOWN_CHANNEL_VALUES.has(v));
                    }
                    filterOptions[field.key] = unique;
                }

                const kpis = calculateKpis(currentPeriodRows, filters.typeBranch);
                const diagnostics = calculateDiagnostics(currentPeriodRows, zohoTickets);
                const chartData = calculateChartData(currentPeriodRows, undefined, filters.typeBranch);
                const channelStats = calculateChannelStats(currentPeriodRows);
                const languageStats = calculateLanguageStats(currentPeriodRows);
                const previousPeriodStats = prevWindow ? calculatePreviousPeriodFromRows(prevPeriodRows, prevWindow) : null;

                const stats = fs.statSync(csvPath);

                resolve({
                    success: true,
                    totalRecords,
                    kpis,
                    diagnostics,
                    chartData,
                    previousPeriodStats,
                    filterOptions,
                    lastSyncedAt: stats.mtime.toISOString(),
                    channelStats,
                    languageStats,
                });
            })
            .on('error', reject);
    });
}
