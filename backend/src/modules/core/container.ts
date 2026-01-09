import {ContainerModule} from 'inversify';
import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';
import {ContextRepository} from '#root/shared/database/providers/mongo/repositories/ContextRepository.js';
import {AnswerRepository} from '#root/shared/database/providers/mongo/repositories/AnswerRepository.js';
import {AiService} from './services/AiService.js';
import {QuestionSubmissionRepository} from '#root/shared/database/providers/mongo/repositories/SubmissionRepository.js';
import {CommentRepository} from '#root/shared/database/providers/mongo/repositories/CommentRespository.js';
import {CommentController} from '../../modules/comment/controllers/CommentController.js';
import {CommentService} from '../../modules/comment/services/CommentService.js';
import { UserController } from './controllers/UserController.js';
import { UserService } from './services/UserService.js';
import { RequestController } from './controllers/RequestController.js';
import { RequestService } from './services/RequestService.js';
import { RequestRepository } from '#root/shared/database/providers/mongo/repositories/RequestRepository.js';
import { NotificationController } from './controllers/NotificationController.js';
import { NotificationService } from './services/NotificationService.js';
import { NotificationRepository } from '#root/shared/database/providers/mongo/repositories/NotificationRepository.js';
import { ReviewRepository } from '#root/shared/database/providers/mongo/repositories/ReviewRepository.js';
import { AnswerService } from '../answer/services/AnswerService.js';
import { AnswerController } from '../answer/controllers/AnswerController.js';
import { QuestionController } from '../question/controllers/QuestionController.js';
import { QuestionService } from '../question/services/QuestionService.js';
import { ContextController } from '../context/controllers/ContextController.js';
import { ContextService } from '../context/services/ContextService.js';
import { PerformanceController } from '../performance/controllers/PerformanceController.js';
import { CORE_TYPES } from './types.js';
import { PerformanceService } from '../performance/services/PerformanceService.js';

export const coreContainerModule = new ContainerModule(options => {
  // Controllers
  options.bind(UserController).toSelf().inSingletonScope();
  options.bind(QuestionController).toSelf().inSingletonScope();
  options.bind(AnswerController).toSelf().inSingletonScope();
  options.bind(ContextController).toSelf().inSingletonScope();
  options.bind(CommentController).toSelf().inSingletonScope();
  options.bind(RequestController).toSelf().inSingletonScope();
  options.bind(NotificationController).toSelf().inSingletonScope()
  options.bind(PerformanceController).toSelf().inSingletonScope()
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
  options.bind(CORE_TYPES.RequestService).to(RequestService).inSingletonScope();
  options.bind(CORE_TYPES.AIService).to(AiService).inSingletonScope();
  options.bind(CORE_TYPES.NotificationService).to(NotificationService).inSingletonScope()
  options.bind(CORE_TYPES.PerformanceService).to(PerformanceService).inSingletonScope()
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
  options
    .bind(CORE_TYPES.RequestRepository)
    .to(RequestRepository)
    .inSingletonScope();
  options.bind(CORE_TYPES.NotificationRepository).to(NotificationRepository).inSingletonScope()
  
  options.bind(CORE_TYPES.ReviewRepository).to(ReviewRepository).inSingletonScope()
});
