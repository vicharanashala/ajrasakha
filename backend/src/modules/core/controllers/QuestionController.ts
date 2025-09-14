import 'reflect-metadata';
import {
  JsonController,
  Get,
  Put,
  Delete,
  Body,
  HttpCode,
  Params,
  QueryParams,
  Authorized,
  CurrentUser,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IQuestion, IUser} from '#root/shared/interfaces/models.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {QuestionService} from '../services/QuestionService.js';
import {ContextIdParam} from '../classes/validators/ContextValidators.js';
import {
  QuestionIdParam,
  QuestionResponse,
} from '../classes/validators/QuestionValidators.js';
import {currentUserChecker} from '#root/shared/functions/currentUserChecker.js';

@OpenAPI({
  tags: ['questions'],
  description: 'Operations for managing questions',
})
@injectable()
@JsonController('/questions')
export class QuestionController {
  constructor(
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: QuestionService,
  ) {}

  @Get('/context/:contextId')
  @HttpCode(200)
  @OpenAPI({summary: 'Get questions by context ID'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getByContextId(@Params() params: ContextIdParam): Promise<IQuestion[]> {
    const {contextId} = params;
    return this.questionService.getByContextId(contextId);
  }

  @Get('/')
  @HttpCode(200)
  @ResponseSchema(QuestionResponse, {isArray: true})
  @Authorized()
  @OpenAPI({summary: 'Get all open status questions'})
  async getUnAnsweredQuestions(
    @QueryParams() query: {page?: number; limit?: number},
    @CurrentUser() user: IUser,
  ): Promise<QuestionResponse[]> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const userId = user._id.toString();
    return this.questionService.getUnAnsweredQuestions(userId, page, limit);
  }

  @Get('/:questionId')
  @HttpCode(200)
  @ResponseSchema(QuestionResponse)
  @OpenAPI({summary: 'Get selected question by ID'})
  async getQuestionById(
    @Params() params: QuestionIdParam,
    @Body() updates: Partial<QuestionResponse>,
  ): Promise<QuestionResponse> {
    const {questionId} = params;
    return this.questionService.getQuestionById(questionId);
  }

  @Put('/:questionId')
  @HttpCode(200)
  @ResponseSchema(QuestionResponse, {isArray: true})
  @OpenAPI({summary: 'Update a question by ID'})
  async updateQuestion(
    @Params() params: QuestionIdParam,
    @Body() updates: Partial<IQuestion>,
  ): Promise<{modifiedCount: number}> {
    const {questionId} = params;
    return this.questionService.updateQuestion(questionId, updates);
  }

  @Delete('/:questionId')
  @HttpCode(200)
  @OpenAPI({summary: 'Delete a question by ID'})
  async deleteQuestion(
    @Params() params: QuestionIdParam,
  ): Promise<{deletedCount: number}> {
    const {questionId} = params;
    return this.questionService.deleteQuestion(questionId);
  }
}
