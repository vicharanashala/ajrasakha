import {ContainerModule} from 'inversify';
import {sharedContainerModule} from '#root/container.js';
import {chemicalContainerModule} from './container.js';
import {ChemicalController} from './controllers/ChemicalController.js';
import {CHEMICAL_VALIDATORS} from './classes/validators/ChemicalValidators.js';

export const chemicalModuleControllers: Function[] = [ChemicalController];

export const chemicalModuleValidators: Function[] = [...CHEMICAL_VALIDATORS];

export const chemicalContainerModules: ContainerModule[] = [
  chemicalContainerModule,
  sharedContainerModule,
];
