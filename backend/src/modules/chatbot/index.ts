import { sharedContainerModule } from '#root/container.js';
import { Container, ContainerModule } from 'inversify';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { useContainer } from 'class-validator';
import { chatbotContainerModule } from './container.js';
import { ChatbotAnalyticsController } from './controllers/ChatbotAnalyticsController.js';
import { ChatbotUserManagementController } from './controllers/ChatbotUserManagementController.js';
import { ChatbotMetricsController } from './controllers/ChatbotMetricsController.js';

// Controllers to register with routing-controllers
export const chatbotModuleControllers: Function[] = [
  ChatbotAnalyticsController,
  ChatbotUserManagementController,
  ChatbotMetricsController,
];

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

export * from './controllers/ChatbotAnalyticsController.js';
export * from './controllers/ChatbotUserManagementController.js';
export * from './controllers/ChatbotMetricsController.js';
export * from './services/ChatbotService.js';
export * from './types.js';
