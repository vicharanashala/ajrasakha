import {ContainerModule} from 'inversify';
import {verificationContainerModule} from './container.js';
import {VerificationController} from './controllers/VerificationController.js';
import {VerificationValidators} from './classes/validators/index.js';

export const verificationModuleControllers: Function[] = [VerificationController];

export const verificationModuleValidators: Function[] = [...VerificationValidators];

export const verificationContainerModules: ContainerModule[] = [
  verificationContainerModule,
];
