import 'reflect-metadata';
import {JsonController, Get, Post, HttpCode, QueryParam, Authorized, CurrentUser, ForbiddenError} from 'routing-controllers';
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

  @Get('/districts')
  @HttpCode(200)
  async getDistricts(
    @QueryParam('stateCode') stateCode: number,
  ): Promise<ILocationDistrict[]> {
    return this.locationService.getDistricts(stateCode);
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
