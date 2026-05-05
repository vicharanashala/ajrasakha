import { sharedContainerModule } from '#root/container.js';
import { Container, ContainerModule } from 'inversify';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { useContainer } from 'class-validator';
import { whatsappContainerModule } from './container.js';
import { WhatsAppController } from './controllers/WhatsAppController.js';

// Controllers to register with routing-controllers
export const whatsappModuleControllers: Function[] = [WhatsAppController];

// Container modules
export const whatsappContainerModules: ContainerModule[] = [
  whatsappContainerModule,
  sharedContainerModule,
];

export async function setupWhatsappContainer(): Promise<void> {
  const container = new Container();
  await container.load(...whatsappContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/WhatsAppController.js';
export * from './services/WhatsAppService.js';
export * from './types.js';
