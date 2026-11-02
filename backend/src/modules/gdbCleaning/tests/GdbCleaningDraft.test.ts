import 'reflect-metadata';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {ObjectId} from 'mongodb';
import {IGdbCleaning} from '#root/shared/interfaces/models.js';
import {IGdbCleaningRepository} from '#root/shared/database/interfaces/IGdbCleaningRepository.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IAnswerApprovalService} from '#root/modules/answer/interfaces/IAnswerApprovalService.js';
import {GdbCleaningService} from '../services/GdbCleaningService.js';
import {
  draftFromLibrary,
  fetchLibraryPdf,
  GdbLibraryDocumentNotFound,
} from '../services/GdbLibraryDraft.js';

// the draft service is a separate process, so the tests replace its calls with stubs
vi.mock('../services/GdbLibraryDraft.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../services/GdbLibraryDraft.js')>()),
  draftFromLibrary: vi.fn(),
  fetchLibraryPdf: vi.fn(),
}));

const draftResult = {
  answer: 'Malathion 50 EC at 2 ml per litre controls aphids. [P1]',
  citations: [
    {
      passageNumber: 1,
      documentName: 'POP mustard guide (Hindi)',
      documentId: 'doc-1',
      pageNumber: 4,
      passageId: 'p-1',
    },
  ],
  note: '',
};

const makeDoc = (overrides: Partial<IGdbCleaning> = {}): IGdbCleaning => ({
  answerId: new ObjectId(),
  questionId: new ObjectId(),
  question: 'What dose of malathion for aphids on mustard?',
  answer: 'Spray Endosulfan.',
  state: 'Punjab',
  crop: 'Mustard',
  domain: 'Insect - Pest Management',
  sources: [],
  status: 'todo',
  checks: [],
  flags: ['banned_chemical'],
  notEvaluated: [],
  correctedAnswer: null,
  checkedAt: null,
  pipelineVersion: null,
  model: null,
  reviewedBy: null,
  reviewedAt: null,
  ...overrides,
});

// the draft only reads one answer, so the fake repository needs just that
const repoWith = (doc: IGdbCleaning | null) =>
  ({
    getByAnswerId: async () => doc,
  }) as unknown as IGdbCleaningRepository;

const serviceWith = (repo: IGdbCleaningRepository) =>
  new GdbCleaningService(
    repo,
    {} as IAnswerRepository,
    {} as IAnswerApprovalService,
    {} as IUserRepository,
  );

describe('GdbCleaningService draft', () => {
  beforeEach(() => {
    vi.mocked(draftFromLibrary).mockReset();
    vi.mocked(draftFromLibrary).mockResolvedValue(draftResult);
  });

  it('drafts from the question and the crop of the answer', async () => {
    const doc = makeDoc();
    const result = await serviceWith(repoWith(doc)).draft(doc.answerId.toString());
    expect(draftFromLibrary).toHaveBeenCalledWith(doc.question, doc.crop);
    expect(result).toEqual(draftResult);
  });

  it('returns not found for an unknown answer', async () => {
    await expect(
      serviceWith(repoWith(null)).draft(new ObjectId().toString()),
    ).rejects.toMatchObject({httpCode: 404});
    expect(draftFromLibrary).not.toHaveBeenCalled();
  });
});

describe('GdbCleaningService libraryPdf', () => {
  beforeEach(() => {
    vi.mocked(fetchLibraryPdf).mockReset();
  });

  it('returns the PDF a citation points to', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake');
    vi.mocked(fetchLibraryPdf).mockResolvedValue(pdf);

    const result = await serviceWith(repoWith(null)).libraryPdf('doc-1');

    expect(result).toBe(pdf);
    expect(fetchLibraryPdf).toHaveBeenCalledWith('doc-1');
  });

  it('returns not found when the library has no such document', async () => {
    vi.mocked(fetchLibraryPdf).mockRejectedValue(new GdbLibraryDocumentNotFound('doc-9'));

    await expect(serviceWith(repoWith(null)).libraryPdf('doc-9')).rejects.toMatchObject({
      httpCode: 404,
    });
  });

  it('passes on any other failure', async () => {
    vi.mocked(fetchLibraryPdf).mockRejectedValue(new Error('draft service down'));

    await expect(serviceWith(repoWith(null)).libraryPdf('doc-1')).rejects.toThrow(
      'draft service down',
    );
  });
});
