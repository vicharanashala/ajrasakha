import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TesterLogService } from '../services/TesterLogService.js';
import { BadRequestError } from 'routing-controllers';

describe('TesterLogService.formatRemarks', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
        originalEnv = process.env.GEMINI_API_KEY;
    });

    afterEach(() => {
        process.env.GEMINI_API_KEY = originalEnv;
        vi.restoreAllMocks();
    });

    it('rejects empty or whitespace-only text with BadRequestError', async () => {
        const service = new TesterLogService({} as any, {} as any);
        await expect(service.formatRemarks('')).rejects.toThrow(BadRequestError);
        await expect(service.formatRemarks('   ')).rejects.toThrow(BadRequestError);
    });

    it('returns raw text as fallback when GEMINI_API_KEY is not set', async () => {
        delete process.env.GEMINI_API_KEY;
        const service = new TesterLogService({} as any, {} as any);
        const result = await service.formatRemarks('Raw tester notes here', 'Bug');
        expect(result).toEqual({
            originalText: 'Raw tester notes here',
            formattedText: 'Raw tester notes here',
        });
    });

    it('successfully calls Gemini API and returns polished remarks', async () => {
        process.env.GEMINI_API_KEY = 'test-key';
        const service = new TesterLogService({} as any, {} as any);

        const mockResponse = {
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: 'Issue: Submit button is unresponsive.\nObserved Behavior: Nothing occurs upon click.\nExpected: Form submits successfully.',
                            },
                        ],
                    },
                },
            ],
        };

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
        } as Response);

        const result = await service.formatRemarks('button not clicking bro', 'Bug', 'en-IN');
        expect(fetchSpy).toHaveBeenCalled();
        expect(result.originalText).toBe('button not clicking bro');
        expect(result.formattedText).toContain('Issue: Submit button is unresponsive.');
    });

    it('falls back to raw text if Gemini API fails', async () => {
        process.env.GEMINI_API_KEY = 'test-key';
        const service = new TesterLogService({} as any, {} as any);

        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: async () => 'Internal Server Error',
        } as Response);

        const result = await service.formatRemarks('Sample note');
        expect(result.originalText).toBe('Sample note');
        expect(result.formattedText).toBe('Sample note');
    });
});
