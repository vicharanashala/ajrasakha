import {Container, ContainerModule} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {useContainer} from 'class-validator';
import {UserProfileController} from './controllers/UserProfileController.js';
import {UserManagementController} from './controllers/UserManagementController.js';
import {UserService} from './services/UserService.js';
import {USER_VALIDATORS} from './validators/UserValidators.js';
import {CORE_TYPES} from '../core/types.js';

export const userContainerModule = new ContainerModule(options => {
  options.bind(UserProfileController).toSelf().inSingletonScope();
  options.bind(UserManagementController).toSelf().inSingletonScope();
  options.bind(CORE_TYPES.UserService).to(UserService).inSingletonScope();
});

export const userModuleControllers: Function[] = [UserProfileController, UserManagementController];
export const userModuleValidators: Function[] = [...USER_VALIDATORS];
export const userContainerModules: ContainerModule[] = [userContainerModule];

export async function setupUserContainer(): Promise<void> {
  const container = new Container();
  await container.load(...userContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/UserProfileController.js';
export * from './controllers/UserManagementController.js';
export * from './services/UserService.js';
