import {
  ExpertPerformance,
  ModeratorApprovalRate,
  UserRoleOverview,
} from '#root/modules/dashboard/validators/DashboardValidators.js';
import { PreferenceDto } from '#root/modules/user/validators/UserValidators.js';
import { IUser, UserRole, NotificationRetentionType, QuestionStatus, QuestionSource } from '#shared/interfaces/models.js';
import { MongoClient, ClientSession, ObjectId } from 'mongodb';

/**
 * Interface representing a repository for user-related operations.
 */
export interface IUserRepository {
  /**
   * Get the Client of the Repository.
   * @returns A promise that resolves when the initialization is complete.
   */
  getDBClient(): Promise<MongoClient>;
  /**
   * Creates a new user.
   * @param user - The user to create.
   * @returns A promise that resolves to the created user.
   */
  create(user: IUser, session?: ClientSession): Promise<string>;

  /**
   * Finds a user by their email.
   * @param email - The email of the user to find.
   * @returns A promise that resolves to the user if found, or null if not found.
   */
  findByEmail(email: string, session?: ClientSession): Promise<IUser | null>;

  /**
   * Adds a role to a user.
   * @param userId - The ID of the user to add the role to.
   * @param role - The role to add.
   * @returns A promise that resolves to the updated user if successful, or null if not.
   */
  makeAdmin(userId: string, session: ClientSession): Promise<void>;

  /**
   * Updates the password of a user.
   * @param userId - The ID of the user to update the password for.
   * @param password - The new password.
   * @returns A promise that resolves to the updated user if successful, or null if not.
   */
  updatePassword(userId: string, password: string): Promise<IUser | null>;

  /**
   * Finds a user by their Firebase UID.
   * @param firebaseUID - The Firebase UID of the user to find.
   * @returns A promise that resolves to the user if found, or null if not found.
   */
  findByFirebaseUID(
    firebaseUID: string,
    session?: ClientSession,
  ): Promise<IUser | null>;

  /**
   * Finds a user by their ID.
   * @param id - The ID of the user to find.
   * @param session - The session for transaction.
   * @returns A promise that resolves to the user if found, or null if not found.
   */
  findById(
    id: string | ObjectId,
    session?: ClientSession,
  ): Promise<IUser | null>;

  /**
   * Finds a user by their ID.
   * @param details - preference details.
   * @param session - The session for transaction.
   * @returns A promise that resolves to the users.
   */
  findExpertsByPreference(
    details: PreferenceDto,
    session?: ClientSession,
  ): Promise<IUser[]>;
  getSpecialTaskForceExperts(
    details: PreferenceDto,
    session?: ClientSession,
  ): Promise<IUser[]>;
  getExpertsWithFallback(
    details: PreferenceDto,
    session?: ClientSession,
  ): Promise<IUser[]>;

  getSpecialTaskForceModerators(
    session?: ClientSession,
  ): Promise<IUser[]>;

  findActiveLowReputationExpertsToday(
    session?: ClientSession,
  ): Promise<IUser[]>;

  /** Returns all non-blocked experts sorted by reputation_score ascending (lowest workload first). */
  findExpertsByReputationScore(
    details: PreferenceDto,
    session?: ClientSession,
    limit?: number,
  ): Promise<IUser[]>;

  /**
   * Creates a User Anomaly Document to the database.
   * @param anamoly - The anomaly document to create.
   */

  // createUserAnomaly(
  //   anamoly: IUserAnomaly,
  //   session?: ClientSession,
  // ): Promise<IUserAnomaly | null>;
  edit(
    userId: string,
    userData: Partial<IUser>,
    session?: ClientSession,
  ): Promise<IUser>;

  /**
   * Finds multiple users by their IDs.
   * @param ids - Array of user IDs to find.
   * @returns A promise that resolves to an array of users.
   */
  getUsersByIds(ids: string[], session?: ClientSession): Promise<IUser[]>;
  /**
   * Finds all users.
   * @returns A promise that resolves to an array of users.
   */
  findAll(session?: ClientSession): Promise<IUser[]>;

  /**
   * Finds all users.
   * @param userId -  user IDs to find.
   * @param newScore -  New score.
   * @returns A promise that resolves to an array of users.
   */

  findAllUsers(
    page: number,
    limit: number,
    search: string,
    sortOption: string,
    filter: string,
    role?: string,
    isBlocked?: boolean,
    isVerified?: boolean,
    isSTF?: boolean,
    session?: ClientSession,
  ): Promise<{
    users: IUser[];
    totalUsers: number;
    totalPages: number;
  }>;

  /**
 * Finds all users with pagination, search, sorting and filtering (Admin).
 * @param page - page number
 * @param limit - documents per page
 * @param search - search query
 * @param sort - sorting option
 * @param filter - filter option
 * @param session - MongoDB session
 * @returns paginated users list
 */


  updateReputationScore(
    userId: string,
    isIncrement: boolean,
    session?: ClientSession,
  ): Promise<void>;
  recalculateReputationScore(
    userId: string,
    session?: ClientSession,
  ): Promise<void>;

  /**
   *Setting workload/reputation score for a user.
   */
  setReputationScore(
    userId: string,
    score: number,
    session?: ClientSession,
  ): Promise<void>;

  /**
   * Finds all moderators.
   * @returns A promise that resolves to an array of moderators.
   */
  findModerators(): Promise<IUser[]>;

  /**
   * Finds all users.
   * @param userId -  user IDs to find.
   * @param preference -  Time period when to delete the notifications.
   * @returns void.
   */
  updateAutoDeleteNotificationPreference(
    preference: NotificationRetentionType,
    userId: string,
    session?: ClientSession,
  ): Promise<void>;

  /**
   * Finds all users.
   * @param userId -  user IDs to find.
   * @param field - field to update
   * @param incrementValue - value to increment or decrement
   * @returns void.
   */
  updatePenaltyAndIncentive(
    userId: string,
    field: 'incentive' | 'penalty',
    session?: ClientSession,
  ): Promise<void>;
  /**
   * Finds all users.
   * @param page -  page count.
   * @param limit - documents to display in one page
   * @param search - serach query
   * @returns A promise that resolve to an array of all users.
   */
  findAllExperts(
    page: number,
    limit: number,
    search: string,
    sortOption: string,
    filter: string,
    session?: ClientSession,
  ): Promise<{ experts: IUser[]; totalExperts: number; totalPages: number }>;
  /**
   * Finds all users.
   * @param userId - userid of expert to block.
   * @param action - either block or unblock
   * @returns void
   */
  updateIsBlocked(
    userId: string,
    action: string,
    session?: ClientSession,
  ): Promise<void>;

  updateSTFStatus(
    userId: string,
    action: string,
    session?: ClientSession,
  ): Promise<void>;

  /**
  * Updates user activity status
  * @param userId - userid of expert to update
  * @param status - either active or in-active
  * @returns void
  */
  updateActivityStatus(
    userId: string,
    status: 'active' | 'in-active',
    session?: ClientSession,
  ): Promise<void>;

  /**
   * @param session
   */
  getUserRoleCount(session?: ClientSession): Promise<UserRoleOverview[]>;

  /**
   * @param session
   */
  getExpertPerformance(session?: ClientSession): Promise<ExpertPerformance[]>;

  /**
 * Updates the last check-in time for a user.
 * @param userId - The ID of the user.
 * @param time - The new check-in time.
 */
  updateCheckInTime(userId: string, time: Date, session?: ClientSession): Promise<void>;

  findUnblockedUsers(session?: ClientSession): Promise<IUser[]>

  blockExperts(expertIds: string[], session: ClientSession): Promise<void>

  unBlockExperts(): Promise<void>

  countActiveExperts(session?: ClientSession): Promise<number>

  countNonBlockedExperts(session?: ClientSession): Promise<number>

  /**
   * Finds all admins.
   * @param session - The session for transaction.
   * @returns A promise that resolves to an array of admins.
   */
  findAdmins(session?: ClientSession): Promise<IUser[]>;

  findInactiveOrBlockedExperts(session?: ClientSession): Promise<IUser[]>;

  /**
   * Finds all call agents (users with isCallAgent: true)
   * @param session - The session for transaction
   * @returns A promise that resolves to an array of call agents
   */
  findCallAgents(session?: ClientSession): Promise<IUser[]>;

  /**
   * Sets a user as a call agent
   * @param userId - The ID of the user to set as call agent
   * @param isCallAgent - Whether the user is a call agent
   * @param isCallAgentActive - Whether the call agent is active
   * @param session - The session for transaction
   * @returns A promise that resolves to the updated user
   */
  setCallAgentStatus(
    userId: string,
    isCallAgent: boolean,
    isCallAgentActive: boolean,
    session?: ClientSession,
  ): Promise<IUser>;

  /**
   * Toggles the active status of a call agent
   * @param userId - The ID of the call agent
   * @param session - The session for transaction
   * @returns A promise that resolves to the updated user
   */
  toggleCallAgentActive(
    userId: string,
    session?: ClientSession,
  ): Promise<IUser>;

  /**
   * Atomically finds and marks an available agent as busy
   * Uses findOneAndUpdate to prevent race conditions
   * @param callUuid - The UUID of the call to assign
   * @param session - The session for transaction
   * @returns A promise that resolves to the updated agent if found, or null if no available agent
   */
  findAndMarkAvailableAgent(
    callUuid: string,
    session?: ClientSession,
  ): Promise<IUser | null>;
  findAvailableModerators(): Promise<IUser[]>;
  findAvailableStfModerators(): Promise<IUser[]>;
  findAvailableStfModeratorsForSources(sources: QuestionSource[]): Promise<IUser[]>;
  findAvailableUsersByRole(role: UserRole): Promise<IUser[]>;
  addAssignedQuestion(moderatorId: string, questionId: string, status: QuestionStatus, source?: QuestionSource, session?: ClientSession): Promise<void>;
  removeAssignedQuestion(moderatorId: string, questionId: string): Promise<void>;
  removeAssignedQuestionFromAllModerators(questionId: string, session?: ClientSession): Promise<void>;
}
