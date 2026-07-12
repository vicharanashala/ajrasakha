import { Container, ContainerModule } from 'inversify';
import { useContainer } from 'class-validator';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { SoilHealthController } from './SoilHealthController.js';
import { soilHealthContainerModule } from './container.js';

export const soilHealthModuleControllers: Function[] = [SoilHealthController];
export const soilHealthModuleValidators: Function[] = [];
export const soilHealthContainerModules: ContainerModule[] = [soilHealthContainerModule];

export async function setupSoilHealthContainer(): Promise<void> {
  const container = new Container();
  await container.load(soilHealthContainerModule);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}
