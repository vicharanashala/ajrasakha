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
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IUser} from '#root/shared/interfaces/models.js';
import {
  GdbCleaningAnswerParam,
  GdbDecisionDto,
  GetGdbCleaningListQuery,
  SaveGdbCorrectionDto,
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
  async list(@QueryParams() query: GetGdbCleaningListQuery) {
    return this.service.list(query);
  }

  @OpenAPI({summary: 'Number of answers in each status'})
  @Get('/summary')
  @HttpCode(200)
  @Authorized(ROLES)
  async summary() {
    return this.service.summary();
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
  async get(@Params() params: GdbCleaningAnswerParam) {
    return this.service.get(params.answerId);
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
  ) {
    return this.service.saveCorrection(params.answerId, body.correctedAnswer);
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
