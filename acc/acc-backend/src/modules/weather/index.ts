import { ContainerModule } from 'inversify';
import { WeatherController } from './controllers/WeatherController.js';
import { WeatherService } from './services/WeatherService.js';
import { GLOBAL_TYPES } from '#root/types.js';

export const weatherModuleControllers = [WeatherController];
export const weatherModuleValidators = [];

export const weatherContainerModules = [
  new ContainerModule(options => {
    options.bind(WeatherController).toSelf().inSingletonScope();
    options.bind(GLOBAL_TYPES.WeatherService).to(WeatherService).inSingletonScope();
  }),
];

export * from './controllers/WeatherController.js';
export * from './services/WeatherService.js';
export * from './types.js';
