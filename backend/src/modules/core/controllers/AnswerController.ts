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
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async addAnswer(@Body() body: AddAnswerBody, @CurrentUser() user: IUser) {
    const {questionId, answer} = body;
    const authorId = user._id.toString();
    return this.answerService.addAnswer(questionId, authorId, answer);
  }

  @OpenAPI({summary: 'Update an existing answer'})
  @Patch('/:answerId')
  @HttpCode(200)
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async updateAnswer(
    @Params() params: AnswerIdParam,
    @Body() body: UpdateAnswerBody,
  ) {
    const {answerId} = params;
    return this.answerService.updateAnswer(answerId, body);
  }

  @OpenAPI({summary: 'Delete an answer and update the related question state'})
  @Delete('/:questionId/:answerId')
  @HttpCode(200)
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async deleteAnswer(@Params() params: DeleteAnswerParams) {
    const {answerId, questionId} = params;
    return this.answerService.deleteAnswer(questionId, answerId);
  }
}
