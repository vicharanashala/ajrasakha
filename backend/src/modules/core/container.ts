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
import {CommentRepository} from '#root/shared/database/providers/mongo/repositories/CommentRespository.js';
import {CommentController} from './controllers/CommentController.js';
import {CommentService} from './services/CommentService.js';
import { UserController } from './controllers/UserController.js';
import { UserService } from './services/UserService.js';

export const coreContainerModule = new ContainerModule(options => {
  // Controllers
  options.bind(UserController).toSelf().inSingletonScope();
  options.bind(QuestionController).toSelf().inSingletonScope();
  options.bind(AnswerController).toSelf().inSingletonScope();
  options.bind(ContextController).toSelf().inSingletonScope();
  options.bind(CommentController).toSelf().inSingletonScope();

  // Services
  options
    .bind(CORE_TYPES.UserService) 
    .to(UserService)
    .inSingletonScope();
  options
    .bind(CORE_TYPES.QuestionService) 
    .to(QuestionService)
    .inSingletonScope();
  options.bind(CORE_TYPES.AnswerService).to(AnswerService).inSingletonScope();
  options.bind(CORE_TYPES.ContextService).to(ContextService).inSingletonScope();
  options.bind(CORE_TYPES.CommentService).to(CommentService).inSingletonScope();
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
  options
    .bind(CORE_TYPES.CommentRepository)
    .to(CommentRepository)
    .inSingletonScope();
});
