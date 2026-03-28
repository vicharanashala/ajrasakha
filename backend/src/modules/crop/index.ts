import {ContainerModule} from 'inversify';
import {sharedContainerModule} from '#root/container.js';
import {cropContainerModule} from './container.js';
import {CropController} from './controllers/CropController.js';
import {CROP_VALIDATORS} from './classes/validators/CropValidators.js';

export const cropModuleControllers: Function[] = [CropController];

export const cropModuleValidators: Function[] = [...CROP_VALIDATORS];

export const cropContainerModules: ContainerModule[] = [
  cropContainerModule,
  sharedContainerModule,
];
