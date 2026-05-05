import { useContainer } from 'class-validator';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { PlivoController } from './controllers/PlivoController.js';
import { plivoContainerModules } from './container.js';
import { sharedContainerModule } from '#root/container.js';
import { Container } from 'inversify';

export const plivoModuleControllers = [PlivoController];
export const plivoModuleValidators = [];
export { plivoContainerModules };

export async function setupPlivoContainer(): Promise<void> {
  const container = new Container();
  await container.load(...plivoContainerModules, sharedContainerModule);

  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/PlivoController.js';
