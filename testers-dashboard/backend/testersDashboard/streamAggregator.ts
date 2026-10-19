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

const INTERNED_STRINGS: Record<string, string> = {
    '': '',
    'NA': 'NA',
    'NIL': 'NIL',
    'N/A': 'NA',
    'Pass': 'Pass',
    'Fail': 'Fail',
    'Partial': 'Partial',
    'Critical': 'Critical',
    'High': 'High',
    'Medium': 'Medium',
    'Low': 'Low',
    'Yes': 'Yes',
    'No': 'No',
    'Web App': 'Web App',
    'WhatsApp': 'WhatsApp',
    'Both': 'Both',
    'English': 'English',
    'Telugu': 'Telugu',
    'Hindi': 'Hindi',
    'Bengali': 'Bengali',
    'Marathi': 'Marathi',
    'Tamil': 'Tamil',
    'Malayalam': 'Malayalam',
    'Kannada': 'Kannada',
    'Punjabi': 'Punjabi',
    'GDB': 'GDB',
    'Unique': 'Unique',
    'Outreach': 'Outreach',
    'Dynamic': 'Dynamic',
    'Within SLA': 'Within SLA',
    'Exceeded SLA': 'Exceeded SLA',
    '1.0': '1.0',
    '2.0': '2.0',
    '3.0': '3.0',
    'saved': 'saved',
    'not saved': 'not saved',
    'Good': 'Good',
    'Average': 'Average',
    'Poor': 'Poor',
    'General': 'General',
};

function intern(str: string | undefined): string {
    if (!str) return '';
    const trimmed = str.trim();
    return INTERNED_STRINGS[trimmed] ?? trimmed;
}

export function toSlimRecord(data: Record<string, string>): TestersDashboardRecord {
    return {
        'Test ID': intern(data['Test ID']),
        'Test Date': intern(data['Test Date']),
        'Type of Question': intern(data['Type of Question']),
        'Question Category': intern(data['Question Category']),
        'Build / Version': intern(data['Build / Version']),
        'Channel Tested': intern(data['Channel Tested']),
        'Language Tested': intern(data['Language Tested']),
        'Tester Name': intern(data['Tester Name']),
        'Overall Test Status': intern(data['Overall Test Status']),
        'Defect Severity': intern(data['Defect Severity']),
        'SLA Status': intern(data['SLA Status']),
        'Question in Review Model?': intern(data['Question in Review Model?']),
        'Question Correctly Framed?': intern(data['Question Correctly Framed?']),
        'Translation Quality': intern(data['Translation Quality']),
        'Author TAT (mins) [Auto]': intern(data['Author TAT (mins) [Auto]']),
        'Review1 TAT (mins) [Auto]': intern(data['Review1 TAT (mins) [Auto]']),
        'Review2 TAT (mins) [Auto]': intern(data['Review2 TAT (mins) [Auto]']),
        'Review3 TAT (mins) [Auto]': intern(data['Review3 TAT (mins) [Auto]']),
        'Review4 TAT (mins) [Auto]': intern(data['Review4 TAT (mins) [Auto]']),
        'Review5 TAT (mins) [Auto]': intern(data['Review5 TAT (mins) [Auto]']),
        'Moderator TAT (mins) [Auto]': intern(data['Moderator TAT (mins) [Auto]']),
        'Follow-up Q in Review Model?': intern(data['Follow-up Q in Review Model?']),
        'Answer Scientifically Correct?': intern(data['Answer Scientifically Correct?']),
        'Expert Name Displayed?': intern(data['Expert Name Displayed?']),
        'Correct Expert Name displayed?': intern(data['Correct Expert Name displayed?']),
        'Correct Source Links Provided?': intern(data['Correct Source Links Provided?']),
        '120-min Msg Shown to User?': intern(data['120-min Msg Shown to User?']),
        'Notification Received?': intern(data['Notification Received?']),
        'Notification on Same Thread?': intern(data['Notification on Same Thread?']),
        'Notification Linked Correct Q-ID?': intern(data['Notification Linked Correct Q-ID?']),
        'Voice Input Working?': intern(data['Voice Input Working?']),
        'Voice Output Working?': intern(data['Voice Output Working?']),
        'Voice Input Quality': intern(data['Voice Input Quality']),
        'Voice Output Quality': intern(data['Voice Output Quality']),
        'Weather Q Answered Correctly?': intern(data['Weather Q Answered Correctly?']),
        'Mandi Price Q Correct?': intern(data['Mandi Price Q Correct?']),
        'Scheme Q Correct?': intern(data['Scheme Q Correct?']),
        'Question Saved in DB?': intern(data['Question Saved in DB?']),
        'Answer Saved in DB?': intern(data['Answer Saved in DB?']),
        'Q-ID Consistent Across Systems?': intern(data['Q-ID Consistent Across Systems?']),
        'WhatsApp vs Web Answer Match?': intern(data['WhatsApp vs Web Answer Match?']),
        'Defect ID / Bug Ref\nZoho Desk Ticketing': intern(
            data['Defect ID / Bug Ref\nZoho Desk Ticketing'] ||
            data['Defect ID / Bug Ref'] ||
            '',
        ),
        'Response Time (mins) [Auto] (HH:MM:SS)': intern(
            data['Response Time (mins) [Auto] (HH:MM:SS)'] || '',
        ),
        'Time Answer Received (HH:MM:SS)': intern(
            data['Time Answer Received (HH:MM:SS)'] || '',
        ),
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

export async function streamAggregateSummary(
    csvPath: string,
    filters: TestersDashboardFilters,
    excludeFailures: boolean,
    customStart: string | undefined,
    customEnd: string | undefined,
    zohoTickets: Record<string, ZohoTicketStatus>,
    now: Date = new Date(),
    cachedFilterOptions?: Record<NonDateFilterKey, string[]>,
): Promise<TestersDashboardSummaryResponse> {
    const todayISO = getTodayIST(now);
    const last7StartISO = addDaysISO(todayISO, -6);
    const last30StartISO = addDaysISO(todayISO, -29);
    const prevWindow = getPreviousPeriodWindow(filters.dateRange, customStart, customEnd, now);

    const filterOptionSets = cachedFilterOptions
        ? null
        : ({
            type: new Set<string>(),
            category: new Set<string>(),
            build: new Set<string>(),
            channel: new Set<string>(),
            language: new Set<string>(),
            tester: new Set<string>(),
            status: new Set<string>(),
            severity: new Set<string>(),
        } as Record<NonDateFilterKey, Set<string>>);

    const currentPeriodRows: TestersDashboardRecord[] = [];
    const prevPeriodRows: TestersDashboardRecord[] = [];
    let totalRecords = 0;
    let rowCount = 0;

    const stream = fs.createReadStream(csvPath, { highWaterMark: 64 * 1024 }).pipe(csv());

    for await (const raw of stream) {
        const testId = raw['Test ID'] ? raw['Test ID'].trim() : '';
        if (!testId || testId.startsWith('Project:') || testId.startsWith('Test ID') || isFutureTestDate(raw['Test Date'])) {
            continue;
        }

        totalRecords++;
        rowCount++;
        if (rowCount % 1000 === 0) {
            // Yield to event loop every 1000 rows to ensure other backend requests remain fast and responsive
            await new Promise((resolve) => setImmediate(resolve));
        }

        const r = toSlimRecord(raw);

        // Collect filter options only if not already provided by cache
        if (filterOptionSets) {
            for (const field of FILTER_FIELDS) {
                const rawVal = r[field.csvKey];
                if (rawVal) {
                    const norm = field.normalize ? field.normalize(rawVal) : rawVal;
                    if (norm && norm !== 'NIL' && (field.keepNA || norm !== 'NA')) {
                        filterOptionSets[field.key].add(norm);
                    }
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
    }

    let filterOptions: Record<NonDateFilterKey, string[]>;
    if (cachedFilterOptions) {
        filterOptions = cachedFilterOptions;
    } else {
        filterOptions = {} as Record<NonDateFilterKey, string[]>;
        for (const field of FILTER_FIELDS) {
            let unique = Array.from(filterOptionSets![field.key]).sort((a, b) => a.localeCompare(b));
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
    }

    const kpis = calculateKpis(currentPeriodRows, filters.typeBranch);
    const diagnostics = calculateDiagnostics(currentPeriodRows, zohoTickets);
    const chartData = calculateChartData(currentPeriodRows, undefined, filters.typeBranch);
    const channelStats = calculateChannelStats(currentPeriodRows);
    const languageStats = calculateLanguageStats(currentPeriodRows);
    const previousPeriodStats = prevWindow ? calculatePreviousPeriodFromRows(prevPeriodRows, prevWindow) : null;

    const stats = fs.statSync(csvPath);

    return {
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
    };
}
