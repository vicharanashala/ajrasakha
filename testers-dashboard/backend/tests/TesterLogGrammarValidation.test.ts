import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TesterLogService } from '../services/TesterLogService.js';
import { BadRequestError } from 'routing-controllers';

describe('TesterLogService.validateGrammar', () => {
    let originalUrl: string | undefined;

    beforeEach(() => {
        originalUrl = process.env.GRAMMAR_VALIDATOR_URL;
    });

    afterEach(() => {
        process.env.GRAMMAR_VALIDATOR_URL = originalUrl;
        vi.restoreAllMocks();
    });

    it('rejects empty or whitespace-only text with BadRequestError', async () => {
        const service = new TesterLogService({} as any, {} as any);
        await expect(service.validateGrammar('')).rejects.toThrow(BadRequestError);
        await expect(service.validateGrammar('   ')).rejects.toThrow(BadRequestError);
    });

    it('successfully calls in-house Grammar Validator API and parses response', async () => {
        process.env.GRAMMAR_VALIDATOR_URL = 'http://100.100.108.44:8008';
        const service = new TesterLogService({} as any, {} as any);

        const mockApiResponse = {
            isValid: false,
            originalText: 'She go to school yesterday.',
            suggestions: [
                {
                    original: 'She go to school yesterday.',
                    corrected: 'She went to school yesterday.',
                    explanation: "Verb tense error: use 'went' instead of 'go'.",
                },
            ],
            validationErrors: [],
        };

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => mockApiResponse,
        } as Response);

        const result = await service.validateGrammar('She go to school yesterday.', 3);
        expect(fetchSpy).toHaveBeenCalledWith(
            'http://100.100.108.44:8008/validate',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: 'She go to school yesterday.',
                    maxSuggestions: 3,
                }),
            }),
        );
        expect(result.isValid).toBe(false);
        expect(result.suggestions).toHaveLength(1);
        expect(result.suggestions[0].corrected).toBe('She went to school yesterday.');
    });

    it('handles unreachable service gracefully without throwing', async () => {
        process.env.GRAMMAR_VALIDATOR_URL = 'http://100.100.108.44:8008';
        const service = new TesterLogService({} as any, {} as any);

        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection timed out'));

        const result = await service.validateGrammar('The application is working.');
        expect(result).toEqual({
            isValid: true,
            originalText: 'The application is working.',
            suggestions: [],
            validationErrors: [],
            isUnavailable: true,
        });
    });

    it('clamps maxSuggestions between 1 and 10', async () => {
        process.env.GRAMMAR_VALIDATOR_URL = 'http://100.100.108.44:8008';
        const service = new TesterLogService({} as any, {} as any);

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({ isValid: true, suggestions: [] }),
        } as Response);

        await service.validateGrammar('Test sentence', 20);
        expect(fetchSpy).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: JSON.stringify({
                    text: 'Test sentence',
                    maxSuggestions: 10,
                }),
            }),
        );
    });
});
