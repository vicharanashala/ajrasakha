import { ContainerModule } from 'inversify';
import { sharedContainerModule } from '#root/container.js';
import { cropCalendarContainerModule } from './container.js';
import { CropCalendarController } from './controllers/CropCalendarController.js';

export const cropCalendarModuleControllers: Function[] = [CropCalendarController];
export const cropCalendarModuleValidators: Function[] = [];
export const cropCalendarContainerModules: ContainerModule[] = [cropCalendarContainerModule, sharedContainerModule];
