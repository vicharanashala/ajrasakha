import {ContainerModule} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {GdbCleaningController} from './controllers/GdbCleaningController.js';
import {GdbCleaningService} from './services/GdbCleaningService.js';
import {GdbCleaningRepository} from '#root/shared/database/providers/mongo/repositories/GdbCleaningRepository.js';

export const gdbCleaningContainerModule = new ContainerModule(options => {
  options.bind(GdbCleaningController).toSelf().inSingletonScope();
  options
    .bind(GLOBAL_TYPES.GdbCleaningService)
    .to(GdbCleaningService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.GdbCleaningRepository)
    .to(GdbCleaningRepository)
    .inSingletonScope();
});
