import { injectable, inject } from 'inversify';
import {
    ITesterLogService,
    TesterLogEntry,
    PaginatedTesterLogEntries,
    CreateTesterLogEntryResponse,
    TesterLogSummaryResponse,
} from '../interfaces/ITesterLogService.js';
import { getTodayIST } from '../testersDashboard/normalize.js';

const COLLECTION = 'tester_test_cases';
const DATABASE_TOKEN = Symbol.for('Database');

interface DatabaseProvider {
    getCollection<T>(name: string): Promise<any>;
}

/**
 * Compute HH:MM:SS difference between two HH:MM:SS strings.
 * Returns '' if either value is missing or result is negative.
 */
function parseToMs(str?: string, defaultDate?: string): number | null {
    if (!str || !str.trim()) return null;
    const s = str.trim();

    if (s.includes('-') || s.includes('/')) {
        const parsed = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
        if (!isNaN(parsed)) return parsed;
    }

    const parts = s.split(':').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        if (defaultDate && (defaultDate.includes('-') || defaultDate.includes('/'))) {
            const dateStr = defaultDate.trim();
            const timeStr = `${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}:${String(parts[2] || 0).padStart(2, '0')}`;
            const combined = Date.parse(`${dateStr}T${timeStr}`);
            if (!isNaN(combined)) return combined;
        }
        const secs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
        return secs * 1000;
    }

    return null;
}

function computeHmsDiff(start?: string, end?: string, defaultDate?: string): string {
    const sMs = parseToMs(start, defaultDate);
    const eMs = parseToMs(end, defaultDate);
    if (sMs === null || eMs === null || eMs < sMs) return '';

    const diffSecs = Math.floor((eMs - sMs) / 1000);
    const h = Math.floor(diffSecs / 3600);
    const m = Math.floor((diffSecs % 3600) / 60);
    const sec = diffSecs % 60;
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function buildDateFilter(
    startDate?: string,
    endDate?: string,
    dateField?: string,
): Record<string, any> | null {
    if (!startDate && !endDate) return null;

    const sDate = startDate ? startDate.trim().slice(0, 10) : undefined;
    const eDate = endDate ? endDate.trim().slice(0, 10) : undefined;

    const testDateFilter: Record<string, string> = {};
    if (sDate) testDateFilter.$gte = sDate;
    if (eDate) testDateFilter.$lte = eDate;

    const createdFilter: Record<string, Date> = {};
    if (sDate) createdFilter.$gte = new Date(`${sDate}T00:00:00.000Z`);
    if (eDate) createdFilter.$lte = new Date(`${eDate}T23:59:59.999Z`);

    if (dateField === 'createdAt') {
        return { createdAt: createdFilter };
    }

    return {
        $or: [
            { testDate: testDateFilter },
            {
                $and: [
                    { testDate: { $in: [null, ''] } },
                    { createdAt: createdFilter },
                ],
            },
        ],
    };
}

@injectable()
export class TesterLogService implements ITesterLogService {
    constructor(
        @inject(DATABASE_TOKEN)
        private readonly db: DatabaseProvider,
    ) {}

    async createEntry(
        userId: string,
        email: string,
        testerName: string,
        body: Omit<TesterLogEntry, '_id' | 'submittedByUserId' | 'submittedByEmail' | 'testerName' | 'createdAt' | 'updatedAt' | 'testDate'> & { testDate?: string },
    ): Promise<CreateTesterLogEntryResponse> {
        const now = new Date();
        const testDate = getTodayIST(now);

        const entry: TesterLogEntry = {
            ...body,
            testDate,
            submittedByUserId: userId,
            submittedByEmail: email,
            testerName,
            responseTimeMins: computeHmsDiff(body.timeQuestionAsked, body.timeAnswerReceived, testDate),
            authorTatMins: computeHmsDiff(body.authorAssignmentTime, body.authorCompletionTime, testDate),
            review1TatMins: computeHmsDiff(body.reviewer1AssignmentTime, body.reviewer1CompletionTime, testDate),
            review2TatMins: computeHmsDiff(body.reviewer2AssignmentTime, body.reviewer2CompletionTime, testDate),
            review3TatMins: computeHmsDiff(body.reviewer3AssignmentTime, body.reviewer3CompletionTime, testDate),
            review4TatMins: computeHmsDiff(body.reviewer4AssignmentTime, body.reviewer4CompletionTime, testDate),
            review5TatMins: computeHmsDiff(body.reviewer5AssignmentTime, body.reviewer5CompletionTime, testDate),
            moderatorTatMins: computeHmsDiff(body.moderatorAssignmentTime, body.moderatorCompletionTime, testDate),
            createdAt: now,
            updatedAt: now,
        };

        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const result = await collection.insertOne(entry as any);

        return {
            success: true,
            entry: { ...entry, _id: result.insertedId.toString() },
        };
    }

    async getMyEntries(
        userId: string,
        page: number,
        limit: number,
        startDate?: string,
        endDate?: string,
        dateField?: string,
    ): Promise<PaginatedTesterLogEntries> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter: Record<string, any> = { submittedByUserId: userId };
        const dateFilter = buildDateFilter(startDate, endDate, dateField);
        if (dateFilter) {
            Object.assign(filter, dateFilter);
        }

        const [entries, total] = await Promise.all([
            collection
                .find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .toArray(),
            collection.countDocuments(filter),
        ]);

        return {
            success: true,
            entries: entries.map((e: any) => ({ ...e, _id: e._id?.toString() })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async getAllEntries(
        page: number,
        limit: number,
        testerId?: string,
        startDate?: string,
        endDate?: string,
        dateField?: string,
    ): Promise<PaginatedTesterLogEntries> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter: Record<string, any> = testerId ? { submittedByUserId: testerId } : {};
        const dateFilter = buildDateFilter(startDate, endDate, dateField);
        if (dateFilter) {
            Object.assign(filter, dateFilter);
        }

        const [entries, total] = await Promise.all([
            collection
                .find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .toArray(),
            collection.countDocuments(filter),
        ]);

        return {
            success: true,
            entries: entries.map((e: any) => ({ ...e, _id: e._id?.toString() })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async getMySummary(
        userId: string,
        startDate?: string,
        endDate?: string,
        dateField?: string,
    ): Promise<TesterLogSummaryResponse> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter: Record<string, any> = { submittedByUserId: userId };
        const dateFilter = buildDateFilter(startDate, endDate, dateField);
        if (dateFilter) {
            Object.assign(filter, dateFilter);
        }

        const entries: TesterLogEntry[] = await collection.find(filter).sort({ createdAt: -1 }).toArray();

        let passed = 0;
        let failed = 0;
        let partial = 0;
        let expectedOutput = 0;
        let anomalyFound = 0;
        let otherStatus = 0;

        let slaMet = 0;
        let slaBreached = 0;

        let responseTimeSum = 0;
        let responseTimeCount = 0;

        let totalDefects = 0;
        const defectsBySeverity = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
        };

        const byQuestionType: Record<string, number> = {};
        const byChannel: Record<string, number> = {};
        const byLanguage: Record<string, number> = {};
        const dailyMap: Record<string, { total: number; passed: number; failed: number }> = {};

        let sciCorrect = 0;
        let sciIncorrect = 0;

        let dbSaved = 0;
        let dbNotSaved = 0;

        let voiceInputWorking = 0;
        let voiceInputIssues = 0;
        let voiceOutputWorking = 0;

        for (const entry of entries) {
            const overall = (entry.overallTestStatus || '').trim().toLowerCase();
            if (overall === 'pass') {
                passed++;
            } else if (overall === 'fail') {
                failed++;
            } else if (overall === 'partial') {
                partial++;
            } else if (overall === 'expected output') {
                expectedOutput++;
            } else if (overall.includes('anomaly')) {
                anomalyFound++;
            } else if (overall) {
                otherStatus++;
            }

            const sla = (entry.slaStatus || '').trim().toLowerCase();
            if (sla === 'met' || sla === 'within sla' || sla === 'pass') {
                slaMet++;
            } else if (sla === 'breached' || sla === 'fail') {
                slaBreached++;
            }

            if (entry.responseTimeMins) {
                const trimmed = entry.responseTimeMins.trim();
                let mins: number | null = null;
                if (trimmed.includes(':')) {
                    const parts = trimmed.split(':').map(Number);
                    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                        mins = parts[0] * 60 + parts[1] + (parts[2] || 0) / 60;
                    }
                } else if (!isNaN(Number(trimmed))) {
                    mins = parseFloat(trimmed);
                }
                if (mins !== null && mins >= 0 && mins < 100000) {
                    responseTimeSum += mins;
                    responseTimeCount++;
                }
            }

            const sev = (entry.defectSeverity || '').trim().toLowerCase();
            const hasDefect = Boolean(
                (sev && !['na', 'nil', 'no defect', 'none'].includes(sev)) ||
                (entry.defectIdBugRef && entry.defectIdBugRef.trim() && !['na', 'nil', 'none'].includes(entry.defectIdBugRef.trim().toLowerCase()))
            );
            if (hasDefect) {
                totalDefects++;
                if (sev.includes('crit') || sev.includes('extreme')) {
                    defectsBySeverity.critical++;
                } else if (sev.includes('high')) {
                    defectsBySeverity.high++;
                } else if (sev.includes('med')) {
                    defectsBySeverity.medium++;
                } else if (sev.includes('low') || sev.includes('info')) {
                    defectsBySeverity.low++;
                }
            }

            const qType = (entry.typeOfQuestion || '').trim();
            if (qType) {
                byQuestionType[qType] = (byQuestionType[qType] || 0) + 1;
            }

            const channel = (entry.channelTested || '').trim();
            if (channel) {
                byChannel[channel] = (byChannel[channel] || 0) + 1;
            }

            const lang = (entry.languageTested || '').trim();
            if (lang) {
                byLanguage[lang] = (byLanguage[lang] || 0) + 1;
            }

            const dateKey = entry.testDate?.trim() || (entry.createdAt ? new Date(entry.createdAt).toISOString().slice(0, 10) : 'Unknown');
            if (dateKey) {
                if (!dailyMap[dateKey]) {
                    dailyMap[dateKey] = { total: 0, passed: 0, failed: 0 };
                }
                dailyMap[dateKey].total++;
                if (overall === 'pass' || overall === 'expected output') {
                    dailyMap[dateKey].passed++;
                } else if (overall === 'fail' || overall.includes('anomaly')) {
                    dailyMap[dateKey].failed++;
                }
            }

            const sci = (entry.answerScientificallyCorrect || '').trim().toLowerCase();
            if (sci === 'yes' || sci === 'correct') {
                sciCorrect++;
            } else if (sci === 'no' || sci === 'incorrect') {
                sciIncorrect++;
            }

            const qSaved = (entry.questionSavedInDb || '').trim().toLowerCase();
            const aSaved = (entry.answerSavedInDb || '').trim().toLowerCase();
            if (qSaved === 'yes' || aSaved === 'yes') {
                dbSaved++;
            } else if (qSaved === 'no' || aSaved === 'no') {
                dbNotSaved++;
            }

            const vIn = (entry.voiceInputWorking || '').trim().toLowerCase();
            if (vIn === 'yes') voiceInputWorking++;
            else if (vIn === 'no') voiceInputIssues++;

            const vOut = (entry.voiceOutputWorking || '').trim().toLowerCase();
            if (vOut === 'yes') voiceOutputWorking++;
        }

        const totalTests = entries.length;
        const passRate = totalTests > 0 ? Math.round(((passed + expectedOutput) / totalTests) * 1000) / 10 : 0;
        const failRate = totalTests > 0 ? Math.round(((failed + anomalyFound) / totalTests) * 1000) / 10 : 0;
        const totalSla = slaMet + slaBreached;
        const slaMetRate = totalSla > 0 ? Math.round((slaMet / totalSla) * 1000) / 10 : 0;
        const avgResponseMinutes = responseTimeCount > 0 ? Math.round((responseTimeSum / responseTimeCount) * 10) / 10 : null;

        const totalSci = sciCorrect + sciIncorrect;
        const sciRate = totalSci > 0 ? Math.round((sciCorrect / totalSci) * 1000) / 10 : 0;

        const totalDb = dbSaved + dbNotSaved;
        const dbRate = totalDb > 0 ? Math.round((dbSaved / totalDb) * 1000) / 10 : 0;

        const dailyStats = Object.entries(dailyMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, stats]) => ({
                date,
                total: stats.total,
                passed: stats.passed,
                failed: stats.failed,
            }));

        // Calculate Target vs. Achieved comparison
        let daysCount = 1;
        if (startDate && endDate) {
            const start = new Date(startDate.trim().slice(0, 10));
            const end = new Date(endDate.trim().slice(0, 10));
            const diffMs = end.getTime() - start.getTime();
            if (!isNaN(diffMs) && diffMs >= 0) {
                daysCount = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
            }
        }

        const categoryCounts: Record<string, { total: number; webApp: number; whatsApp: number }> = {
            'Unique': { total: 0, webApp: 0, whatsApp: 0 },
            'GDB': { total: 0, webApp: 0, whatsApp: 0 },
            'Outreach': { total: 0, webApp: 0, whatsApp: 0 },
            'Dynamic - Weather': { total: 0, webApp: 0, whatsApp: 0 },
            'Dynamic - Scheme': { total: 0, webApp: 0, whatsApp: 0 },
            'Dynamic - Mandi': { total: 0, webApp: 0, whatsApp: 0 },
        };

        for (const entry of entries) {
            const qType = (entry.typeOfQuestion || '').trim().toLowerCase();
            const cat = (entry.questionCategory || '').trim().toLowerCase();

            let targetType: string | null = null;
            if (qType === 'unique') {
                targetType = 'Unique';
            } else if (qType === 'gdb' || qType === 'gdp') {
                targetType = 'GDB';
            } else if (qType === 'outreach') {
                targetType = 'Outreach';
            } else if (qType.includes('weather') || cat.includes('weather') || cat.includes('climate') || cat.includes('stress')) {
                targetType = 'Dynamic - Weather';
            } else if (qType.includes('scheme') || cat.includes('scheme') || cat.includes('subsid')) {
                targetType = 'Dynamic - Scheme';
            } else if (qType.includes('mandi') || qType.includes('market') || cat.includes('mandi') || cat.includes('price')) {
                targetType = 'Dynamic - Mandi';
            } else if (qType.includes('dynamic')) {
                if (cat.includes('weather') || cat.includes('climate')) targetType = 'Dynamic - Weather';
                else if (cat.includes('scheme') || cat.includes('subsid')) targetType = 'Dynamic - Scheme';
                else if (cat.includes('mandi') || cat.includes('price')) targetType = 'Dynamic - Mandi';
                else targetType = 'Dynamic - Weather';
            }

            const ch = (entry.channelTested || '').trim().toLowerCase();
            const isBoth = ch.includes('both');
            const isWebApp = isBoth || ch.includes('web');
            const isWhatsApp = isBoth || ch.includes('whatsapp') || ch.includes('wa');

            if (targetType && categoryCounts[targetType]) {
                categoryCounts[targetType].total++;
                if (isWebApp) categoryCounts[targetType].webApp++;
                if (isWhatsApp) categoryCounts[targetType].whatsApp++;
            }
        }

        const DAILY_TARGET_DEFINITIONS = [
            { questionType: 'Unique', targetTotal: 8, targetWebApp: 4, targetWhatsApp: 4 },
            { questionType: 'GDB', targetTotal: 8, targetWebApp: 4, targetWhatsApp: 4 },
            { questionType: 'Outreach', targetTotal: 11, targetWebApp: 6, targetWhatsApp: 5 },
            { questionType: 'Dynamic - Weather', targetTotal: 19, targetWebApp: 9, targetWhatsApp: 10 },
            { questionType: 'Dynamic - Scheme', targetTotal: 6, targetWebApp: 3, targetWhatsApp: 3 },
            { questionType: 'Dynamic - Mandi', targetTotal: 2, targetWebApp: 1, targetWhatsApp: 1 },
        ];

        const targetRows = DAILY_TARGET_DEFINITIONS.map(def => {
            const counts = categoryCounts[def.questionType] || { total: 0, webApp: 0, whatsApp: 0 };
            const targetTotal = def.targetTotal * daysCount;
            const targetWebApp = def.targetWebApp * daysCount;
            const targetWhatsApp = def.targetWhatsApp * daysCount;
            const completionRate = targetTotal > 0 ? Math.round((counts.total / targetTotal) * 1000) / 10 : 0;
            return {
                questionType: def.questionType,
                targetTotal,
                achievedTotal: counts.total,
                targetWebApp,
                achievedWebApp: counts.webApp,
                targetWhatsApp,
                achievedWhatsApp: counts.whatsApp,
                completionRate,
            };
        });

        const totalAchievedTotal = targetRows.reduce((sum, r) => sum + r.achievedTotal, 0);
        const totalAchievedWebApp = targetRows.reduce((sum, r) => sum + r.achievedWebApp, 0);
        const totalAchievedWhatsApp = targetRows.reduce((sum, r) => sum + r.achievedWhatsApp, 0);
        const totalTargetTotal = 54 * daysCount;
        const totalTargetWebApp = 27 * daysCount;
        const totalTargetWhatsApp = 27 * daysCount;
        const totalCompletionRate = totalTargetTotal > 0 ? Math.round((totalAchievedTotal / totalTargetTotal) * 1000) / 10 : 0;

        const targetVsAchieved = {
            daysCount,
            rows: targetRows,
            total: {
                questionType: 'Total',
                targetTotal: totalTargetTotal,
                achievedTotal: totalAchievedTotal,
                targetWebApp: totalTargetWebApp,
                achievedWebApp: totalAchievedWebApp,
                targetWhatsApp: totalTargetWhatsApp,
                achievedWhatsApp: totalAchievedWhatsApp,
                completionRate: totalCompletionRate,
            },
        };

        return {
            success: true,
            totalTests,
            passed,
            failed,
            partial,
            expectedOutput,
            anomalyFound,
            otherStatus,
            passRate,
            failRate,
            slaMet,
            slaBreached,
            slaMetRate,
            avgResponseMinutes,
            totalDefects,
            defectsBySeverity,
            byQuestionType,
            byChannel,
            byLanguage,
            dailyStats,
            scientificAccuracy: {
                correct: sciCorrect,
                incorrect: sciIncorrect,
                rate: sciRate,
            },
            dbPersistence: {
                saved: dbSaved,
                notSaved: dbNotSaved,
                rate: dbRate,
            },
            voiceStats: {
                inputWorking: voiceInputWorking,
                inputIssues: voiceInputIssues,
                outputWorking: voiceOutputWorking,
            },
            targetVsAchieved,
        };
    }
}
