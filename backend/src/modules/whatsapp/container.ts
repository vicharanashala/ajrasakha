import { ContainerModule } from 'inversify';
import { WHATSAPP_TYPES } from './types.js';
import { WhatsAppController } from './controllers/WhatsAppController.js';
import { WhatsAppService } from './services/WhatsAppService.js';

export const whatsappContainerModule = new ContainerModule(options => {
  // Controllers
  options.bind(WhatsAppController).toSelf().inSingletonScope();

  // Services
  options.bind(WHATSAPP_TYPES.WhatsAppService).to(WhatsAppService).inSingletonScope();
});
