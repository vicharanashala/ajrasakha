import { ContainerModule } from 'inversify';
import { PlivoController } from './controllers/PlivoController.js';

export const plivoContainerModule = new ContainerModule(options => {
  options.bind(PlivoController).toSelf().inSingletonScope();
});

export const plivoContainerModules = [plivoContainerModule];

