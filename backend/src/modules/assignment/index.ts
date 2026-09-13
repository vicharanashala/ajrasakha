import 'reflect-metadata';
import { Container, ContainerModule } from 'inversify';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { useContainer } from 'routing-controllers';

import { AssignmentController } from './controllers/AssignmentController.js';
import { AssignmentService } from './services/AssignmentService.js';
import { DashboardService } from './services/DashboardService.js';
import { ExpertCapacityService } from './capacity.js';
import { FreezeService } from './freeze.js';
import { QueueService } from './queue.js';
import { AssignmentEngine } from './engine.js';
import { MongoAssignmentRepository } from './repository/MongoAssignmentRepository.js';
import { AssignmentSocketHandler } from './sockets/AssignmentSocketHandler.js';
import { GLOBAL_TYPES } from '#root/types.js';

// ── Container Module ─────────────────────────────────────────────────────────

export const assignmentContainerModule = new ContainerModule(options => {
  // Repository
  options
    .bind('AssignmentRepository')
    .to(MongoAssignmentRepository)
    .inRequestScope();

  // Core services (singleton within request)
  options.bind(ExpertCapacityService).toSelf().inRequestScope();
  options.bind(FreezeService).toSelf().inRequestScope();
  options.bind(QueueService).toSelf().inRequestScope();
  options.bind(AssignmentEngine).toSelf().inRequestScope();

  // Orchestration services
  options.bind(AssignmentService).toSelf().inRequestScope();
  options.bind(DashboardService).toSelf().inRequestScope();

  // Socket handler (singleton — lives for the server lifetime)
  options.bind(AssignmentSocketHandler).toSelf().inSingletonScope();

  // Controller
  options.bind(AssignmentController).toSelf().inRequestScope();
});

// ── Module exports for auto-discovery ───────────────────────────────────────

export const assignmentModuleControllers = [AssignmentController];
export const assignmentModuleValidators: Function[] = [];
export const assignmentContainerModules: ContainerModule[] = [
  assignmentContainerModule,
];

export async function setupAssignmentContainer(): Promise<void> {
  const container = new Container();
  await container.load(...assignmentContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}