import { ContainerModule } from 'inversify';
import { StorageService } from './services/StorageService.js';
import { STORAGE_TYPES } from './types.js';

export const storageContainerModule = new ContainerModule(options => {
  options.bind(StorageService).toSelf().inSingletonScope();
  options.bind(STORAGE_TYPES.StorageService).to(StorageService).inSingletonScope();
});

export const storageContainerModules = [storageContainerModule];
