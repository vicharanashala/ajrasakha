import type {QuestionAiService} from '../services/QuestionAiService.js';

/**
 * Public surface of {@link QuestionAiService}, derived from the class so the
 * (partly inline) parameter/return types never have to be hand-restated.
 * QuestionService injects this and delegates the AI / ACC-agent methods to it.
 */
export type IQuestionAiService = Pick<
  QuestionAiService,
  | 'getQuestionFromRawContext'
  | 'getQuestionFromCallContext'
  | 'getCallSummary'
  | 'createAccAgentThread'
  | 'extractAccAgentData'
  | 'updateAccAgentState'
  | 'resumeAccAgentAndGetAnswer'
  | 'getAccAgentState'
>;
