import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTesterLogDto, UpdateTesterLogDto } from '../validators/TesterLogValidators.js';

describe('TesterLogValidators DTO validation', () => {
    it('accepts CreateTesterLogDto with empty strings for optional reviewer names and waThreadId', async () => {
        const raw = {
            channelTested: 'WebApp',
            typeOfQuestion: 'GDB',
            queryText: 'This is a valid test query',
            authorsName: '',
            reviewer1Name: '',
            reviewer2Name: '',
            reviewer3Name: '',
            reviewer4Name: '',
            reviewer5Name: '',
            moderatorName: '',
            waThreadId: '',
            webThreadId: '',
            originalLanguage: '',
            translatedLanguage: '',
        };

        const dto = plainToInstance(CreateTesterLogDto, raw);
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('accepts CreateTesterLogDto with whitespace-only strings for optional fields', async () => {
        const raw = {
            channelTested: 'WhatsApp',
            typeOfQuestion: 'Dynamic',
            queryText: 'This is a valid test query',
            authorsName: '   ',
            reviewer1Name: '  ',
            moderatorName: '   ',
            waThreadId: '   ',
        };

        const dto = plainToInstance(CreateTesterLogDto, raw);
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('rejects invalid names when a non-empty name is provided', async () => {
        const raw = {
            channelTested: 'WebApp',
            typeOfQuestion: 'GDB',
            queryText: 'This is a valid test query',
            authorsName: 'John123',
        };

        const dto = plainToInstance(CreateTesterLogDto, raw);
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'authorsName')).toBe(true);
    });

    it('rejects invalid waThreadId when a non-empty invalid identifier is provided', async () => {
        const raw = {
            channelTested: 'Both',
            typeOfQuestion: 'GDB',
            queryText: 'This is a valid test query',
            waThreadId: 'bad!phone@#$',
        };

        const dto = plainToInstance(CreateTesterLogDto, raw);
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'waThreadId')).toBe(true);
    });

    it('accepts valid waThreadId and valid names', async () => {
        const raw = {
            channelTested: 'Both',
            typeOfQuestion: 'GDB',
            queryText: 'This is a valid test query',
            authorsName: 'Jane Doe',
            reviewer1Name: 'Mary-Jane',
            moderatorName: "Dr. O'Connor",
            waThreadId: '+919876543210',
        };

        const dto = plainToInstance(CreateTesterLogDto, raw);
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });
});
