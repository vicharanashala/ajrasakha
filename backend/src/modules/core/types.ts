export const CORE_TYPES = {
  // Controllers
  QuestionController: Symbol.for('QuestionController'),
  AnswerController: Symbol.for('AnswerController'),
  ContextController: Symbol.for('ContextController'),
  RequestController: Symbol.for('RequestController'),

  // Services
  UserService: Symbol.for('UserService'),
  QuestionService: Symbol.for('QuestionService'),
  RequestService: Symbol.for('RequestService'),
  AnswerService: Symbol.for('AnswerService'),
  ContextService: Symbol.for('ContextService'),
  CommentService: Symbol.for('CommentService'),
  AIService: Symbol.for('AIService'),
  SarvamService: Symbol.for('SarvamService'),
  NotificationService:Symbol.for('NotificationService'),

  // Repositories
  UserRepository: Symbol.for('UserRepository'),
  CommentRepository: Symbol.for('CommentRepository'),
  QuestionSubmissionRepository: Symbol.for('QuestionSubmissionRepository'),
  QuestionRepository: Symbol.for('QuestionRepository'),
  AnswerRepository: Symbol.for('AnswerRepository'),
  ContextRepository: Symbol.for('ContextRepository'),
  RequestRepository: Symbol.for('RequestRepository'),
  NotificationRepository:Symbol.for('NotificationRepository'),
};
