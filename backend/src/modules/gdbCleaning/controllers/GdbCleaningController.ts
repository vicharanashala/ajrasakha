import 'reflect-metadata';
import {
  Authorized,
  Body,
  CurrentUser,
  Get,
  HttpCode,
  JsonController,
  Params,
  Post,
  Put,
  QueryParams,
  Res,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IUser} from '#root/shared/interfaces/models.js';
import {
  EditGdbFlagDto,
  GdbCleaningAnswerParam,
  GdbDecisionDto,
  GdbLibraryDocumentParam,
  GetGdbCleaningListQuery,
  GetGdbCleaningSummaryQuery,
  GetGdbHistoryQuery,
  ReleaseGdbReviewerDto,
  SaveGdbCorrectionDto,
  SaveGdbSourcesDto,
} from '../classes/validators/GdbCleaningValidators.js';
import {IGdbCleaningService} from '../interfaces/IGdbCleaningService.js';

// who can open the GDB Cleaning page and decide on answers
const ROLES = ['admin'];

@OpenAPI({
  tags: ['gdb-cleaning'],
  description:
    'Answers flagged by the quality checks, with a suggested correction, for review',
})
@injectable()
@JsonController('/gdb-cleaning')
export class GdbCleaningController {
  constructor(
    @inject(GLOBAL_TYPES.GdbCleaningService)
    private readonly service: IGdbCleaningService,
  ) {}

  @OpenAPI({
    summary: 'List answers (search, filters, pagination)',
    description:
      'Filters can be repeated, for example states=Punjab&states=Haryana.',
  })
  @Get('/')
  @HttpCode(200)
  @Authorized(ROLES)
  async list(
    @QueryParams() query: GetGdbCleaningListQuery,
    @CurrentUser() user: IUser,
  ) {
    return this.service.list(query, user._id.toString());
  }

  @OpenAPI({
    summary: 'Give the reviewer up to 50 to-do answers of their own',
    description:
      'Tops the reviewer up to 50 open answers with the oldest ones nobody holds. Each answer goes to one reviewer only.',
  })
  @Post('/assignments/refill')
  @HttpCode(200)
  @Authorized(ROLES)
  async refill(@CurrentUser() user: IUser) {
    return this.service.refill(user._id.toString());
  }

  @OpenAPI({summary: 'Take all the to-do answers back from a reviewer'})
  @Post('/assignments/release-all')
  @HttpCode(200)
  @Authorized(ROLES)
  async releaseAll(@Body() body: ReleaseGdbReviewerDto) {
    return this.service.releaseAll(body.userId);
  }

  @OpenAPI({
    summary: 'Number of answers in each status',
    description:
      'With from and to, fixed, dismissed and pushed count only those in that period.',
  })
  @Get('/summary')
  @HttpCode(200)
  @Authorized(ROLES)
  async summary(@QueryParams() query: GetGdbCleaningSummaryQuery) {
    return this.service.summary(query);
  }

  @OpenAPI({
    summary: 'History of what reviewers did, newest first',
    description:
      'Your own actions by default; scope=all shows everyone\'s. from and to are ISO dates.',
  })
  @Get('/history')
  @HttpCode(200)
  @Authorized(ROLES)
  async history(
    @QueryParams() query: GetGdbHistoryQuery,
    @CurrentUser() user: IUser,
  ) {
    return this.service.history(query, user._id.toString());
  }

  @OpenAPI({summary: 'States, crops and flags available as filters'})
  @Get('/filters')
  @HttpCode(200)
  @Authorized(ROLES)
  async filters() {
    return this.service.filterOptions();
  }

  @OpenAPI({summary: 'One answer with the result of every check'})
  @Get('/:answerId')
  @HttpCode(200)
  @Authorized(ROLES)
  async get(
    @Params() params: GdbCleaningAnswerParam,
    @CurrentUser() user: IUser,
  ) {
    return this.service.get(params.answerId, user._id.toString());
  }

  @OpenAPI({summary: 'Take an answer back from the reviewer who holds it'})
  @Post('/:answerId/release')
  @HttpCode(200)
  @Authorized(ROLES)
  async release(
    @Params() params: GdbCleaningAnswerParam,
    @CurrentUser() user: IUser,
  ) {
    return this.service.release(params.answerId, user._id.toString());
  }

  @OpenAPI({
    summary: 'Save a suggested or edited correction',
    description: 'Only an answer that is still to do can change.',
  })
  @Put('/:answerId/correction')
  @HttpCode(200)
  @Authorized(ROLES)
  async saveCorrection(
    @Params() params: GdbCleaningAnswerParam,
    @Body() body: SaveGdbCorrectionDto,
    @CurrentUser() user: IUser,
  ) {
    return this.service.saveCorrection(
      params.answerId,
      body.correctedAnswer,
      user._id.toString(),
    );
  }

  @OpenAPI({
    summary: 'Draft a suggested answer from the library',
    description:
      'Searches the library for the question and drafts an answer with citations to the document and page. Nothing is saved; the reviewer keeps what they want. Only the reviewer who holds the answer can draft.',
  })
  @Post('/:answerId/draft')
  @HttpCode(200)
  @Authorized(ROLES)
  async draft(
    @Params() params: GdbCleaningAnswerParam,
    @CurrentUser() user: IUser,
  ) {
    return this.service.draft(params.answerId, user._id.toString());
  }

  @OpenAPI({
    summary: 'Open the PDF of a library document that a draft cites',
    description:
      'Returns the uploaded PDF, so a reviewer can open it at the cited page. Needs the draft service to be configured.',
  })
  @Get('/library/:documentId/pdf')
  @HttpCode(200)
  @Authorized(ROLES)
  async libraryPdf(
    @Params() params: GdbLibraryDocumentParam,
    @Res() response: any,
  ) {
    const pdf = await this.service.libraryPdf(params.documentId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'inline');
    return response.send(pdf);
  }

  @OpenAPI({
    summary: 'Change one flag: not a problem (PASS) or a problem (FAIL)',
    description:
      'A comment is required. The check keeps the result the system found, and the change is saved next to it with who made it and when. Only an answer that is still to do can change.',
  })
  @Put('/:answerId/flags')
  @HttpCode(200)
  @Authorized(ROLES)
  async editFlag(
    @Params() params: GdbCleaningAnswerParam,
    @Body() body: EditGdbFlagDto,
    @CurrentUser() user: IUser,
  ) {
    return this.service.editFlag(params.answerId, body, user._id.toString());
  }

  @OpenAPI({
    summary: 'Correct the sources of the answer',
    description:
      'Replaces the list of sources on this row. The ones the pipeline saved are kept. Only an answer that is still to do can change.',
  })
  @Put('/:answerId/sources')
  @HttpCode(200)
  @Authorized(ROLES)
  async editSources(
    @Params() params: GdbCleaningAnswerParam,
    @Body() body: SaveGdbSourcesDto,
    @CurrentUser() user: IUser,
  ) {
    return this.service.editSources(
      params.answerId,
      body.sources,
      user._id.toString(),
    );
  }

  @OpenAPI({
    summary: 'Push the accepted correction to the golden answer',
    description:
      'Replaces the golden answer with the accepted correction, through the same flow the app uses to edit a final answer (embeddings included). Only a fixed answer, once.',
  })
  @Post('/:answerId/push')
  @HttpCode(200)
  @Authorized(ROLES)
  async push(
    @Params() params: GdbCleaningAnswerParam,
    @CurrentUser() user: IUser,
  ) {
    return this.service.pushToGdb(params.answerId, user._id.toString());
  }

  @OpenAPI({
    summary: 'Accept the correction or dismiss the flags',
    description:
      'Closes the answer as fixed or dismissed. An answer that is already decided is not changed.',
  })
  @Post('/:answerId/decision')
  @HttpCode(200)
  @Authorized(ROLES)
  async decide(
    @Params() params: GdbCleaningAnswerParam,
    @Body() body: GdbDecisionDto,
    @CurrentUser() user: IUser,
  ) {
    return this.service.decide(params.answerId, body, user._id.toString());
  }
}
