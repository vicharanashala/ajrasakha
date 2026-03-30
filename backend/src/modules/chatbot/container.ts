import { ContainerModule } from 'inversify';
import { CHATBOT_TYPES } from './types.js';
import { ChatbotController } from './controllers/ChatbotController.js';
import { ChatbotService } from './services/ChatbotService.js';
import { ChatbotRepository } from '#root/shared/database/providers/mongo/repositories/ChatbotRepository.js';

export const chatbotContainerModule = new ContainerModule(options => {
  // Controllers
  options.bind(ChatbotController).toSelf().inSingletonScope();

  // Services
  options.bind(CHATBOT_TYPES.ChatbotService).to(ChatbotService).inSingletonScope();

  // Repositories
  options.bind(CHATBOT_TYPES.ChatbotRepository).to(ChatbotRepository).inSingletonScope();
});
