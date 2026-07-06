const TYPES = {
  // Database
  Database: Symbol.for('Database'),

  // Services
  UserService: Symbol.for('UserService'),
  AccAgentService: Symbol.for('AccAgentService'),

  // Repositories
  UserRepository: Symbol.for('userRepository'),

  // Constants
  uri: Symbol.for('dbURI'),
  dbName: Symbol.for('dbName'),
};

export { TYPES as GLOBAL_TYPES };
