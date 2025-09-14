const TYPES = {
  // Database
  Database: Symbol.for('Database'),

  // Controllers
  QuestionController: Symbol.for('QuestionController'),
  AnswerController: Symbol.for('AnswerController'),
  ContextController: Symbol.for('ContextController'),

  // Services
  QuestionService: Symbol.for('QuestionService'),
  AnswerService: Symbol.for('AnswerService'),
  ContextService: Symbol.for('ContextService'),

  // Repositories
  QuestionRepository: Symbol.for('QuestionRepository'),
  AnswerRepository: Symbol.for('AnswerRepository'),
  ContextRepository: Symbol.for('ContextRepository'),
  UserRepository: Symbol.for('userRepository'),

  // Constants
  uri: Symbol.for('dbURI'),
  dbName: Symbol.for('dbName'),
};

export {TYPES as GLOBAL_TYPES};
