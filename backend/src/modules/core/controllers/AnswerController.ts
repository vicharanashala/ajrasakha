import 'reflect-metadata';
import {
  JsonController,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  Params,
  CurrentUser,
  Authorized,
  QueryParams,
  Put,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {IAnswer, IUser} from '#root/shared/interfaces/models.js';
import {AnswerService} from '../services/AnswerService.js';
import {
  AddAnswerBody,
  AnswerIdParam,
  AnswerResponse,
  DeleteAnswerParams,
  ReviewAnswerBody,
  SubmissionResponse,
  UpdateAnswerBody,
} from '../classes/validators/AnswerValidators.js';

@OpenAPI({
  tags: ['Answers'],
  description: 'Operations related to answers',
})
@JsonController('/answers')
export class AnswerController {
  constructor(
    @inject(GLOBAL_TYPES.AnswerService)
    private readonly answerService: AnswerService,
  ) {}

  @OpenAPI({summary: 'Add a new answer to a question'})
  @Post('/')
  @HttpCode(201)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async addAnswer(@Body() body: AddAnswerBody, @CurrentUser() user: IUser) {
    const {questionId, answer, sources} = body;
    const authorId = user._id.toString();
    return this.answerService.addAnswer(questionId, authorId, answer, sources);
  }

  @OpenAPI({summary: 'review and add a new answer to a question'})
  @Post('/review')
  @HttpCode(201)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async reviewAnswer(
    @Body() body: ReviewAnswerBody,
    @CurrentUser() user: IUser,
  ): Promise<{message: string}> {
    const userId = user._id.toString();
    return this.answerService.reviewAnswer(userId, body);
  }

  @Get('/submissions')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(SubmissionResponse, {isArray: true})
  @OpenAPI({summary: 'Get all submissions'})
  async getUnAnsweredQuestions(
    @QueryParams() query: {page?: number; limit?: number},
    @CurrentUser() user: IUser,
  ): Promise<SubmissionResponse[]> {
    const page = Number(query.page) ?? 1;
    const limit = Number(query.limit) ?? 10;
    const userId = user._id.toString();
    return this.answerService.getSubmissions(userId, page, limit);
  }

  @OpenAPI({summary: 'Update an existing answer'})
  @Put('/:answerId')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async updateAnswer(
    @Params() params: AnswerIdParam,
    @Body() body: UpdateAnswerBody,
    @CurrentUser() user: IUser,
  ) {
    const {answerId} = params;
    const {_id: userId} = user;
    return this.answerService.updateAnswer(userId.toString(), answerId, body);
  }

  @OpenAPI({summary: 'Delete an answer and update the related question state'})
  @Delete('/:questionId/:answerId')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async deleteAnswer(@Params() params: DeleteAnswerParams) {
    const {answerId, questionId} = params;
    return this.answerService.deleteAnswer(questionId, answerId);
  }
}
