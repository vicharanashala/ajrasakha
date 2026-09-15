import { injectable, inject } from 'inversify';
import {
    ITesterLogService,
    TesterLogEntry,
    PaginatedTesterLogEntries,
    CreateTesterLogEntryResponse,
} from '../interfaces/ITesterLogService.js';

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
        body: Omit<TesterLogEntry, '_id' | 'submittedByUserId' | 'submittedByEmail' | 'testerName' | 'createdAt' | 'updatedAt'>,
    ): Promise<CreateTesterLogEntryResponse> {
        const now = new Date();

        const entry: TesterLogEntry = {
            ...body,
            submittedByUserId: userId,
            submittedByEmail: email,
            testerName,
            responseTimeMins: computeHmsDiff(body.timeQuestionAsked, body.timeAnswerReceived, body.testDate),
            authorTatMins: computeHmsDiff(body.authorAssignmentTime, body.authorCompletionTime, body.testDate),
            review1TatMins: computeHmsDiff(body.reviewer1AssignmentTime, body.reviewer1CompletionTime, body.testDate),
            review2TatMins: computeHmsDiff(body.reviewer2AssignmentTime, body.reviewer2CompletionTime, body.testDate),
            review3TatMins: computeHmsDiff(body.reviewer3AssignmentTime, body.reviewer3CompletionTime, body.testDate),
            review4TatMins: computeHmsDiff(body.reviewer4AssignmentTime, body.reviewer4CompletionTime, body.testDate),
            review5TatMins: computeHmsDiff(body.reviewer5AssignmentTime, body.reviewer5CompletionTime, body.testDate),
            moderatorTatMins: computeHmsDiff(body.moderatorAssignmentTime, body.moderatorCompletionTime, body.testDate),
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
    ): Promise<PaginatedTesterLogEntries> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter = { submittedByUserId: userId };
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
    ): Promise<PaginatedTesterLogEntries> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter: Record<string, any> = testerId ? { submittedByUserId: testerId } : {};
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
}
