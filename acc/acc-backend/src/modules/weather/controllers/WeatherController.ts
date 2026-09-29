import 'reflect-metadata';
import {
  JsonController,
  Get,
  QueryParam,
  HttpCode,
  Authorized,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { WeatherService } from '../services/WeatherService.js';
import { GLOBAL_TYPES } from '#root/types.js';

@OpenAPI({
  tags: ['weather'],
  description: 'Official IMD (India Meteorological Department) Weather Endpoints',
})
@Authorized()
@injectable()
@JsonController('/weather')
export class WeatherController {
  constructor(
    @inject(GLOBAL_TYPES.WeatherService)
    private readonly weatherService: WeatherService,
  ) { }

  @Get('/imd')
  @HttpCode(200)
  @OpenAPI({
    summary: 'Get live IMD weather observation and forecast',
    description: 'Returns IMD Automatic Weather Station (AWS) data, 7-day forecast, rainfall and warnings.',
  })
  async getImdWeather(
    @QueryParam('lat', { required: false }) lat?: number,
    @QueryParam('lon', { required: false }) lon?: number,
    @QueryParam('state', { required: false }) state?: string,
    @QueryParam('district', { required: false }) district?: string,
    @QueryParam('taluk', { required: false }) taluk?: string,
    @QueryParam('village', { required: false }) village?: string,
  ) {
    const parsedLat = lat != null ? Number(lat) : 20.3888;
    const parsedLon = lon != null ? Number(lon) : 78.1204;

    return await this.weatherService.getImdWeather({
      lat: isNaN(parsedLat) ? 20.3888 : parsedLat,
      lon: isNaN(parsedLon) ? 78.1204 : parsedLon,
      state,
      district,
      taluk,
      village,
    });
  }
}
