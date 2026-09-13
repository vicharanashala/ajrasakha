import 'reflect-metadata';
import {
  JsonController, Post, Get, Delete, Body, Param, HttpCode,
  CurrentUser, Authorized, BadRequestError,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { IUser } from '#root/shared/interfaces/models.js';
import { ISavedAnswerRepository } from '#root/shared/database/interfaces/ISavedAnswerRepository.js';

@OpenAPI({ tags: ['SavedAnswers'], description: 'Bookmarking answers for quick reuse' })
@JsonController('/saved-answers')
export class SavedAnswerController {
  constructor(
    @inject(GLOBAL_TYPES.SavedAnswerRepository)
    private readonly savedAnswerRepo: ISavedAnswerRepository,
  ) {}

  @OpenAPI({ summary: 'Bookmark an answer for later reuse' })
  @Post('/')
  @HttpCode(201)
  @Authorized()
  async save(@Body() body: { answerId: string; note?: string }, @CurrentUser() user: IUser) {
    if (!body?.answerId) throw new BadRequestError('answerId is required');
    return this.savedAnswerRepo.saveAnswer(user._id!.toString(), body.answerId, body.note);
  }

  @OpenAPI({ summary: "List the current user's saved answers" })
  @Get('/')
  @Authorized()
  async list(@CurrentUser() user: IUser) {
    return this.savedAnswerRepo.getSavedAnswers(user._id!.toString());
  }

  @OpenAPI({ summary: 'Remove a saved answer' })
  @Delete('/:id')
  @Authorized()
  async remove(@Param('id') id: string, @CurrentUser() user: IUser) {
    return this.savedAnswerRepo.removeSavedAnswer(user._id!.toString(), id);
  }
}