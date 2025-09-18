export const CORE_TYPES = {
  // Controllers
  QuestionController: Symbol.for('QuestionController'),
  AnswerController: Symbol.for('AnswerController'),
  ContextController: Symbol.for('ContextController'),

  // Services
  QuestionService: Symbol.for('QuestionService'),
  AnswerService: Symbol.for('AnswerService'),
  ContextService: Symbol.for('ContextService'),
  AIService: Symbol.for('AIService'),

  // Repositories
  QuestionRepository: Symbol.for('QuestionRepository'),
  AnswerRepository: Symbol.for('AnswerRepository'),
  ContextRepository: Symbol.for('ContextRepository'),
};
