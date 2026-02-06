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
  UploadedFile,
  BadRequestError,
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
import {
  AddQuestionBodyDto,
  AllocateExpertsRequest,
  BulkDeleteQuestionDto,
  DateRangeRequest,
  GeneratedQuestionResponse,
  GenerateQuestionsBody,
  GetDetailedQuestionsQuery,
  QuestionIdParam,
  QuestionResponse,
  RemoveAllocateBody
} from '../classes/validators/QuestionVaidators.js';
import * as XLSX from 'xlsx';
import {
  getBackgroundJobs,
  getJobById,
  startBackgroundProcessing,
} from '#root/workers/workerManager.js';
import { ContextIdParam } from '#root/modules/context/classes/validators/ContextValidator.js';
import { QuestionService } from '../services/QuestionService.js';
import { UploadFileOptions } from '#root/modules/core/classes/validators/fileUploadOptions.js';
import { QuestionLevelResponse } from '#root/modules/core/classes/transformers/QuestionLevel.js';
import { IQuestionService } from '../interfaces/IQuestionService.js';

@OpenAPI({
  tags: ['questions'],
  description: 'Operations for managing questions',
})
@injectable()
@JsonController('/questions')
export class QuestionController {
  constructor(
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,
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

  @Get('/allocated')
  @HttpCode(200)
  @ResponseSchema(QuestionResponse, {isArray: true})
  @Authorized()
  @OpenAPI({summary: 'Get all open status questions'})
  async getAllocatedQuestions(
    @QueryParams()
    query: GetDetailedQuestionsQuery,
    @CurrentUser() user: IUser,
  ): Promise<QuestionResponse[]> {
    const userId = user._id.toString();
    return this.questionService.getAllocatedQuestions(userId, query);
  }

  @Get('/allocated/page')
  @Authorized()
  @OpenAPI({summary: 'Get particular question'})
  async getAllocatedQuestionPage(
    @QueryParams() query: {questionId: string},
    @CurrentUser() user: IUser,
  ) {
    return this.questionService.getAllocatedQuestionPage(
      user._id.toString(),
      query.questionId,
    );
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
  @ResponseSchema(Object, {statusCode: 400})
  @OpenAPI({summary: 'Add a new question (single or bulk upload)'})
  async addQuestion(
    @UploadedFile('file', {options: UploadFileOptions})
    file: Express.Multer.File,
    @Body() body: AddQuestionBodyDto,
    @CurrentUser() user: IUser,
  ): Promise<Partial<any> | {message: string}> {
    const userId = user?._id?.toString();

    if (file) {
      let payload: any[] = [];
      try {
        const mimetype = file.mimetype;
        const filename = file.originalname.toLowerCase();

        if (mimetype === 'application/json' || filename.endsWith('.json')) {
          const fileContent = file.buffer
            .toString('utf-8')
            .trim()
            .replace(/^\uFEFF/, '');
          payload = JSON.parse(fileContent);
        } else if (
          mimetype ===
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          mimetype === 'application/vnd.ms-excel' ||
          filename.endsWith('.xls') ||
          filename.endsWith('.xlsx')
        ) {
          const workbook = XLSX.read(file.buffer, {type: 'buffer'});
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          payload = XLSX.utils.sheet_to_json(worksheet);
        } else {
          throw new BadRequestError(
            'Unsupported file type. Please upload a JSON or Excel file.',
          );
        }

        if (!Array.isArray(payload)) {
          throw new BadRequestError(
            'File content must be an array of questions',
          );
        }

        console.log('Paylod: ', payload);
        const insertedIds = await this.questionService.createBulkQuestions(
          userId,
          payload,
        );
        setImmediate(() => startBackgroundProcessing(insertedIds));
        return {
          message: `✅ ${insertedIds.length} questions have been uploaded successfully. The expert allocation process has been initiated.`,
          insertedIds,
          isBulkUpload: !!file,
        };
      } catch (err: any) {
        throw new BadRequestError(
          err?.message || 'Failed to process uploaded file',
        );
      }
    } else {
      const inserted = this.questionService.addQuestion(userId, body);
      return inserted;
    }
  }
  @Post('/reAllocateLessWorkload')
  @HttpCode(200)
 // @ResponseSchema(Object, {statusCode: 400})
  @OpenAPI({summary: 'ReAllocating questions which are delayed to those who has less workload'})
  async reAllocateLessWorkload() {
   try{
   return await this.questionService.balanceWorkload()

   }
   catch (err: any) {
    throw new BadRequestError(
      err?.message || 'Failed to process uploaded file',
    );
    
  }

    
     
   
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
    @CurrentUser() user: IUser,
  ) {
    const {_id: userId} = user;
    const {questionId} = params;
    const {experts} = body;
    return await this.questionService.allocateExperts(
      userId.toString(),
      questionId,
      experts,
    );
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
    @CurrentUser() user: IUser,
  ): Promise<IQuestionSubmission> {
    const {_id: userId} = user;
    const {questionId} = params;
    const {index} = body;
    return this.questionService.removeExpertFromQueue(
      userId.toString(),
      questionId,
      index,
    );
  }

  @Delete('/bulk')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Bulk delete questions'})
  async bulkDeleteQuestions(
    @Body() body: BulkDeleteQuestionDto,
  ): Promise<{deletedCount: number}> {
    const {questionIds} = body;
    return this.questionService.bulkDeleteQuestions(questionIds);
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

  @Get('/')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(QuestionResponse)
  @OpenAPI({summary: 'Get all questions and review levels'})
  async getQuestionsAndReviewlevel(
     @QueryParams() query: GetDetailedQuestionsQuery
  ): Promise<QuestionLevelResponse> {
    return this.questionService.getQuestionAndReviewLevel(query);
  }

  @Get('/background-status')
  getAllJobs() {
    return getBackgroundJobs();
  }

  @Get('/:id')
  getJob(@Param('id') id: string) {
    const job = getJobById(id);
    if (!job) return {message: 'Job not found'};
    return job;
  }

  // @Post('/data/out-reach/date')
  // @HttpCode(200)
  // // @Authorized()
  // @OpenAPI({summary: 'Get Ajrasakha Questions '})
  // @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  // async outreachQuestions(
  //   @Body() body: DateRangeRequest,
  //   @CurrentUser() user: IUser,
  // ) {
  //   const { startDate, endDate } = body;

  //   return await this.questionService.getQuestionsByDateRange(
  //     startDate,
  //     endDate,
  //   );
  // }


  @Post('/data/out-reach/date')
@HttpCode(200)
// @Authorized()
@OpenAPI({ summary: 'Send Ajrasakha Questions via Email' })
@ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
async outreachQuestions(
  @Body() body: DateRangeRequest,
  @CurrentUser() user: IUser,
) {
  const { startDate, endDate,emails } = body;

  await this.questionService.sendOutReachQuestionsMail(
    startDate,
    endDate,
    emails,
  );

  return {
    success: true,
    message: 'Outreach questions report sent via email',
  };
}

}
