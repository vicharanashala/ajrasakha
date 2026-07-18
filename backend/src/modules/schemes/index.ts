import {sharedContainerModule} from '#root/container.js';
import {schemesContainerModule} from './container.js';
import {SchemeController} from './controllers/SchemeController.js';

export const schemesModuleControllers: Function[] = [SchemeController];
export const schemesModuleValidators: Function[] = [];
export const schemesContainerModules = [schemesContainerModule, sharedContainerModule];
