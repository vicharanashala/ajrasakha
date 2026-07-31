import {ContainerModule} from 'inversify';
import {WEATHER_TYPES} from './types.js';
import {WeatherService} from './services/WeatherService.js';
import {IWeatherService} from './services/WeatherService.js';

export const weatherContainer = new ContainerModule(bind => {
  bind<IWeatherService>(WEATHER_TYPES.WeatherService)
    .to(WeatherService)
    .inSingletonScope();
});
