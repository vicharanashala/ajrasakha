const TYPES = {
  // Database
  Database: Symbol.for('Database'),

  // Services
  UserService: Symbol.for('UserService'),
  AccAgentService: Symbol.for('AccAgentService'),
  WeatherService: Symbol.for('WeatherService'),
  AnaraService: Symbol.for('AnaraService'),

  // Repositories
  UserRepository: Symbol.for('userRepository'),
  PlivoCredentialsRepository: Symbol.for('PlivoCredentialsRepository'),

  // Constants
  uri: Symbol.for('dbURI'),
  dbName: Symbol.for('dbName'),
};

export { TYPES as GLOBAL_TYPES };
