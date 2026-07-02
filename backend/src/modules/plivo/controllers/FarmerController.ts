import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  QueryParams,
  Authorized,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { PLIVO_TYPES } from '../types.js';
import type { IFarmerService } from '../services/FarmerService.js';
import type { FarmerProfile, CallFarmer } from '#root/shared/database/interfaces/IFarmerRepository.js';

@OpenAPI({
  tags: ['farmer'],
  description: 'Farmer profile management endpoints',
})
@injectable()
@JsonController('/farmer', { transformResponse: false })
export class FarmerController {
  constructor(
    @inject(PLIVO_TYPES.FarmerService)
    private readonly farmerService: IFarmerService,
  ) { }

  @OpenAPI({
    summary: 'Get all farmers',
    description: 'Retrieves all farmer profiles.',
  })
  @Get('/')
  @HttpCode(200)
  @Authorized()
  async getAllFarmers() {
    try {
      const result = await this.farmerService.getAllFarmers();
      return result;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] FarmerController.getAllFarmers: Error processing request:`, error.stack || error);
      throw error;
    }
  }

  @OpenAPI({
    summary: 'Get farmer by phone number',
    description: 'Retrieves farmer profile associated with the given phone number.',
  })
  @Get('/:phoneNo')
  @HttpCode(200)
  @Authorized()
  async getFarmerByPhoneNo(@Param('phoneNo') phoneNo: string) {
    try {
      const result = await this.farmerService.getFarmerByPhoneNo(phoneNo);
      return result;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] FarmerController.getFarmerByPhoneNo: Error for phoneNo ${phoneNo}:`, error.stack || error);
      throw error;
    }
  }

  @OpenAPI({
    summary: 'Create new farmer profile',
    description: 'Creates a new farmer profile with the given phone number and profile data.',
  })
  @Post('/')
  @HttpCode(201)
  @Authorized()
  async createFarmer(@Body() body: { phoneNo: string; profile: FarmerProfile }) {
    try {
      const result = await this.farmerService.createFarmer(body.phoneNo, body.profile);
      return result;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] FarmerController.createFarmer: Error for phoneNo ${body.phoneNo}:`, error.stack || error);
      throw error;
    }
  }

  @OpenAPI({
    summary: 'Update farmer profile',
    description: 'Updates the farmer profile for the given phone number.',
  })
  @Put('/:phoneNo')
  @HttpCode(200)
  @Authorized()
  async updateFarmer(
    @Param('phoneNo') phoneNo: string,
    @Body() body: { profile: FarmerProfile },
  ) {
    try {
      const result = await this.farmerService.updateFarmer(phoneNo, body.profile);
      return result;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] FarmerController.updateFarmer: Error updating phoneNo ${phoneNo}:`, error.stack || error);
      throw error;
    }
  }

  @OpenAPI({
    summary: 'Delete farmer profile',
    description: 'Deletes the farmer profile associated with the given phone number.',
  })
  @Delete('/:phoneNo')
  @HttpCode(200)
  @Authorized()
  async deleteFarmer(@Param('phoneNo') phoneNo: string) {
    try {
      const result = await this.farmerService.deleteFarmer(phoneNo);
      return result;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] FarmerController.deleteFarmer: Error deleting phoneNo ${phoneNo}:`, error.stack || error);
      throw error;
    }
  }
}
