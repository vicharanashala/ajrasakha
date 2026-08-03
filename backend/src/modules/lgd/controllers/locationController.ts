import 'reflect-metadata';
import {JsonController, Get, Post, Put, Body, Param, HttpCode, QueryParam, Authorized, CurrentUser, ForbiddenError, BadRequestError} from 'routing-controllers';
import {inject, injectable} from 'inversify';
import {LGD_TYPES} from '../types.js';
import {IUser} from '#root/shared/interfaces/models.js';
import type {
  ILocationService,
  ILocationState,
  ILocationDistrict,
  ILocationBlock,
  ILocationVillage,
  IKvk,
  IKvkSyncResult,
} from '../interfaces/ILocationService.js';

// ── Allowed roles for triggering the KVK registry sync ──
const KVK_SYNC_ROLES = ['admin'];

@injectable()
@JsonController('/location')
export class LocationController {
  constructor(
    @inject(LGD_TYPES.LocationService)
    private readonly locationService: ILocationService,
  ) {}

  @Get('/states')
  @HttpCode(200)
  async getStates(): Promise<ILocationState[]> {
    return this.locationService.getStates();
  }

  // Admins/moderators manage the alternate names (aliases) for a state.
  @Put('/states/:stateCode/aliases')
  @HttpCode(200)
  @Authorized()
  async updateStateAliases(
    @CurrentUser() user: IUser,
    @Param('stateCode') stateCode: number,
    @Body() body: { aliases: string[]; name?: string },
  ): Promise<ILocationState> {
    if (user.role !== 'admin' && user.role !== 'moderator') {
      throw new ForbiddenError('Only admins and moderators can edit state aliases');
    }
    if (!Array.isArray(body?.aliases)) {
      throw new BadRequestError('aliases must be an array of strings');
    }
    return this.locationService.updateStateAliases(
      Number(stateCode),
      body.aliases,
      body.name,
    );
  }

  @Get('/districts')
  @HttpCode(200)
  async getDistricts(
    @QueryParam('stateCode') stateCode: number,
  ): Promise<ILocationDistrict[]> {
    return this.locationService.getDistricts(stateCode);
  }

  // Admins/moderators manage the alternate names (aliases) for a district.
  @Put('/districts/:districtCode/aliases')
  @HttpCode(200)
  @Authorized()
  async updateDistrictAliases(
    @CurrentUser() user: IUser,
    @Param('districtCode') districtCode: number,
    @Body() body: { aliases: string[]; name?: string },
  ): Promise<ILocationDistrict> {
    if (user.role !== 'admin' && user.role !== 'moderator') {
      throw new ForbiddenError('Only admins and moderators can edit district aliases');
    }
    if (!Array.isArray(body?.aliases)) {
      throw new BadRequestError('aliases must be an array of strings');
    }
    return this.locationService.updateDistrictAliases(
      Number(districtCode),
      body.aliases,
      body.name,
    );
  }

  @Get('/blocks')
  @HttpCode(200)
  async getBlocks(
    @QueryParam('districtCode') districtCode: number,
  ): Promise<ILocationBlock[]> {
    return this.locationService.getBlocks(districtCode);
  }

  @Get('/villages')
  @HttpCode(200)
  async getVillages(
    @QueryParam('blockCode') blockCode: number,
  ): Promise<ILocationVillage[]> {
    return this.locationService.getVillages(blockCode);
  }

  @Get('/kvks')
  @HttpCode(200)
  async getKvks(
    @QueryParam('districtCode') districtCode: number,
  ): Promise<IKvk[]> {
    return this.locationService.getKvks(districtCode);
  }

  // Runs the existing `scripts/create-lgd-kvks-collection.mjs --apply` script,
  // which reads the KVK registry CSV and upserts it into the `kvks` collection.
  @Post('/kvks/sync')
  @HttpCode(200)
  // @Authorized()
  async syncKvks(): Promise<IKvkSyncResult> {
    // if (!KVK_SYNC_ROLES.includes(user.role)) {
    //   throw new ForbiddenError('Only admins can trigger the KVK sync.');
    // }

    return this.locationService.syncKvks();
  }
}
