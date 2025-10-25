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
  Post,
  Param,
  NotFoundError,
  Patch,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  IQuestion,
  IQuestionSubmission,
  IUser,
} from '#root/shared/interfaces/models.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {QuestionService} from '../services/QuestionService.js';
import {ContextIdParam} from '../classes/validators/ContextValidators.js';
import {
  AddQuestionBodyDto,
  AllocateExpertsRequest,
  GeneratedQuestionResponse,
  GenerateQuestionsBody,
  GetDetailedQuestionsQuery,
  QuestionIdParam,
  QuestionResponse,
  RemoveAllocateBody,
} from '../classes/validators/QuestionValidators.js';

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
  @Authorized()
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
    @QueryParams()
    query: GetDetailedQuestionsQuery,
    @CurrentUser() user: IUser,
  ): Promise<QuestionResponse[]> {
    const userId = user._id.toString();
    return this.questionService.getUnAnsweredQuestions(userId, query);
  }

  @Get('/detailed')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get detailed questions with advanced filters'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getDetailedQuestions(
    @QueryParams() query: GetDetailedQuestionsQuery,
  ): Promise<{questions: IQuestion[]; totalPages: number}> {
    return this.questionService.getDetailedQuestions(query);
  }

  @Post('/generate')
  @HttpCode(200)
  @ResponseSchema(GeneratedQuestionResponse, {isArray: true})
  @Authorized()
  @OpenAPI({summary: 'Generate questions from raw transcript'})
  async getQuestionFromRawContext(
    @Body() body: GenerateQuestionsBody,
  ): Promise<GeneratedQuestionResponse[]> {
    return this.questionService.getQuestionFromRawContext(body.transcript);
  }

  @Post('/')
  @HttpCode(201)
  // @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  @OpenAPI({summary: 'Add a new question'})
  async addQuestion(
    @Body()
    body: AddQuestionBodyDto,
    @CurrentUser() user: IUser,
  ): Promise<Partial<IQuestion>> {
    const userId = user._id.toString();
    // const userId = '';
    return this.questionService.addQuestion(userId, body);
  }

  @Get('/:questionId')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(QuestionResponse)
  @OpenAPI({summary: 'Get selected question by ID'})
  async getQuestionById(
    @Params() params: QuestionIdParam,
    @Body() updates: Partial<QuestionResponse>,
  ): Promise<QuestionResponse> {
    const {questionId} = params;
    return this.questionService.getQuestionById(questionId);
  }

  @Get('/:questionId/full')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get full details of selected question by ID'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getQuestionFull(
    @Params() params: QuestionIdParam,
    @CurrentUser() user: IUser,
  ) {
    const {questionId} = params;
    const userId = user._id.toString();
    const question = await this.questionService.getQuestionFullData(
      questionId,
      userId,
    );

    if (!question) {
      throw new NotFoundError(`Question with id ${questionId} not found`);
    }

    return {success: true, data: question};
  }

  @Patch('/:questionId/toggle-auto-allocate')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Toggle auto-allocate option for the selected question'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async toggleAutoAllocate(@Params() params: QuestionIdParam) {
    const {questionId} = params;
    return await this.questionService.toggleAutoAllocate(questionId);
  }

  @Post('/:questionId/allocate-experts')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Manually allocate experts to a selected question'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async allocateExperts(
    @Params() params: QuestionIdParam,
    @Body() body: AllocateExpertsRequest,
  ) {
    const {questionId} = params;
    const {experts} = body;
    return await this.questionService.allocateExperts(questionId, experts);
  }

  @Put('/:questionId')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(QuestionResponse, {isArray: true})
  @OpenAPI({summary: 'Update a question by ID'})
  async updateQuestion(
    @Params() params: QuestionIdParam,
    @Body() updates: Partial<IQuestion>,
  ): Promise<{modifiedCount: number}> {
    const {questionId} = params;
    return this.questionService.updateQuestion(questionId, updates);
  }

  @Delete('/:questionId/allocation')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Remove an allocation from a question by ID'})
  async removeAllocation(
    @Params() params: QuestionIdParam,
    @Body() body: RemoveAllocateBody,
  ): Promise<IQuestionSubmission> {
    const {questionId} = params;
    const {index} = body;
    return this.questionService.removeExpertFromQueue(questionId, index);
  }
  
  @Delete('/:questionId')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Delete a question by ID'})
  async deleteQuestion(
    @Params() params: QuestionIdParam,
  ): Promise<{deletedCount: number}> {
    const {questionId} = params;
    return this.questionService.deleteQuestion(questionId);
  }
}
