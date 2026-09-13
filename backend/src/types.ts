const TYPES = {
  // Database
  Database: Symbol.for('Database'),

  // Controllers
  QuestionController: Symbol.for('QuestionController'),
  AnswerController: Symbol.for('AnswerController'),
  ContextController: Symbol.for('ContextController'),
  RequestController: Symbol.for('RequestController'),
  ReRouteController:Symbol.for('ReRouteController'),
  ChemicalController: Symbol.for('ChemicalController'),
  SavedAnswerController: Symbol.for('SavedAnswerController'),
    

  // Services
  UserService: Symbol.for('UserService'),
  QuestionService: Symbol.for('QuestionService'),
  QuestionReportService: Symbol.for('QuestionReportService'),
  PaeValidationService: Symbol.for('PaeValidationService'),
  FeedbackService: Symbol.for('FeedbackService'),
  QuestionAiService: Symbol.for('QuestionAiService'),
  DuplicateService: Symbol.for('DuplicateService'),
  QueueService: Symbol.for('QueueService'),
  RoleAssigneeService: Symbol.for('RoleAssigneeService'),
  AllocationService: Symbol.for('AllocationService'),
  ModeratorQueueService: Symbol.for('ModeratorQueueService'),
  QuestionMaintenanceService: Symbol.for('QuestionMaintenanceService'),
  AnswerService: Symbol.for('AnswerService'),
  AnswerReviewService: Symbol.for('AnswerReviewService'),
  AnswerApprovalService: Symbol.for('AnswerApprovalService'),
  AnswerSubmissionService: Symbol.for('AnswerSubmissionService'),
  AnswerAiService: Symbol.for('AnswerAiService'),
  AnswerFaqService: Symbol.for('AnswerFaqService'),
  ContextService: Symbol.for('ContextService'),
  CommentService: Symbol.for('CommentService'),
  RequestService: Symbol.for('RequestService'),
  SarvamService: Symbol.for('SarvamService'),
  NotificationService: Symbol.for('NotificationService'),
  PerformanceService: Symbol.for('PerformanceService'),
  ReRouteService:Symbol.for('ReRouteService'),
  AccAgentService: Symbol.for('AccAgentService'),

  // Repositories
  RequestRepository: Symbol.for('RequestRepository'),
  QuestionRepository: Symbol.for('QuestionRepository'),
  QuestionSubmissionRepository: Symbol.for('QuestionSubmissionRepository'),
  AnswerRepository: Symbol.for('AnswerRepository'),
  ContextRepository: Symbol.for('ContextRepository'),
  UserRepository: Symbol.for('userRepository'),
  NotificationRepository: Symbol.for('NotificationRepository'),
  ReviewRepository: Symbol.for('ReviewRepository'),
  ReRouteRepository:Symbol.for("ReRouteRepository"),
  DuplicateQuestionRepository:Symbol.for("DuplicateQuestionRepository"),
  ChatbotRepository: Symbol.for('ChatbotRepository'),
  CropRepository: Symbol.for('CropRepository'),
  ChemicalRepository: Symbol.for('ChemicalRepository'),
  MongoDatabase: Symbol.for('MongoDatabase'),
  SavedAnswerRepository: Symbol.for('SavedAnswerRepository'),
  CropService: Symbol.for('CropService'),
  ChemicalService: Symbol.for('ChemicalService'),

  // Constants
  uri: Symbol.for('dbURI'),
  dbName: Symbol.for('dbName'),

  analyticsUri: Symbol.for('analyticsDbURI'),
  analyticsDbName: Symbol.for('analyticsDbName'),
  analyticsDatabase: Symbol.for('AnalyticsDatabase'),

  annamanalyticsUri: Symbol.for('annamanalyticsDbURI'),
  annamanalyticsDbName: Symbol.for('annamanalyticsDbName'),
  annamanalyticsDatabase: Symbol.for('annamAnalyticsDatabase'),
};

export {TYPES as GLOBAL_TYPES};