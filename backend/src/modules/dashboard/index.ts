import {Container, ContainerModule} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {useContainer} from 'class-validator';
// Note: Dashboard doesn't seem to have a dedicated controller/service yet, only validators
// Let's assume PerformanceController is going to stay in performance module for now

export const dashboardContainerModule = new ContainerModule(options => {});

export const dashboardModuleControllers: Function[] = [];
export const dashboardModuleValidators: Function[] = []; // Not exported as an array like others originally
export const dashboardContainerModules: ContainerModule[] = [dashboardContainerModule];

export async function setupDashboardContainer(): Promise<void> {
  const container = new Container();
  await container.load(...dashboardContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}
