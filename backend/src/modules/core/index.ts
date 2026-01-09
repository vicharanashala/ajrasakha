import {sharedContainerModule} from '#root/container.js';
import {Container, ContainerModule} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {useContainer} from 'class-validator';
import {coreContainerModule} from './container.js';
import {UserController} from './controllers/UserController.js';
import {USER_VALIDATORS} from './classes/validators/UserValidators.js';
import {RequestController} from './controllers/RequestController.js';
import { REQUEST_VALIDATORS } from './classes/validators/RequestValidators.js';
import { NotificationController } from './controllers/NotificationController.js';
import { NOTIFICATION_VALIDATORS } from './classes/validators/NotificationValidators.js';
import { AnswerController } from '../answer/controllers/AnswerController.js';
import { ANSWER_VALIDATORS } from '../answer/classes/validators/AnswerValidator.js';
import { QuestionController } from '../question/controllers/QuestionController.js';
import { QUESTION_VALIDATORS } from '../question/classes/validators/QuestionVaidators.js';
import { ContextController } from '../../modules/context/controllers/ContextController.js';
import { CONTEXT_VALIDATORS } from '../context/classes/validators/ContextValidator.js';
import { CommentController } from '../comment/controllers/CommentController.js';
import { COMMENT_VALIDATORS } from '../comment/classes/validators/CommentValidator.js';
import { PerformanceController } from '../../modules/performance/controllers/PerformanceController.js';

// Export names that loadAppModules expects
export const coreModuleControllers: Function[] = [
  QuestionController,
  ContextController,
  AnswerController,
  CommentController,
  RequestController,
  UserController,
  NotificationController,
  PerformanceController
];

// Export container modules for loadAppModules
export const coreContainerModules: ContainerModule[] = [
  coreContainerModule,
  sharedContainerModule,
];

// This sets up Inversify bindings for the anomaly module
export async function setupCoreContainer(): Promise<void> {
  const container = new Container();
  await container.load(...coreContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export const coreModuleValidators: Function[] = [
  ...QUESTION_VALIDATORS,
  ...ANSWER_VALIDATORS,
  ...CONTEXT_VALIDATORS,
  ...COMMENT_VALIDATORS,
  ...USER_VALIDATORS,
  ...REQUEST_VALIDATORS,
  ...NOTIFICATION_VALIDATORS,
];

// Export all the main components for external use
export * from '../../modules/question/controllers/QuestionController.js';
export * from '../../modules/answer/controllers/AnswerController.js'
export * from '../../modules/context/controllers/ContextController.js';
export * from '../../modules/comment/controllers/CommentController.js';
export * from './controllers/NotificationController.js'
export * from '../../modules/performance/controllers/PerformanceController.js'

export * from '../../modules/question/services/QuestionService.js';
export * from '../../modules/answer/services/AnswerService.js'
export * from '../../modules/context/services/ContextService.js';
export * from '../../modules/comment/services/CommentService.js';
export * from './services/NotificationService.js'
export * from '../../modules/performance/services/PerformanceService.js'

export * from '../core/types.js';
