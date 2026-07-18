import {ContainerModule} from 'inversify';
import {sharedContainerModule} from '#root/container.js';
import {fertilizerContainerModule} from './container.js';
import {FertilizerController} from './controllers/FertilizerController.js';

export const fertilizerModuleControllers: Function[] = [FertilizerController];
export const fertilizerModuleValidators: Function[] = [];
export const fertilizerContainerModules: ContainerModule[] = [fertilizerContainerModule, sharedContainerModule];
