import { UserController } from './controllers/UserController.js';
import { UserService } from './services/UserService.js';

export const userModuleControllers = [UserController];
export const userModuleValidators = [];

export * from './controllers/UserController.js';
export * from './services/UserService.js';
