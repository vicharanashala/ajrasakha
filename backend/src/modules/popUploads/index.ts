import {Container, ContainerModule} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {useContainer} from 'class-validator';
import {PopUploadsController} from './controllers/PopUploadsController.js';
import {PopUploadsService} from './services/PopUploadsService.js';
import {CORE_TYPES} from '../core/types.js';

export const popUploadsContainerModule = new ContainerModule(options => {
  options.bind(PopUploadsController).toSelf().inSingletonScope();
  options.bind(CORE_TYPES.PopUploadsService).to(PopUploadsService).inSingletonScope();
});

export const popUploadsModuleControllers: Function[] = [PopUploadsController];
export const popUploadsModuleValidators: Function[] = [];
export const popUploadsContainerModules: ContainerModule[] = [popUploadsContainerModule];

export async function setupPopUploadsContainer(): Promise<void> {
  const container = new Container();
  await container.load(...popUploadsContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/PopUploadsController.js';
export * from './services/PopUploadsService.js';
