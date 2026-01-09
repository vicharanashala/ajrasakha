import {
  JsonController,
  Get,
  Params,
  QueryParams,
  Authorized,
  HttpCode,
  Body,
  Post,
  CurrentUser,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {IComment, IUser} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import { CommentService } from '../services/CommentService.js';
import { AddCommentBody, AddCommentParams, GetCommentsParams, GetCommentsQuery } from '../classes/validators/CommentValidator.js';

@OpenAPI({
  tags: ['Comments'],
  description: 'Operations related to comments',
})
@JsonController('/comments')
export class CommentController {
  constructor(
    @inject(GLOBAL_TYPES.CommentService)
    private commentService: CommentService,
  ) {}

  @OpenAPI({summary: 'Get comments for a specific answer of a question'})
  @Get('/question/:questionId/answer/:answerId')
  @HttpCode(200)
  @Authorized()
  async getComments(
    @Params() params: GetCommentsParams,
    @QueryParams() query: GetCommentsQuery,
  ): Promise<{comments: IComment[]; total: number}> {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;

    return this.commentService.getComments(
      params.questionId,
      params.answerId,
      page,
      limit,
    );
  }

  @OpenAPI({summary: 'Add a comment to a specific answer of a question'})
  @Post('/question/:questionId/answer/:answerId')
  @HttpCode(201)
  @Authorized()
  async addComment(
    @Params() params: AddCommentParams,
    @Body() body: AddCommentBody,
    @CurrentUser() user: IUser,
  ): Promise<boolean> {
    const {answerId, questionId} = params;
    const {text} = body;
    const userId = user._id.toString();
    return this.commentService.addComment(questionId, answerId, text, userId);
  }
}
