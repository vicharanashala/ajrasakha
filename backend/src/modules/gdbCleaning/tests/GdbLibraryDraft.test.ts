import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
  draftFromLibrary,
  fetchLibraryPdf,
  GdbLibraryDocumentNotFound,
} from '../services/GdbLibraryDraft.js';

const draft = {
  answer: 'Plant 7 feet apart for medium-tall banana. [P1]',
  citations: [
    {
      passageNumber: 1,
      documentName: 'Banana-cultivation_Gemini.pdf',
      documentId: 'doc-1',
      pageNumber: 4,
      passageId: 'p-1',
    },
  ],
  note: '',
};

describe('draftFromLibrary over HTTP', () => {
  beforeEach(() => {
    vi.stubEnv('GDB_DRAFT_URL', 'http://draft.internal:8013/');
    vi.stubEnv('GDB_DRAFT_TOKEN', 'secret-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts the question with the token and returns the draft', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(draft), {status: 200}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await draftFromLibrary('What spacing for banana?', 'Banana');

    expect(result).toEqual(draft);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://draft.internal:8013/draft');
    expect(init.headers['x-draft-token']).toBe('secret-token');
    expect(JSON.parse(init.body)).toEqual({question: 'What spacing for banana?', crop: 'Banana'});
  });

  it('turns an error response into an error with the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"detail":"Invalid draft token"}', {status: 401})),
    );

    await expect(draftFromLibrary('q')).rejects.toThrow(/\(401\).*Invalid draft token/);
  });

  it('says what to set when nothing is configured', async () => {
    vi.stubEnv('GDB_DRAFT_URL', '');
    vi.stubEnv('GDB_DRAFT_PYTHON', '');
    vi.stubEnv('GDB_PIPELINE_DIR', '');

    await expect(draftFromLibrary('q')).rejects.toThrow(/GDB_DRAFT_URL/);
  });
});

describe('fetchLibraryPdf', () => {
  beforeEach(() => {
    vi.stubEnv('GDB_DRAFT_URL', 'http://draft.internal:8013');
    vi.stubEnv('GDB_DRAFT_TOKEN', 'secret-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('gets the PDF from the draft service with the token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('%PDF-1.4 fake', {status: 200}));
    vi.stubGlobal('fetch', fetchMock);

    const pdf = await fetchLibraryPdf('doc 1/../x');

    expect(pdf.toString()).toBe('%PDF-1.4 fake');
    const [url, init] = fetchMock.mock.calls[0];
    // the id is encoded, so it cannot change the path that is requested
    expect(url).toBe('http://draft.internal:8013/documents/doc%201%2F..%2Fx/pdf');
    expect(init.headers['x-draft-token']).toBe('secret-token');
  });

  it('says not found when the service has no such document', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {status: 404})));

    await expect(fetchLibraryPdf('doc-9')).rejects.toBeInstanceOf(GdbLibraryDocumentNotFound);
  });

  it('needs the draft service to be configured', async () => {
    vi.stubEnv('GDB_DRAFT_URL', '');

    await expect(fetchLibraryPdf('doc-1')).rejects.toThrow(/GDB_DRAFT_URL/);
  });
});
