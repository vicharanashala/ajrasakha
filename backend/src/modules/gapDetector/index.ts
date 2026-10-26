import { ContainerModule } from 'inversify';
import { sharedContainerModule } from '#root/container.js';
import { gapDetectorContainerModule } from './container.js';
import { GapDetectorController } from './controllers/GapDetectorController.js';

export const gapDetectorModuleControllers: Function[] = [GapDetectorController];

export const gapDetectorModuleValidators: Function[] = [];

export const gapDetectorContainerModules: ContainerModule[] = [
  gapDetectorContainerModule,
  sharedContainerModule,
];

export * from './types.js';
export * from './services/GapDetectorService.js';
export * from './controllers/GapDetectorController.js';

