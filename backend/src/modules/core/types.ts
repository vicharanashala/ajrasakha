export const CORE_TYPES = {
  // Controllers
  QuestionController: Symbol.for('QuestionController'),
  AnswerController: Symbol.for('AnswerController'),
  ContextController: Symbol.for('ContextController'),
  RequestController: Symbol.for('RequestController'),
  TestersDashboardController: Symbol.for('TestersDashboardController'),
  ZohoTicketStatusController: Symbol.for('ZohoTicketStatusController'),

  // Services
  UserService: Symbol.for('UserService'),
  QuestionService: Symbol.for('QuestionService'),
  RequestService: Symbol.for('RequestService'),
  AnswerService: Symbol.for('AnswerService'),
  AnswerReviewService: Symbol.for('AnswerReviewService'),
  AnswerApprovalService: Symbol.for('AnswerApprovalService'),
  AnswerSubmissionService: Symbol.for('AnswerSubmissionService'),
  AnswerAiService: Symbol.for('AnswerAiService'),
  AnswerFaqService: Symbol.for('AnswerFaqService'),
  ContextService: Symbol.for('ContextService'),
  CommentService: Symbol.for('CommentService'),
  AIService: Symbol.for('AIService'),
  SarvamService: Symbol.for('SarvamService'),
  NotificationService:Symbol.for('NotificationService'),
  PerformanceService:Symbol.for('PerformanceService'),
  TestersDashboardService: Symbol.for('TestersDashboardService'),
  ZohoTicketStatusService: Symbol.for('ZohoTicketStatusService'),

  // Repositories
  UserRepository: Symbol.for('UserRepository'),
  CommentRepository: Symbol.for('CommentRepository'),
  QuestionSubmissionRepository: Symbol.for('QuestionSubmissionRepository'),
  QuestionRepository: Symbol.for('QuestionRepository'),
  AnswerRepository: Symbol.for('AnswerRepository'),
  ContextRepository: Symbol.for('ContextRepository'),
  RequestRepository: Symbol.for('RequestRepository'),
  NotificationRepository:Symbol.for('NotificationRepository'),
  ReviewRepository:Symbol.for('ReviewRepository'),
  DuplicateQuestionRepository:Symbol.for("DuplicateQuestionRepository"),
  FeedbackRepository: Symbol.for('FeedbackRepository'),
  CheckOverlapsService: Symbol.for('CheckOverlapsService'),

};
