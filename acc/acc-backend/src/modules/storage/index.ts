import { StorageService } from './services/StorageService.js';
import { storageContainerModules, storageContainerModule } from './container.js';
import { STORAGE_TYPES } from './types.js';

export { StorageService, STORAGE_TYPES, storageContainerModules, storageContainerModule };

export const storageModuleControllers: Function[] = [];
export const storageModuleValidators: Function[] = [];
