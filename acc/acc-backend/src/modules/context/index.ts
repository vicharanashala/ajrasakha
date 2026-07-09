import { useContainer } from 'class-validator';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { ContextController } from './controllers/ContextController.js';
import { ContextService } from './services/ContextService.js';
import { Container, ContainerModule } from 'inversify';

export const contextModuleControllers = [ContextController];
export const contextModuleValidators = [];

export const contextContainerModules = [
  new ContainerModule(options => {
    options.bind(ContextController).toSelf().inSingletonScope();
    options.bind(Symbol.for('ContextService')).to(ContextService).inSingletonScope();
  }),
];

export async function setupContextContainer(): Promise<void> {
  const container = new Container();
  await container.load(...contextContainerModules);

  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/ContextController.js';
export * from './services/ContextService.js';
