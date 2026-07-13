import { Container, ContainerModule } from 'inversify';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { useContainer } from 'class-validator';
import { sharedContainerModule } from '#root/container.js';
import { dashboardContainerModule } from './container.js';
import { DashboardContentController } from './controllers/DashboardContentController.js';
import { DASHBOARD_CONTENT_VALIDATORS } from './validators/DashboardContentValidators.js';

// Names loadAppModules expects (see bootstrap/loadModules.ts).
// One controller serves every dashboard route — public reads and admin writes alike.
export const dashboardModuleControllers: Function[] = [DashboardContentController];
export const dashboardModuleValidators: Function[] = [...DASHBOARD_CONTENT_VALIDATORS];
export const dashboardContainerModules: ContainerModule[] = [
  dashboardContainerModule,
  sharedContainerModule,
];

export async function setupDashboardContainer(): Promise<void> {
  const container = new Container();
  await container.load(...dashboardContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}
