import { describe, expect, it } from 'vitest';
import { classifyAnswerTrust } from './answerTrust';
import type { IQuestionFullData } from '@/types';

function question(overrides: Partial<IQuestionFullData> = {}): IQuestionFullData {
  return {
    _id: 'q-1',
    question: 'What to spray for rice blast?',
    status: 'open',
    details: { state: 'AP', district: 'K', crop: 'rice', season: 'kharif', domain: ['plant'] },
    isAutoAllocate: true,
    priority: 'high',
    context: '',
    metrics: { mean_similarity: 0, std_similarity: 0, recent_similarity: 0, collusion_score: 0 },
    source: 'AJRASAKHA',
    totalAnswersCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    submission: { _id: 's-1', questionId: 'q-1', lastRespondedBy: null, queue: [], history: [], createdAt: '', updatedAt: '' },
    isAlreadySubmitted: false,
    approved_moderator: { name: '', email: '' },
    ...overrides,
  };
}

const goldenAnswer = (text: string) => ({
  question: 'reference',
  status: 'closed',
  details: { state: 'AP', district: 'K', crop: 'rice', season: 'kharif', domain: 'plant' },
  text,
});

describe('classifyAnswerTrust', () => {
  it('classifies a Golden Dataset answer as verified', () => {
    const q = question({ referenceQuestionData: goldenAnswer('Expert verified answer.') });
    expect(classifyAnswerTrust(q)).toBe('verified');
  });

  it('classifies an expert-reviewed answer as expert_reviewed', () => {
    const q = question({
      submission: {
        _id: 's-1',
        questionId: 'q-1',
        lastRespondedBy: null,
        queue: [],
        history: [
          {
            updatedBy: null,
            answer: {
              questionId: 'q-1',
              authorId: 'a-1',
              answerIteration: 1,
              isFinalAnswer: true,
              approvalCount: 1,
              remarks: '',
              sources: [],
              answer: 'Expert answer.',
              threshold: 0,
            },
            status: 'approved',
            approvedAnswer: '',
            rejectedAnswer: '',
            reasonForRejection: '',
            modifiedAnswer: '',
            reasonForLastModification: '',
          },
        ],
        createdAt: '',
        updatedAt: '',
      },
    });
    expect(classifyAnswerTrust(q)).toBe('expert_reviewed');
  });

  it('classifies an AI-only answer as ai_generated', () => {
    const q = question({ aiInitialAnswer: 'AI generated draft.' });
    expect(classifyAnswerTrust(q)).toBe('ai_generated');
  });

  it('classifies a question with no answer as awaiting_review', () => {
    const q = question();
    expect(classifyAnswerTrust(q)).toBe('awaiting_review');
  });

  it('prioritizes expert-reviewed over a Golden Dataset answer', () => {
    const q = question({
      referenceQuestionData: goldenAnswer('Expert verified answer.'),
      closedFinalAnswer: {
        _id: 'f-1',
        questionId: 'q-1',
        authorId: 'a-1',
        approvedBy: null,
        answer: 'Expert final answer.',
        isFinalAnswer: true,
        sources: [],
        answerIteration: 1,
        approvalCount: 1,
      },
    });
    expect(classifyAnswerTrust(q)).toBe('expert_reviewed');
  });

  it('prioritizes a usable Golden Dataset answer over AI-generated', () => {
    const q = question({
      referenceQuestionData: goldenAnswer('Expert verified answer.'),
      aiInitialAnswer: 'AI generated draft.',
    });
    expect(classifyAnswerTrust(q)).toBe('verified');
  });

  it('prioritizes expert-reviewed over AI-generated', () => {
    const q = question({
      submission: {
        _id: 's-1',
        questionId: 'q-1',
        lastRespondedBy: null,
        queue: [],
        history: [
          {
            updatedBy: null,
            answer: {
              questionId: 'q-1',
              authorId: 'a-1',
              answerIteration: 1,
              isFinalAnswer: true,
              approvalCount: 1,
              remarks: '',
              sources: [],
              answer: 'Expert answer.',
              threshold: 0,
            },
            status: 'approved',
            approvedAnswer: '',
            rejectedAnswer: '',
            reasonForRejection: '',
            modifiedAnswer: '',
            reasonForLastModification: '',
          },
        ],
        createdAt: '',
        updatedAt: '',
      },
      aiApprovedAnswer: 'Approved AI answer.',
    });
    expect(classifyAnswerTrust(q)).toBe('expert_reviewed');
  });

  it('prioritizes expert-reviewed when all answer sources are present', () => {
    const q = question({
      referenceQuestionData: goldenAnswer('Expert verified answer.'),
      aiInitialAnswer: 'AI generated draft.',
      aiApprovedAnswer: 'Approved AI answer.',
      closedFinalAnswer: {
        _id: 'f-1',
        questionId: 'q-1',
        authorId: 'a-1',
        approvedBy: null,
        answer: 'Expert final answer.',
        isFinalAnswer: true,
        sources: [],
        answerIteration: 1,
        approvalCount: 1,
      },
    });
    expect(classifyAnswerTrust(q)).toBe('expert_reviewed');
  });

  it('does not mark verified when reference metadata exists but text is empty', () => {
    const q = question({
      similarityScore: 95,
      referenceQuestionId: 'r-1',
      referenceQuestion: 'similar',
      referenceSource: 'golden',
      referenceQuestionData: goldenAnswer('   '),
      aiInitialAnswer: 'AI draft.',
    });
    expect(classifyAnswerTrust(q)).not.toBe('verified');
    expect(classifyAnswerTrust(q)).toBe('ai_generated');
  });

  it('classifies AI answer with golden metadata but no usable answer as ai_generated', () => {
    const q = question({
      similarityScore: 95,
      referenceQuestionId: 'r-1',
      referenceQuestion: 'similar',
      referenceSource: 'golden',
      referenceQuestionData: goldenAnswer(''),
      aiApprovedAnswer: 'Approved AI answer.',
    });
    expect(classifyAnswerTrust(q)).toBe('ai_generated');
  });

  it('treats a closed final answer as expert_reviewed', () => {
    const q = question({
      closedFinalAnswer: {
        _id: 'f-1',
        questionId: 'q-1',
        authorId: 'a-1',
        approvedBy: null,
        answer: 'Final reviewed answer.',
        isFinalAnswer: true,
        sources: [],
        answerIteration: 1,
        approvalCount: 1,
      },
    });
    expect(classifyAnswerTrust(q)).toBe('expert_reviewed');
  });
});
