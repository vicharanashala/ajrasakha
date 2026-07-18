import { ContainerModule } from 'inversify';
import { feedbackContainerModule } from './container.js';
import { FarmerFeedbackController } from './controllers/FarmerFeedbackController.js';

export const feedbackModuleControllers: Function[] = [FarmerFeedbackController];
export const feedbackContainerModules: ContainerModule[] = [feedbackContainerModule];

import { Container } from 'inversify';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { useContainer } from 'class-validator';

export async function setupFeedbackContainer(): Promise<void> {
  const container = new Container();
  await container.load(...feedbackContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './interfaces/index.js';
export * from './models/FarmerFeedbackModel.js';
export * from './services/FarmerFeedbackService.js';
export * from './controllers/FarmerFeedbackController.js';
