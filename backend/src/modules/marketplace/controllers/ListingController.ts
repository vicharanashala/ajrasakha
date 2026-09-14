import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Put,
  Delete,
  Body,
  HttpCode,
  Params,
  QueryParams,
  Authorized,
  CurrentUser,
  ForbiddenError,
  NotFoundError,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IUser, IListing} from '#root/shared/interfaces/models.js';
import {
  ListingIdParam,
  CreateListingDto,
  UpdateListingDto,
  GetAllListingsQuery,
} from '../classes/validators/ListingValidators.js';
import {IListingService} from '../interfaces/IListingService.js';

@OpenAPI({
  tags: ['marketplace'],
  description: 'Direct Farmer-to-Buyer marketplace listings',
})
@injectable()
@JsonController('/marketplace/listings')
export class ListingController {
  constructor(
    @inject(GLOBAL_TYPES.ListingService)
    private readonly listingService: IListingService,
  ) {}

  // ─── GET ALL LISTINGS (buyer browse/search) ─────────────────────────────

  @Get('/')
  @HttpCode(200)
  @Authorized()
  async getAllListings(
    @QueryParams() query: GetAllListingsQuery,
  ): Promise<{listings: IListing[]; totalCount: number; totalPages: number}> {
    return this.listingService.getAllListings(query);
  }

  // ─── GET MY LISTINGS (farmer dashboard) ─────────────────────────────────
  // IMPORTANT: must come BEFORE /:listingId to avoid being swallowed by wildcard.

  @Get('/mine')
  @HttpCode(200)
  @Authorized()
  async getMyListings(
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; data: IListing[]}> {
    const listings = await this.listingService.getMyListings(user._id.toString());
    return {success: true, data: listings};
  }

  // ─── GET LISTING BY ID ───────────────────────────────────────────────────

  @Get('/:listingId')
  @HttpCode(200)
  @Authorized()
  async getListingById(
    @Params() params: ListingIdParam,
  ): Promise<{success: boolean; data: IListing}> {
    const listing = await this.listingService.getListingById(params.listingId);
    if (!listing) {
      throw new NotFoundError(`Listing with id "${params.listingId}" not found`);
    }
    return {success: true, data: listing};
  }

  // ─── CREATE LISTING (farmer) ─────────────────────────────────────────────

  @Post('/')
  @HttpCode(201)
  @Authorized()
  async createListing(
    @Body() body: CreateListingDto,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; message: string; data: IListing}> {
    const listing = await this.listingService.createListing(body, user._id.toString());
    return {
      success: true,
      message: `Listing for "${listing.crop}" created successfully.`,
      data: listing,
    };
  }

  // ─── UPDATE LISTING (farmer, own listing only) ──────────────────────────

  @Put('/:listingId')
  @HttpCode(200)
  @Authorized()
  async updateListing(
    @Params() params: ListingIdParam,
    @Body() body: UpdateListingDto,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; message: string; data: IListing}> {
    const updated = await this.listingService.updateListing(
      params.listingId,
      body,
      user._id.toString(),
    );
    if (!updated) {
      throw new NotFoundError(`Listing with id "${params.listingId}" not found`);
    }
    return {success: true, message: 'Listing updated successfully.', data: updated};
  }

  // ─── DELETE LISTING (farmer, own listing only) ──────────────────────────

  @Delete('/:listingId')
  @HttpCode(200)
  @Authorized()
  async deleteListing(
    @Params() params: ListingIdParam,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; message: string}> {
    const deleted = await this.listingService.deleteListing(
      params.listingId,
      user._id.toString(),
    );
    if (!deleted) {
      throw new NotFoundError(`Listing with id "${params.listingId}" not found`);
    }
    return {success: true, message: 'Listing deleted successfully.'};
  }
}
