import { Container, ContainerModule } from 'inversify';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { useContainer } from 'class-validator';
import { sharedContainerModule } from '#root/container.js';
import { mediaContainerModule } from './container.js';
import { MEDIA_VALIDATORS } from './classes/validators/MediaValidators.js';

// Names loadAppModules expects (see bootstrap/loadModules.ts).
// No controllers: the media routes are served by DashboardContentController — this module
// only contributes the MediaService/MediaRepository bindings and its request validators.
export const mediaModuleControllers: Function[] = [];
export const mediaModuleValidators: Function[] = [...MEDIA_VALIDATORS];
export const mediaContainerModules: ContainerModule[] = [
  mediaContainerModule,
  sharedContainerModule,
];

export async function setupMediaContainer(): Promise<void> {
  const container = new Container();
  await container.load(...mediaContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}
