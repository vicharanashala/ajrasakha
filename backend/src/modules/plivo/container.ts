import { ContainerModule } from 'inversify';
import { PlivoController } from './controllers/PlivoController.js';
import { PlivoService } from './services/PlivoService.js';

export const plivoContainerModule = new ContainerModule(options => {
  options.bind(PlivoController).toSelf().inSingletonScope();
  options.bind(PlivoService).toSelf().inSingletonScope();
});

export const plivoContainerModules = [plivoContainerModule];

