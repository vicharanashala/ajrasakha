import {Container, ContainerModule} from 'inversify';
import {useContainer} from 'class-validator';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {LocationController} from './controllers/locationController.js';
import {lgdContainerModule} from './container.js';

export const lgdModuleControllers: Function[] = [LocationController];
export const lgdModuleValidators: Function[] = [];
export const lgdContainerModules: ContainerModule[] = [lgdContainerModule];

export async function setupLgdContainer(): Promise<void> {
  const container = new Container();
  await container.load(...lgdContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}
