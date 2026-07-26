import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  HttpCode,
  Authorized,
  CurrentUser,
  QueryParam,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { injectable } from 'inversify';
import { IUser } from '#root/shared/index.js';
import { WeatherAlertService } from '../services/WeatherAlertService.js';

@OpenAPI({
  tags: ['alerts'],
  description: 'Weather alert management endpoints',
})
@injectable()
@JsonController('/alerts', { transformResponse: false })
export class AlertController {
  @OpenAPI({
    summary: 'Get recent weather alerts',
    description: 'Returns a list of recently triggered weather alerts with delivery stats.',
  })
  @Get('/weather')
  @HttpCode(200)
  @Authorized()
  async getRecentAlerts(
    @QueryParam('limit') limit = 50,
  ) {
    const service = new WeatherAlertService();
    try {
      const alerts = await service.getRecentAlerts(limit);
      return { alerts };
    } finally {
      await service.close();
    }
  }

  @OpenAPI({
    summary: 'Manually trigger weather alert scan',
    description: 'Triggers an immediate weather alert scan and returns results.',
  })
  @Post('/weather/scan')
  @HttpCode(200)
  @Authorized()
  async triggerScan(@CurrentUser() user: IUser) {
    if (user.role !== 'admin') {
      return { error: 'Only admins can trigger manual scans' };
    }
    const service = new WeatherAlertService();
    try {
      const stats = await service.run();
      return { success: true, stats };
    } finally {
      await service.close();
    }
  }
}
