import { sharedContainerModule } from '#root/container.js';
import { Container, ContainerModule } from 'inversify';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { useContainer } from 'class-validator';
import { farmerFeedbackContainerModule } from './container.js';
import { FarmerFeedbackController } from './controllers/FarmerFeedbackController.js';

// Controllers to register with routing-controllers
export const farmerFeedbackModuleControllers: Function[] = [FarmerFeedbackController];

// Container modules
export const farmerFeedbackContainerModules: ContainerModule[] = [
  farmerFeedbackContainerModule,
  sharedContainerModule,
];

export async function setupFarmerFeedbackContainer(): Promise<void> {
  const container = new Container();
  await container.load(...farmerFeedbackContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/FarmerFeedbackController.js';
export * from './services/FarmerFeedbackService.js';
export * from './interfaces/IFarmerFeedbackService.js';
export * from './types.js';
export * from './container.js';
