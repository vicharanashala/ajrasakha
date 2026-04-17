import {Container, ContainerModule} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {useContainer} from 'class-validator';
import {AiService} from './services/AiService.js';
import {CORE_TYPES} from '../core/types.js';

export const aiContainerModule = new ContainerModule(options => {
  options.bind(CORE_TYPES.AIService).to(AiService).inSingletonScope();
});

export const aiModuleControllers: Function[] = [];
export const aiModuleValidators: Function[] = [];
export const aiContainerModules: ContainerModule[] = [aiContainerModule];

export async function setupAiContainer(): Promise<void> {
  const container = new Container();
  await container.load(...aiContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './services/AiService.js';
