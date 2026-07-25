import 'reflect-metadata';
import {Get, JsonController} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {PublicDashboardService} from '../services/PublicDashboardService.js';

@OpenAPI({
  tags: ['public-dashboard'],
  description: 'Public (no-auth) dashboard data endpoints',
})
@injectable()
@JsonController('/public-dashboard')
export class PublicDashboardController {
  constructor(
    @inject(PublicDashboardService)
    private readonly publicDashboardService: PublicDashboardService,
  ) {}

  /**
   * Public: crops grouped by state whose question document count exceeds the
   * saturation limit. No authentication required.
   */
  @Get('/saturated-crops')
  @OpenAPI({
    summary:
      'Saturated crops grouped by state (question count > saturation limit)',
  })
  async getSaturatedCrops() {
    return this.publicDashboardService.getSaturatedCrops();
  }

  /**
   * Public: all active users with their public-facing fields
   * (firstName, lastName, preference, avatar, role, university, createdAt).
   */
  @Get('/users')
  @OpenAPI({
    summary: 'Active users with public-facing profile fields',
  })
  async getActiveUsers() {
    return this.publicDashboardService.getActiveUsers();
  }
}
