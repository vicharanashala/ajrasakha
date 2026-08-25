import {ContainerModule} from 'inversify';
import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';
import {ContextRepository} from '#root/shared/database/providers/mongo/repositories/ContextRepository.js';
import {AnswerRepository} from '#root/shared/database/providers/mongo/repositories/AnswerRepository.js';
import {QuestionSubmissionRepository} from '#root/shared/database/providers/mongo/repositories/SubmissionRepository.js';
import {CommentRepository} from '#root/shared/database/providers/mongo/repositories/CommentRespository.js';
import {CommentController} from '../../modules/comment/controllers/CommentController.js';
import {CommentService} from '../../modules/comment/services/CommentService.js';

import { NotificationRepository } from '#root/shared/database/providers/mongo/repositories/NotificationRepository.js';
import { RequestRepository } from '#root/shared/database/providers/mongo/repositories/RequestRepository.js';
import { ReviewRepository } from '#root/shared/database/providers/mongo/repositories/ReviewRepository.js';
import { AnswerService } from '../answer/services/AnswerService.js';
import { AnswerReviewService } from '../answer/services/AnswerReviewService.js';
import { AnswerApprovalService } from '../answer/services/AnswerApprovalService.js';
import { AnswerSubmissionService } from '../answer/services/AnswerSubmissionService.js';
import { AnswerAiService } from '../answer/services/AnswerAiService.js';
import { AnswerFaqService } from '../answer/services/AnswerFaqService.js';
import { AnswerController } from '../answer/controllers/AnswerController.js';
import {
  QuestionController,
  QuestionIngestionController,
  QuestionAllocationController,
  QuestionFeedbackController,
  QuestionPaeValidationController,
  QuestionReportController,
  QuestionAiController,
  QuestionMaintenanceController,
} from '../question/controllers/index.js';
import { QuestionService } from '../question/services/QuestionService.js';
import { QuestionReportService } from '../question/services/QuestionReportService.js';
import { PaeValidationService } from '../question/services/PaeValidationService.js';
import { FeedbackService } from '../question/services/FeedbackService.js';
import { QuestionAiService } from '../question/services/QuestionAiService.js';
import { DuplicateService } from '../question/services/DuplicateService.js';
import { QueueService } from '../question/services/QueueService.js';
import { RoleAssigneeService } from '../question/services/RoleAssigneeService.js';
import { AllocationService } from '../question/services/AllocationService.js';
import { ModeratorQueueService } from '../question/services/ModeratorQueueService.js';
import { QuestionMaintenanceService } from '../question/services/QuestionMaintenanceService.js';
import { ContextController } from '../context/controllers/ContextController.js';
import { ContextService } from '../context/services/ContextService.js';
import { PerformanceController } from '../performance/controllers/PerformanceController.js';
import { CORE_TYPES } from './types.js';
import { GLOBAL_TYPES } from '../../types.js';
import { PerformanceService } from '../performance/services/PerformanceService.js';
import { RequestController } from '../request/controllers/RequestController.js';
import { RequestService } from '../request/services/RequestService.js';
import { UserRepository } from '#root/shared/database/providers/mongo/repositories/UserRepository.js';
import { DuplicateQuestionRepository } from '#root/shared/database/providers/mongo/repositories/DuplicateQuestionRepository.js';
import { FeedbackRepository } from '#root/shared/database/providers/mongo/repositories/FeedbackRepository.js';
import { AccAgentService } from '../acc-agent/services/AccAgentService.js';
import { CheckOverlapsService } from '../question/services/CheckOverlapsService.js';
export const coreContainerModule = new ContainerModule(options => {
  // Controllers
  options.bind(QuestionReportController).toSelf().inSingletonScope();
  options.bind(QuestionAllocationController).toSelf().inSingletonScope();
  options.bind(QuestionFeedbackController).toSelf().inSingletonScope();
  options.bind(QuestionPaeValidationController).toSelf().inSingletonScope();
  options.bind(QuestionAiController).toSelf().inSingletonScope();
  options.bind(QuestionIngestionController).toSelf().inSingletonScope();
  options.bind(QuestionMaintenanceController).toSelf().inSingletonScope();
  options.bind(QuestionController).toSelf().inSingletonScope();
  options.bind(AnswerController).toSelf().inSingletonScope();
  options.bind(ContextController).toSelf().inSingletonScope();
  options.bind(CommentController).toSelf().inSingletonScope();
  options.bind(RequestController).toSelf().inSingletonScope();
  options.bind(PerformanceController).toSelf().inSingletonScope();
  // Services

  options
    .bind(CORE_TYPES.QuestionService)
    .to(QuestionService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.QuestionReportService)
    .to(QuestionReportService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.PaeValidationService)
    .to(PaeValidationService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.FeedbackService)
    .to(FeedbackService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.QuestionAiService)
    .to(QuestionAiService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.DuplicateService)
    .to(DuplicateService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.QueueService)
    .to(QueueService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.RoleAssigneeService)
    .to(RoleAssigneeService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.AllocationService)
    .to(AllocationService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.ModeratorQueueService)
    .to(ModeratorQueueService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.QuestionMaintenanceService)
    .to(QuestionMaintenanceService)
    .inSingletonScope();
  options.bind(CORE_TYPES.AnswerService).to(AnswerService).inSingletonScope();
  options
    .bind(GLOBAL_TYPES.AnswerReviewService)
    .to(AnswerReviewService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.AnswerApprovalService)
    .to(AnswerApprovalService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.AnswerSubmissionService)
    .to(AnswerSubmissionService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.AnswerAiService)
    .to(AnswerAiService)
    .inSingletonScope();
  options
    .bind(GLOBAL_TYPES.AnswerFaqService)
    .to(AnswerFaqService)
    .inSingletonScope();
  options.bind(CORE_TYPES.ContextService).to(ContextService).inSingletonScope();
  options.bind(CORE_TYPES.CommentService).to(CommentService).inSingletonScope();
  options.bind(CORE_TYPES.RequestService).to(RequestService).inSingletonScope();

  options.bind(CORE_TYPES.PerformanceService).to(PerformanceService).inSingletonScope();
  options.bind(GLOBAL_TYPES.AccAgentService).to(AccAgentService).inSingletonScope();
  options.bind(CORE_TYPES.CheckOverlapsService).to(CheckOverlapsService).inSingletonScope();
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
  options.bind(CORE_TYPES.UserRepository).to(UserRepository).inSingletonScope()
  options.bind(CORE_TYPES.DuplicateQuestionRepository).to(DuplicateQuestionRepository).inSingletonScope()
  options.bind(CORE_TYPES.FeedbackRepository).to(FeedbackRepository).inSingletonScope()
});
