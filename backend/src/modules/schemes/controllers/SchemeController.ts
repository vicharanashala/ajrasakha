import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  HttpCode,
  Authorized,
  CurrentUser,
  Param,
  QueryParam,
  Body,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { injectable } from 'inversify';
import { IUser } from '#root/shared/index.js';
import { SchemeMatcherService } from '../services/SchemeMatcherService.js';

@OpenAPI({
  tags: ['schemes'],
  description: 'Government scheme eligibility matching endpoints',
})
@injectable()
@JsonController('/schemes', { transformResponse: false })
export class SchemeController {
  @OpenAPI({
    summary: 'Match schemes for a specific farmer',
    description: 'Returns eligible government schemes based on the farmer\'s profile demographics.',
  })
  @Get('/match/:farmerId')
  @HttpCode(200)
  @Authorized()
  async matchFarmer(@Param('farmerId') farmerId: string) {
    const service = new SchemeMatcherService();
    try {
      const existing = await service.getFarmerMatches(farmerId);
      if (existing) return existing;

      return { error: 'No cached results. Run a bulk scan first or use /schemes/match-farmer.' };
    } finally {
      await service.close();
    }
  }

  @OpenAPI({
    summary: 'Match schemes for custom demographics',
    description: 'Searches MyScheme.gov.in with provided demographic filters and returns matching schemes.',
  })
  @Post('/match-farmer')
  @HttpCode(200)
  @Authorized()
  async matchCustomFarmer(
    @Body() body: {
      state?: string;
      age?: number;
      gender?: string;
      occupation?: string;
    },
  ) {
    const service = new SchemeMatcherService();
    try {
      const schemes = await service.matchFarmer({
        state: body.state,
        age: body.age,
        gender: body.gender,
      });
      return { schemes };
    } finally {
      await service.close();
    }
  }

  @OpenAPI({
    summary: 'Get matching stats and state distribution',
    description: 'Returns aggregate statistics of scheme matching results.',
  })
  @Get('/stats')
  @HttpCode(200)
  @Authorized()
  async getStats() {
    const service = new SchemeMatcherService();
    try {
      return await service.getStats();
    } finally {
      await service.close();
    }
  }

  @OpenAPI({
    summary: 'Get recent matching results',
    description: 'Returns the most recent farmer-scheme matching results.',
  })
  @Get('/results')
  @HttpCode(200)
  @Authorized()
  async getResults(
    @QueryParam('limit') limit = 50,
  ) {
    const service = new SchemeMatcherService();
    try {
      const results = await service.getRecentResults(limit);
      return { results };
    } finally {
      await service.close();
    }
  }

  @OpenAPI({
    summary: 'Trigger bulk scheme matching for all farmers',
    description: 'Runs eligibility matching against all farmers with profile data. Admin only.',
  })
  @Post('/scan')
  @HttpCode(200)
  @Authorized()
  async triggerBulkMatch(
    @CurrentUser() user: IUser,
    @Body() body: { batchSize?: number },
  ) {
    if (user.role !== 'admin') {
      return { error: 'Only admins can trigger bulk scans' };
    }

    const service = new SchemeMatcherService();
    try {
      const results = await service.matchAllFarmers(body.batchSize || 50);
      return {
        success: true,
        matched: results.length,
        message: `Matched ${results.length} farmers with eligible schemes.`,
      };
    } finally {
      await service.close();
    }
  }
}
