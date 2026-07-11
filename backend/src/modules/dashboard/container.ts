import { ContainerModule } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { DashboardContentController } from './controllers/DashboardContentController.js';
import { DashboardContentService } from './services/DashboardContentService.js';
import { DashboardContentRepository } from '#root/shared/database/providers/mongo/repositories/DashboardContentRepository.js';

export const dashboardContainerModule = new ContainerModule(options => {
  options.bind(DashboardContentController).toSelf().inSingletonScope();
  options.bind(GLOBAL_TYPES.DashboardContentService).to(DashboardContentService).inSingletonScope();
  options.bind(GLOBAL_TYPES.DashboardContentRepository).to(DashboardContentRepository).inSingletonScope();
});
