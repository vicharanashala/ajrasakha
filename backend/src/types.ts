const TYPES = {
  // Database
  Database: Symbol.for('Database'),

  // Controllers
  QuestionController: Symbol.for('QuestionController'),
  AnswerController: Symbol.for('AnswerController'),
  ContextController: Symbol.for('ContextController'),
  RequestController: Symbol.for('RequestController'),
  ReRouteController:Symbol.for('ReRouteController'),

  // Services
  UserService: Symbol.for('UserService'),
  QuestionService: Symbol.for('QuestionService'),
  AnswerService: Symbol.for('AnswerService'),
  ContextService: Symbol.for('ContextService'),
  CommentService: Symbol.for('CommentService'),
  RequestService: Symbol.for('RequestService'),
  SarvamService: Symbol.for('SarvamService'),
  NotificationService: Symbol.for('NotificationService'),
  PerformanceService: Symbol.for('PerformanceService'),
  ReRouteService:Symbol.for('ReRouteService'),

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

  // Constants
  uri: Symbol.for('dbURI'),
  dbName: Symbol.for('dbName'),

  analyticsUri: Symbol.for('analyticsDbURI'),
  analyticsDbName: Symbol.for('analyticsDbName'),
  analyticsDatabase: Symbol.for('AnalyticsDatabase'),
};

export {TYPES as GLOBAL_TYPES};
