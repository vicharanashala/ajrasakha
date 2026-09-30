import {
  JsonController,
  Get,
  QueryParam,
  HttpCode,
  Authorized,
  BadRequestError,
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
    @QueryParam('lat', { required: true }) lat: number,
    @QueryParam('lon', { required: true }) lon: number,
    @QueryParam('state', { required: false }) state?: string,
    @QueryParam('district', { required: false }) district?: string,
    @QueryParam('taluk', { required: false }) taluk?: string,
    @QueryParam('village', { required: false }) village?: string,
  ) {
    if (lat == null || lon == null) {
      throw new BadRequestError('Latitude (lat) and Longitude (lon) are required query parameters.');
    }

    const parsedLat = Number(lat);
    const parsedLon = Number(lon);

    if (isNaN(parsedLat) || isNaN(parsedLon)) {
      throw new BadRequestError('Latitude (lat) and Longitude (lon) must be valid numbers.');
    }

    return await this.weatherService.getImdWeather({
      lat: parsedLat,
      lon: parsedLon,
      state,
      district,
      taluk,
      village,
    });
  }
}
