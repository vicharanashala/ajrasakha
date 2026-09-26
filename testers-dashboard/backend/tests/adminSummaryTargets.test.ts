import { describe, it, expect } from 'vitest';
import {
    DAILY_TARGETS_PER_TESTER,
    QUESTION_TYPE_TARGETS,
    achievementPct,
    calendarDaysBetween,
    questionTypeKeyFor,
    summarizeEntries,
    workingDaysFor,
} from '../services/adminSummaryTargets.js';

describe('Admin Summary target model', () => {
    it('matches the Excel per-tester daily targets', () => {
        expect(QUESTION_TYPE_TARGETS.map((t) => [t.key, t.perDay, t.webAppPerDay, t.whatsAppPerDay])).toEqual([
            ['unique', 8, 4, 4],
            ['gdb', 8, 4, 4],
            ['outreach', 11, 6, 5],
            ['weather', 19, 9, 10],
            ['scheme', 6, 3, 3],
            ['mandi', 2, 1, 1],
        ]);
        expect(DAILY_TARGETS_PER_TESTER).toEqual({ workingMinutes: 450, total: 54, webApp: 27, whatsApp: 27 });
    });

    it('splits every category\'s daily target exactly across Web App and WhatsApp', () => {
        for (const t of QUESTION_TYPE_TARGETS) {
            expect(t.webAppPerDay + t.whatsAppPerDay).toBe(t.perDay);
        }
    });
});

describe('questionTypeKeyFor', () => {
    it.each([
        ['Unique', 'unique'],
        ['GDB', 'gdb'],
        ['Outreach', 'outreach'],
        ['Weather Dynamic', 'weather'],
        ['Scheme Dynamic', 'scheme'],
        ['Mandi Dynamic', 'mandi'],
    ])('maps the current form value "%s" to %s', (value, key) => {
        expect(questionTypeKeyFor(value)).toBe(key);
    });

    it.each([
        ['Dynamic - Weather', 'weather'],
        ['Dynamic – Scheme', 'scheme'],
        ['Dynamic-Mandi', 'mandi'],
        ['  weather   dynamic ', 'weather'],
        ['gdb', 'gdb'],
    ])('accepts the renamed/reformatted value "%s" as %s', (value, key) => {
        expect(questionTypeKeyFor(value)).toBe(key);
    });

    it.each([['Dynamic'], [''], [undefined], ['GDP'], ['Market Dynamic']])(
        'leaves "%s" uncategorized rather than guessing',
        (value) => {
            expect(questionTypeKeyFor(value)).toBeNull();
        },
    );
});

describe('achievementPct', () => {
    it.each([
        ['zero actual', 0, 54, 0],
        ['below 1%', 8, 1836, (8 / 1836) * 100],
        ['between 1% and 100%', 27, 54, 50],
        ['exactly 100%', 54, 54, 100],
        ['above 100%', 81, 54, 150],
        ['zero target', 5, 0, 0],
    ])('%s: %i of %i is %f', (_label, actual, target, expected) => {
        expect(achievementPct(actual, target)).toBe(expected);
    });
});

describe('working days', () => {
    it.each([
        ['2026-09-01', '2026-09-01', 1, 1],
        ['2026-09-01', '2026-09-07', 7, 6],
        ['2026-09-01', '2026-09-30', 30, 26],
    ])('%s..%s is %i calendar days, %i working days', (start, end, calendar, working) => {
        expect(calendarDaysBetween(start, end)).toBe(calendar);
        expect(workingDaysFor(calendar)).toBe(working);
    });

    it('is 0 for a reversed or incomplete range', () => {
        expect(calendarDaysBetween('2026-09-07', '2026-09-01')).toBe(0);
        expect(calendarDaysBetween('2026-09-07', undefined)).toBe(0);
    });
});

describe('summarizeEntries', () => {
    const entry = (typeOfQuestion: string, channelTested: string) => ({ typeOfQuestion, channelTested }) as any;

    it('counts each of the six categories against its own target, and the Total against 54 × days × headcount', () => {
        const result = summarizeEntries(
            [
                entry('Unique', 'WebApp'),
                entry('GDB', 'WhatsApp'),
                entry('Outreach', 'WebApp'),
                entry('Weather Dynamic', 'WhatsApp'),
                entry('Weather Dynamic', 'WhatsApp'),
                entry('Scheme Dynamic', 'WebApp'),
                entry('Mandi Dynamic', 'Both'),
                entry('Dynamic', 'WebApp'),
            ],
            6,
            3,
        );

        expect(result.byType.map((r) => [r.key, r.target, r.actual])).toEqual([
            ['unique', 8 * 18, 1],
            ['gdb', 8 * 18, 1],
            ['outreach', 11 * 18, 1],
            ['weather', 19 * 18, 2],
            ['scheme', 6 * 18, 1],
            ['mandi', 2 * 18, 1],
            ['total', 54 * 18, 7],
        ]);
        expect(result.uncategorizedCount).toBe(1);
        expect(result.counts).toEqual({ unique: 1, gdb: 1, outreach: 1, weather: 2, scheme: 1, mandi: 1 });
    });

    it('counts Web App and WhatsApp per category; "Both" counts toward each, a blank channel toward neither', () => {
        const result = summarizeEntries(
            [entry('Unique', 'WebApp'), entry('Unique', 'Both'), entry('Unique', ''), entry('GDB', 'WhatsApp')],
            1,
            1,
        );
        const unique = result.byType.find((r) => r.key === 'unique')!;

        expect(unique.actual).toBe(3);
        expect(unique.webApp).toEqual({ target: 4, actual: 2, achievementPct: 50 });
        expect(unique.whatsApp).toEqual({ target: 4, actual: 1, achievementPct: 25 });
        expect(result.webApp).toEqual({ target: 27, actual: 2, achievementPct: (2 / 27) * 100 });
        expect(result.whatsApp).toEqual({ target: 27, actual: 2, achievementPct: (2 / 27) * 100 });
    });

    it('leaves achievement unrounded, so values below 1% are not lost', () => {
        // 8 of 54 × 34 working days = 1,836 - the example that showed as 0%.
        const result = summarizeEntries(Array.from({ length: 8 }, () => entry('Unique', 'WebApp')), 34, 1);

        expect(result.overall.target).toBe(1836);
        expect(result.overall.achievementPct).toBeCloseTo(0.4357, 4);
    });

    it('returns zero targets and 0% (no division errors) when there are no working days', () => {
        const result = summarizeEntries([entry('Unique', 'WebApp')], 0, 5);

        expect(result.overall).toEqual({ target: 0, actual: 1, achievementPct: 0 });
    });
});
