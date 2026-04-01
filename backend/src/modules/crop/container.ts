import {ContainerModule} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {CropController} from './controllers/CropController.js';
import {CropService} from './services/CropService.js';
import {CropRepository} from '#root/shared/database/providers/mongo/repositories/CropRepository.js';

export const cropContainerModule = new ContainerModule(options => {
  options.bind(CropController).toSelf().inSingletonScope();
  options.bind(GLOBAL_TYPES.CropService).to(CropService).inSingletonScope();
  options.bind(GLOBAL_TYPES.CropRepository).to(CropRepository).inSingletonScope();
});
