import type {RoleAssigneeService} from '../services/RoleAssigneeService.js';

/**
 * Public surface of {@link RoleAssigneeService}, derived from the class. QuestionService
 * injects this and delegates the moderator / gate-keeper / auditor assignment methods.
 */
export type IRoleAssigneeService = Pick<
  RoleAssigneeService,
  | 'changeQuestionModerator'
  | 'removeQuestionModerator'
  | 'getRoleAssigneeDashboard'
  | 'changeQuestionRoleAssignee'
  | 'removeQuestionRoleAssignee'
  | 'runGateKeeperAuditorQueueCron'
  | 'freeRoleAssigneeOnStatusChange'
>;
