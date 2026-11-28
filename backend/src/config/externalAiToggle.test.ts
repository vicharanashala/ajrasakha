import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const openAiCreate = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: openAiCreate } } };
  }),
}));

// Loads fresh modules so aiConfig re-reads ENABLE_EXTERNAL_AI_SERVICES.
async function loadModules() {
  vi.resetModules();
  const axios = (await import('axios')).default;
  const { AiService } = await import('#root/modules/ai/services/AiService.js');
  const { AnswerAiService } = await import('#root/modules/answer/services/AnswerAiService.js');
  const { WhatsAppService } = await import('#root/modules/whatsapp/services/WhatsAppService.js');
  const { checkConceptDuplicate } = await import('#root/modules/question/aiservice/checkConceptDuplicate.js');
  return { axios, AiService, AnswerAiService, WhatsAppService, checkConceptDuplicate };
}

describe('ENABLE_EXTERNAL_AI_SERVICES=false', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('ENABLE_EXTERNAL_AI_SERVICES', 'false');
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
    openAiCreate.mockReset();
  });

  it('skips every external call and returns safe fallbacks', async () => {
    const { axios, AiService, AnswerAiService, WhatsAppService, checkConceptDuplicate } = await loadModules();
    const ai = new AiService();
    const whatsApp = new WhatsAppService({} as any);
    const empty = { reviewer: [], golden: [], pop: [] };

    expect(await ai.getQuestionByContext('q')).toEqual(empty);
    expect(await ai.getQuestionByContextAndMetaData('q', 's')).toEqual(empty);
    expect(await ai.getFinalAnswerByThreshold({ text1: 'a', text2: 'b' })).toEqual({ similarity_score: 0 });
    await expect(ai.evaluateAnswers({} as any)).rejects.toThrow('disabled');
    expect(await ai.getEmbedding('text')).toEqual({ embedding: [] });
    await expect(ai.getAnswerByQuestionDetails({ question: 'q' } as any)).rejects.toThrow('disabled');
    expect(await ai.fetchWhatsAppMessage('t', 'q')).toBeNull();
    expect(await ai.searchGdb({ crop: 'c', state: 's', rephrased_query: 'q' })).toBeNull();
    expect(await ai.checkPendingDuplicate({ crop: 'c', state: 's', rephrased_query: 'q' })).toBeNull();
    expect(await ai.detectChemicals('urea')).toEqual({ matches: [] });
    await expect(new AnswerAiService().fetchAiInitialAnswer({} as any)).rejects.toThrow('disabled');
    expect(await checkConceptDuplicate('hi', [])).toEqual({ isNonAgri: false, matchedIndex: null });
    expect(await whatsApp.getThreads()).toEqual([]);
    expect(await whatsApp.getThreadDetails('919999999999', '2026-01-01')).toEqual([]);
    expect((await whatsApp.getInactiveUsers(0, 10)).data).toEqual([]);
    expect((await whatsApp.getAllUsers()).data).toEqual([]);
    expect(await whatsApp.getUniqueUsers()).toBe(0);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
    expect(openAiCreate).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[ENABLE_EXTERNAL_AI_SERVICES=false] Skipping'));
  });

  it('still calls the AI server when the flag is true', async () => {
    vi.stubEnv('ENABLE_EXTERNAL_AI_SERVICES', 'true');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ embedding: [1, 2] }) });
    const { AiService } = await loadModules();

    expect(await new AiService().getEmbedding('text')).toEqual({ embedding: [1, 2] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
