import { ContainerModule } from 'inversify';
import { PlivoController } from './controllers/PlivoController.js';
import { FarmerController } from './controllers/FarmerController.js';
import { PlivoService } from './services/PlivoService.js';
import { FarmerService } from './services/FarmerService.js';
import { CallFarmerRepository } from '#root/shared/database/providers/mongo/repositories/CallFarmerRepository.js';
import { CallDetailsRepository } from '#root/shared/database/providers/mongo/repositories/CallDetailsRepository.js';
import { PLIVO_TYPES } from './types.js';
import { GLOBAL_TYPES } from '#root/types.js';

export const plivoContainerModule = new ContainerModule(options => {
  options.bind(PlivoController).toSelf().inSingletonScope();
  options.bind(FarmerController).toSelf().inSingletonScope();
  options.bind(PLIVO_TYPES.PlivoService).to(PlivoService).inSingletonScope();
  options.bind(PLIVO_TYPES.FarmerService).to(FarmerService).inSingletonScope();
  options.bind(PLIVO_TYPES.CallFarmerRepository).to(CallFarmerRepository).inSingletonScope();
  options.bind(PLIVO_TYPES.CallDetailsRepository).to(CallDetailsRepository).inSingletonScope();
});

export const plivoContainerModules = [plivoContainerModule];

