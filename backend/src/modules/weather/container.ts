import {ContainerModule} from 'inversify';
import {WEATHER_TYPES} from './types.js';
import {WeatherService, IWeatherService} from './services/WeatherService.js';

export const weatherContainer = new ContainerModule(options => {
  options.bind<IWeatherService>(WEATHER_TYPES.WeatherService)
    .to(WeatherService)
    .inSingletonScope();
});
