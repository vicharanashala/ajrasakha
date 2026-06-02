import {
  mockQuestionCollection,
  mockContextCollection,
  mockAnswersCollection,
  mockUsersCollection,
  mockReviewCollection,
  mockQuestionSubmissionCollection,
  mockDuplicateQuestionCollection,
  mockRerouteCollection,
} from './collections.mock.js';

export const mockDatabase = {
  getCollection: (name: string) => {
    switch (name) {
      case 'questions':
        return mockQuestionCollection;

      case 'contexts':
        return mockContextCollection;

      case 'answers':
        return mockAnswersCollection;

      case 'users':
        return mockUsersCollection;

      case 'reviews':
        return mockReviewCollection;

      case 'question_submissions':
        return mockQuestionSubmissionCollection;

      case 'duplicate_questions':
        return mockDuplicateQuestionCollection;

      case 'reroutes':
        return mockRerouteCollection;
      // default:
      //   return {};
    }
  },
};
