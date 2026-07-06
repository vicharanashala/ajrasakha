import 'reflect-metadata';
import {JsonController, Get, HttpCode, QueryParam} from 'routing-controllers';
import {inject, injectable} from 'inversify';
import {LGD_TYPES} from '../types.js';
import type {
  ILocationService,
  ILocationState,
  ILocationDistrict,
  ILocationBlock,
  ILocationVillage,
} from '../interfaces/ILocationService.js';

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
}
