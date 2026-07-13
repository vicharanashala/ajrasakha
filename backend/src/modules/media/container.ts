import { ContainerModule } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { MediaService } from './services/MediaService.js';
import { MediaRepository } from '#root/shared/database/providers/mongo/repositories/MediaRepository.js';

/**
 * The media module owns no controller — its routes live on DashboardContentController.
 * It exists purely to provide the MediaService + MediaRepository bindings.
 */
export const mediaContainerModule = new ContainerModule(options => {
  options.bind(GLOBAL_TYPES.MediaService).to(MediaService).inSingletonScope();
  options.bind(GLOBAL_TYPES.MediaRepository).to(MediaRepository).inSingletonScope();
});
