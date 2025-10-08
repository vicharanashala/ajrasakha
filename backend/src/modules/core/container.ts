import {ContainerModule} from 'inversify';
import {QuestionController} from './controllers/QuestionController.js';
import {CORE_TYPES} from './types.js';
import {QuestionService} from './services/QuestionService.js';
import {AnswerService} from './services/AnswerService.js';
import {AnswerController} from './controllers/AnswerController.js';
import {ContextController} from './controllers/ContextController.js';
import {ContextService} from './services/ContextService.js';
import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';
import {ContextRepository} from '#root/shared/database/providers/mongo/repositories/ContextRepository.js';
import {AnswerRepository} from '#root/shared/database/providers/mongo/repositories/AnswerRepository.js';
import {AiService} from './services/AiService.js';
import {QuestionSubmissionRepository} from '#root/shared/database/providers/mongo/repositories/SubmissionRepository.js';

export const coreContainerModule = new ContainerModule(options => {
  // Controllers
  options.bind(QuestionController).toSelf().inSingletonScope();
  options.bind(AnswerController).toSelf().inSingletonScope();
  options.bind(ContextController).toSelf().inSingletonScope();

  // Services
  options
    .bind(CORE_TYPES.QuestionService)
    .to(QuestionService)
    .inSingletonScope();
  options.bind(CORE_TYPES.AnswerService).to(AnswerService).inSingletonScope();
  options.bind(CORE_TYPES.ContextService).to(ContextService).inSingletonScope();
  options.bind(CORE_TYPES.AIService).to(AiService).inSingletonScope();

  // Repositories
  options
    .bind(CORE_TYPES.QuestionSubmissionRepository)
    .to(QuestionSubmissionRepository)
    .inSingletonScope();
  options
    .bind(CORE_TYPES.QuestionRepository)
    .to(QuestionRepository)
    .inSingletonScope();
  options
    .bind(CORE_TYPES.AnswerRepository)
    .to(AnswerRepository)
    .inSingletonScope();
  options
    .bind(CORE_TYPES.ContextRepository)
    .to(ContextRepository)
    .inSingletonScope();
});
