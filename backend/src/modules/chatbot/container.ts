import { ContainerModule } from 'inversify';
import { CHATBOT_TYPES } from './types.js';
import { ChatbotAnalyticsController } from './controllers/ChatbotAnalyticsController.js';
import { ChatbotUserManagementController } from './controllers/ChatbotUserManagementController.js';
import { ChatbotMetricsController } from './controllers/ChatbotMetricsController.js';
import { ChatbotService } from './services/ChatbotService.js';
import { ChatbotRepository } from '#root/shared/database/providers/mongo/repositories/ChatbotRepository.js';

export const chatbotContainerModule = new ContainerModule(options => {
  // Controllers
  options.bind(ChatbotAnalyticsController).toSelf().inSingletonScope();
  options.bind(ChatbotUserManagementController).toSelf().inSingletonScope();
  options.bind(ChatbotMetricsController).toSelf().inSingletonScope();

  // Services
  options.bind(CHATBOT_TYPES.ChatbotService).to(ChatbotService).inSingletonScope();

  // Repositories
  options.bind(CHATBOT_TYPES.ChatbotRepository).to(ChatbotRepository).inSingletonScope();
});
