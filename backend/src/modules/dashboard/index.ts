import {Container, ContainerModule} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {useContainer} from 'class-validator';
import {PublicDashboardController} from './controllers/PublicDashboardController.js';
import {PublicDashboardService} from './services/PublicDashboardService.js';
// Note: Dashboard doesn't have a dedicated performance service — PerformanceController
// stays in the performance module. The public dashboard endpoints live here and are
// fully self-contained (service + repository own their own DB access).

export const dashboardContainerModule = new ContainerModule(options => {
  options.bind(PublicDashboardService).toSelf().inSingletonScope();
  options.bind(PublicDashboardController).toSelf().inSingletonScope();
});

export const dashboardModuleControllers: Function[] = [PublicDashboardController];
export const dashboardModuleValidators: Function[] = [];
export const dashboardContainerModules: ContainerModule[] = [dashboardContainerModule];

export async function setupDashboardContainer(): Promise<void> {
  const container = new Container();
  await container.load(...dashboardContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}
