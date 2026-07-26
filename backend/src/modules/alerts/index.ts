import {Container, ContainerModule} from 'inversify';
import {useContainer} from 'class-validator';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {AlertController} from './controllers/AlertController.js';
import {alertsContainerModule} from './container.js';

export const alertsModuleControllers: Function[] = [AlertController];
export const alertsModuleValidators: Function[] = [];
export const alertsContainerModules: ContainerModule[] = [alertsContainerModule];

export async function setupAlertsContainer(): Promise<void> {
  const container = new Container();
  await container.load(...alertsContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}
