import {sharedContainerModule} from '#root/container.js';
import {Container, ContainerModule} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {useContainer} from 'class-validator';

import {rerouteContainerModule} from './container.js';
import {QUESTION_VALIDATORS} from './classes/validators/QuestionValidators.js';
import {ANSWER_VALIDATORS} from './classes/validators/AnswerValidators.js';
import {CONTEXT_VALIDATORS} from './classes/validators/ContextValidators.js';
import {COMMENT_VALIDATORS} from './classes/validators/CommentValidators.js';

import {USER_VALIDATORS} from './classes/validators/UserValidators.js';

import { REQUEST_VALIDATORS } from './classes/validators/RequestValidators.js';

import { NOTIFICATION_VALIDATORS } from './classes/validators/NotificationValidators.js';

import {ReRouteController} from './controllers/ReRouteController.js'

// Export names that loadAppModules expects
export const rerouteModuleControllers: Function[] = [
  
  ReRouteController
];

// Export container modules for loadAppModules
export const rerouteContainerModules: ContainerModule[] = [
  rerouteContainerModule,
  sharedContainerModule,
];

// This sets up Inversify bindings for the anomaly module
export async function setupRerouteContainer(): Promise<void> {
  const container = new Container();
  await container.load(...rerouteContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export const rerouteModuleValidators: Function[] = [
  ...QUESTION_VALIDATORS,
  ...ANSWER_VALIDATORS,
  ...CONTEXT_VALIDATORS,
  ...COMMENT_VALIDATORS,
  ...USER_VALIDATORS,
  ...REQUEST_VALIDATORS,
  ...NOTIFICATION_VALIDATORS,
];

// Export all the main components for external use

export * from './controllers/ReRouteController.js'


export * from './services/ReRouteService.js'

export * from './types.js';
