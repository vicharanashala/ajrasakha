import { sharedContainerModule } from '#root/container.js';
import { Container, ContainerModule } from 'inversify';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { useContainer } from 'class-validator';
import { chatbotContainerModule } from './container.js';
import { ChatbotController } from './controllers/ChatbotController.js';

// Controllers to register with routing-controllers
export const chatbotModuleControllers: Function[] = [ChatbotController];

// Container modules
export const chatbotContainerModules: ContainerModule[] = [
  chatbotContainerModule,
  sharedContainerModule,
];

export async function setupChatbotContainer(): Promise<void> {
  const container = new Container();
  await container.load(...chatbotContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/ChatbotController.js';
export * from './services/ChatbotService.js';
export * from './types.js';
