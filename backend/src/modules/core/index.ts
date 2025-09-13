import {sharedContainerModule} from '#root/container.js';
import {Container, ContainerModule} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {useContainer} from 'class-validator';
import {QuestionController} from './controllers/QuestionController.js';
import {ContextController} from './controllers/ContextController.js';
import {AnswerController} from './controllers/AnswerController.js';
import {coreContainerModule} from './container.js';
import {QUESTION_VALIDATORS} from './classes/validators/QuestionValidators.js';
import {ANSWER_VALIDATORS} from './classes/validators/AnswerValidators.js';
import {CONTEXT_VALIDATORS} from './classes/validators/ContextValidators.js';

// Export names that loadAppModules expects
export const coreModuleControllers: Function[] = [
  QuestionController,
  ContextController,
  AnswerController,
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
];

// Export all the main components for external use
export * from './controllers/QuestionController.js';
export * from './controllers/AnswerController.js';
export * from './controllers/ContextController.js';

export * from './services/QuestionService.js';
export * from './services/AnswerService.js';
export * from './services/ContextService.js';

export * from './types.js';
