import {vi} from 'vitest';

const createMockCollection = () => ({
  insertOne: vi.fn(),
  insertMany: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  updateOne: vi.fn(),
  updateMany: vi.fn(),
  deleteOne: vi.fn(),
  deleteMany: vi.fn(),
  aggregate: vi.fn(),
  countDocuments: vi.fn(),
  findOneAndUpdate: vi.fn(),
  createIndex: vi.fn(),
});

export const mockQuestionCollection = createMockCollection();

export const mockContextCollection = createMockCollection();

export const mockAnswersCollection = createMockCollection();

export const mockUsersCollection = createMockCollection();

export const mockReviewCollection = createMockCollection();

export const mockQuestionSubmissionCollection = createMockCollection();

export const mockDuplicateQuestionCollection = createMockCollection();

export const mockRerouteCollection = createMockCollection();

export const resetCollections = () => {
  [
    mockQuestionCollection,
    mockContextCollection,
    mockAnswersCollection,
    mockUsersCollection,
    mockReviewCollection,
    mockQuestionSubmissionCollection,
    mockDuplicateQuestionCollection,
    mockRerouteCollection,
  ].forEach(collection => {
    Object.values(collection).forEach((fn: any) => fn?.mockClear?.());
  });
};
