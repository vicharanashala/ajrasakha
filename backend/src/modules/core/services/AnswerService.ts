import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {
  IAnswer,
  IQuestionMetrics,
  ISubmissionHistroy,
} from '#root/shared/interfaces/models.js';
import {BadRequestError} from 'routing-controllers';
import {
  SubmissionResponse,
  UpdateAnswerBody,
} from '../classes/validators/AnswerValidators.js';
import {CORE_TYPES} from '../types.js';
import {AiService} from './AiService.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {dummyEmbeddings} from '../utils/questionGen.js';
import {
  IQuestionAnalysis,
  IQuestionWithAnswerTexts,
} from '../classes/validators/QuestionValidators.js';

@injectable()
export class AnswerService extends BaseService {
  constructor(
    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async addAnswer(
    questionId: string,
    authorId: string,
    answer: string,
    sources: string[],
  ): Promise<{insertedId: string; isFinalAnswer: boolean}> {
    return this._withTransaction(async (session: ClientSession) => {
      const question = await this.questionRepo.getById(questionId, session);

      if (!question) {
        throw new BadRequestError(`Question with ID ${questionId} not found`);
      }

      const isQuestionClosed = question.status === 'closed';

      if (isQuestionClosed) {
        throw new BadRequestError(`Question is already closed`);
      }

      const isAlreadyResponded = await this.answerRepo.getByAuthorId(
        authorId,
        questionId,
        session,
      );

      if (isAlreadyResponded) {
        throw new BadRequestError('You’ve already submitted an answer!');
      }

      // lets consider it is not final answer
      let isFinalAnswer = false;
      let metrics: IQuestionMetrics | null = null;
      let analysisStatus: 'CONTINUE' | 'FLAGGED_FOR_REVIEW' | 'CONVERGED' =
        'CONTINUE';
      const answers = (await this.answerRepo.getByQuestionId(questionId)) || [];

      // if (answers.length) {
      const answerTexts = answers.map(ans => ans.answer);

      const payload: IQuestionWithAnswerTexts = {
        question_id: questionId,
        question_text: question.question,
        answers: [...answerTexts, answer],
      };

      // Wait for AI analysis
      // const analysis = await this.aiService.evaluateAnswers(payload);
      const analysis: IQuestionAnalysis = {
        question_id: '68f137fe5fbcb9f0f5f091eb',
        num_answers: 5,
        mean_similarity: 0.72,
        std_similarity: 0.15,
        recent_similarity: 0.68,
        collusion_score: 0.85,
        status: 'CONTINUE',
        message: 'Similarity score is high, needs review',
      };

      metrics = {
        mean_similarity: analysis.mean_similarity,
        std_similarity: analysis.std_similarity,
        recent_similarity: analysis.recent_similarity,
        collusion_score: analysis.collusion_score,
      };

      analysisStatus = analysis.status;

      if (analysisStatus == 'CONVERGED') isFinalAnswer = true;

      if (isFinalAnswer) {
        const text = `Question: ${question.question}
Answer: ${answer}`;
        const {embedding} = await this.aiService.getEmbedding(text);
        await this.questionRepo.updateQuestion(
          questionId,
          {text, embedding},
          session,
          true,
        );
      }

      const updatedAnswerCount = question.totalAnswersCount + 1;

      // const {embedding} = await this.aiService.getEmbedding(answer);
      const embedding = []
      const {insertedId} = await this.answerRepo.addAnswer(
        questionId,
        authorId,
        answer,
        sources,
        embedding,
        isFinalAnswer,
        updatedAnswerCount,
        session,
      );
      await this.questionRepo.updateQuestion(
        questionId,
        {
          totalAnswersCount: updatedAnswerCount,
          metrics,
          status:
            analysisStatus == 'FLAGGED_FOR_REVIEW'
              ? 'in-review'
              : analysisStatus == 'CONTINUE'
                ? 'open'
                : 'closed',
        },
        session,
      );
      const userSubmissionData: ISubmissionHistroy = {
        updatedBy: new ObjectId(authorId),
        answer: new ObjectId(insertedId),
        isFinalAnswer,
        updatedAt: new Date(),
      };
      await this.questionSubmissionRepo.update(
        questionId,
        userSubmissionData,
        session,
      );
      return {insertedId, isFinalAnswer};
    });
  }

  async getSubmissions(
    userId: string,
    page: number,
    limit: number,
  ): Promise<SubmissionResponse[]> {
    return await this.answerRepo.getAllSubmissions(userId, page, limit);
  }

  async updateAnswer(
    answerId: string,
    updates: UpdateAnswerBody,
  ): Promise<{modifiedCount: number}> {
    return this._withTransaction(async (session: ClientSession) => {
      if (!answerId) throw new BadRequestError('AnswerId not found');
      const answer = await this.answerRepo.getById(answerId, session);

      if (!answer) {
        throw new BadRequestError(`Answer with ID ${answerId} not found`);
      }
      if (!answer.isFinalAnswer) {
        throw new BadRequestError(
          `Cant't edit this answer:${answerId}, it is not finalized yet!`,
        );
      }
      const questionId = answer.questionId.toString();

      const question = await this.questionRepo.getById(questionId);

      if (!question) {
        throw new BadRequestError(`Question with ID ${questionId} not found`);
      }

      const answers = await this.answerRepo.getByQuestionId(
        questionId,
        session,
      );

      const text = `Question: ${question.question}
        answer: ${answer}`;
      const {embedding: questionEmbedding} =
        await this.aiService.getEmbedding(text);

      await this.questionRepo.updateQuestion(
        questionId,
        {text, embedding: questionEmbedding},
        session,
        true,
      );

      const {embedding} = await this.aiService.getEmbedding(text);
      const payload = {...updates, embedding};
      return this.answerRepo.updateAnswer(answerId, payload, session);
    });
  }

  async deleteAnswer(
    questionId: string,
    answerId: string,
  ): Promise<{deletedCount: number}> {
    return this._withTransaction(async (session: ClientSession) => {
      const answer = await this.answerRepo.getById(answerId);
      if (!answer) {
        throw new BadRequestError(`Answer with ID ${answerId} not found`);
      }
      const question = await this.questionRepo.getById(questionId);

      if (!question) {
        throw new BadRequestError(`Question with ID ${questionId} not found`);
      }
      const updatedAnswerCount = question.totalAnswersCount - 1;

      const isFinalAnswer = answer.isFinalAnswer;

      await this.questionRepo.updateQuestion(
        questionId,
        {
          totalAnswersCount: updatedAnswerCount,
          status: isFinalAnswer ? 'open' : 'closed',
        },
        session,
      );

      return this.answerRepo.deleteAnswer(answerId, session);
    });
  }
}
