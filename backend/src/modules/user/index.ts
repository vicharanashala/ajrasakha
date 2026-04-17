import {Container, ContainerModule} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {useContainer} from 'class-validator';
import {UserController} from './controllers/UserController.js';
import {UserService} from './services/UserService.js';
import {USER_VALIDATORS} from './validators/UserValidators.js';
import {CORE_TYPES} from '../core/types.js';

export const userContainerModule = new ContainerModule(options => {
  options.bind(UserController).toSelf().inSingletonScope();
  options.bind(CORE_TYPES.UserService).to(UserService).inSingletonScope();
});

export const userModuleControllers: Function[] = [UserController];
export const userModuleValidators: Function[] = [...USER_VALIDATORS];
export const userContainerModules: ContainerModule[] = [userContainerModule];

export async function setupUserContainer(): Promise<void> {
  const container = new Container();
  await container.load(...userContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/UserController.js';
export * from './services/UserService.js';
