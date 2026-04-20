import {Container, ContainerModule} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {useContainer} from 'class-validator';
import {NotificationController} from './controllers/NotificationController.js';
import {NotificationService} from './services/NotificationService.js';
import {NOTIFICATION_VALIDATORS} from './validators/NotificationValidators.js';
import {CORE_TYPES} from '../core/types.js';

export const notificationContainerModule = new ContainerModule(options => {
  options.bind(NotificationController).toSelf().inSingletonScope();
  options.bind(CORE_TYPES.NotificationService).to(NotificationService).inSingletonScope();
});

export const notificationModuleControllers: Function[] = [NotificationController];
export const notificationModuleValidators: Function[] = [...NOTIFICATION_VALIDATORS];
export const notificationContainerModules: ContainerModule[] = [notificationContainerModule];

export async function setupNotificationContainer(): Promise<void> {
  const container = new Container();
  await container.load(...notificationContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/NotificationController.js';
export * from './services/NotificationService.js';
