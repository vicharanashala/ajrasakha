import {Container, ContainerModule} from 'inversify';
import {useContainer} from 'class-validator';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {SchemeController} from './controllers/SchemeController.js';
import {schemesContainerModule} from './container.js';

export const schemesModuleControllers: Function[] = [SchemeController];
export const schemesModuleValidators: Function[] = [];
export const schemesContainerModules: ContainerModule[] = [schemesContainerModule];

export async function setupSchemesContainer(): Promise<void> {
  const container = new Container();
  await container.load(...schemesContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}
