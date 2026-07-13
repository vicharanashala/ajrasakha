import { ContainerModule } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { MediaController } from './controllers/MediaController.js';
import { MediaService } from './services/MediaService.js';
import { MediaRepository } from '#root/shared/database/providers/mongo/repositories/MediaRepository.js';

export const mediaContainerModule = new ContainerModule(options => {
  options.bind(MediaController).toSelf().inSingletonScope();
  options.bind(GLOBAL_TYPES.MediaService).to(MediaService).inSingletonScope();
  options.bind(GLOBAL_TYPES.MediaRepository).to(MediaRepository).inSingletonScope();
});
