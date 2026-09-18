import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  Params,
  Authorized,
  CurrentUser,
  NotFoundError,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IUser, IDeal} from '#root/shared/interfaces/models.js';
import {DealIdParam, CreateDealDto, UpdateDealStatusDto} from '../classes/validators/DealValidators.js';
import {IDealService} from '../interfaces/IDealService.js';

@OpenAPI({
  tags: ['marketplace'],
  description: 'Buyer-Farmer deal negotiation on marketplace listings',
})
@injectable()
@JsonController('/marketplace/deals')
export class DealController {
  constructor(
    @inject(GLOBAL_TYPES.DealService)
    private readonly dealService: IDealService,
  ) {}

  // ─── GET MY DEALS (as farmer or buyer) ──────────────────────────────────

  @Get('/')
  @HttpCode(200)
  @Authorized()
  async getMyDeals(@CurrentUser() user: IUser): Promise<{success: boolean; data: IDeal[]}> {
    const deals = await this.dealService.getMyDeals(user._id.toString());
    return {success: true, data: deals};
  }

  // ─── GET DEAL BY ID ───────────────────────────────────────────────────────

  @Get('/:dealId')
  @HttpCode(200)
  @Authorized()
  async getDealById(
    @Params() params: DealIdParam,
  ): Promise<{success: boolean; data: IDeal}> {
    const deal = await this.dealService.getDealById(params.dealId);
    if (!deal) {
      throw new NotFoundError(`Deal with id "${params.dealId}" not found`);
    }
    return {success: true, data: deal};
  }

  // ─── CREATE DEAL (buyer makes an offer on a listing) ────────────────────

  @Post('/')
  @HttpCode(201)
  @Authorized()
  async createDeal(
    @Body() body: CreateDealDto,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; message: string; data: IDeal}> {
    const deal = await this.dealService.createDeal(body, user._id.toString());
    return {success: true, message: 'Offer sent to farmer successfully.', data: deal};
  }

  // ─── UPDATE DEAL STATUS (accept/reject/complete/cancel) ─────────────────

  @Patch('/:dealId/status')
  @HttpCode(200)
  @Authorized()
  async updateDealStatus(
    @Params() params: DealIdParam,
    @Body() body: UpdateDealStatusDto,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; message: string; data: IDeal}> {
    const updated = await this.dealService.updateDealStatus(
      params.dealId,
      body,
      user._id.toString(),
    );
    if (!updated) {
      throw new NotFoundError(`Deal with id "${params.dealId}" not found`);
    }
    return {success: true, message: `Deal marked as "${body.status}".`, data: updated};
  }
}
