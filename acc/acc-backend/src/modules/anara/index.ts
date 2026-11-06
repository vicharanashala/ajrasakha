import { ContainerModule } from 'inversify';
import { AnaraController } from './controllers/AnaraController.js';
import { AnaraService } from './services/AnaraService.js';
import { GLOBAL_TYPES } from '#root/types.js';

export const anaraModuleControllers = [AnaraController];
export const anaraModuleValidators = [];

export const anaraContainerModules = [
  new ContainerModule(options => {
    options.bind(AnaraController).toSelf().inSingletonScope();
    options.bind(GLOBAL_TYPES.AnaraService).to(AnaraService).inSingletonScope();
  }),
];

export * from './controllers/AnaraController.js';
export * from './services/AnaraService.js';
export * from './types.js';

