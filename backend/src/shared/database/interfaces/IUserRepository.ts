import {
  ExpertPerformance,
  ModeratorApprovalRate,
  UserRoleOverview,
} from '#root/modules/core/classes/validators/DashboardValidators.js';
import {PreferenceDto} from '#root/modules/core/classes/validators/UserValidators.js';
import {IUser, NotificationRetentionType} from '#shared/interfaces/models.js';
import {MongoClient, ClientSession, ObjectId} from 'mongodb';

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
  updateReputationScore(
    userId: string,
    isIncrement: boolean,
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
  ): Promise<{experts: IUser[]; totalExperts: number; totalPages: number}>;
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
}
