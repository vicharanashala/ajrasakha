import { ContainerModule } from 'inversify';
import { AccAgentController } from './controllers/AccAgentController.js';
import { AccAgentService } from './services/AccAgentService.js';
import { GLOBAL_TYPES } from '#root/types.js';

export const accAgentModuleControllers = [AccAgentController];
export const accAgentModuleValidators = [];

export const accAgentContainerModules = [
  new ContainerModule(options => {
    options.bind(AccAgentController).toSelf().inSingletonScope();
    options.bind(GLOBAL_TYPES.AccAgentService).to(AccAgentService).inSingletonScope();
  }),
];

export * from './controllers/AccAgentController.js';
export * from './services/AccAgentService.js';
