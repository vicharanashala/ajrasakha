import {ContainerModule} from 'inversify';
import {sharedContainerModule} from '#root/container.js';
import {gdbCleaningContainerModule} from './container.js';
import {GdbCleaningController} from './controllers/GdbCleaningController.js';
import {GDB_CLEANING_VALIDATORS} from './classes/validators/GdbCleaningValidators.js';

export const gdbCleaningModuleControllers: Function[] = [GdbCleaningController];

export const gdbCleaningModuleValidators: Function[] = [
  ...GDB_CLEANING_VALIDATORS,
];

export const gdbCleaningContainerModules: ContainerModule[] = [
  gdbCleaningContainerModule,
  sharedContainerModule,
];
