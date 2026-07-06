export const PLIVO_TYPES = {
  // Controllers
  PlivoController: Symbol.for('PlivoController'),
  FarmerController: Symbol.for('FarmerController'),

  // Services
  PlivoService: Symbol.for('PlivoService'),
  FarmerService: Symbol.for('FarmerService'),
  AgentAssignmentService: Symbol.for('AgentAssignmentService'),

  // Repositories
  CallFarmerRepository: Symbol.for('CallFarmerRepository'),
  CallDetailsRepository: Symbol.for('CallDetailsRepository'),
};
