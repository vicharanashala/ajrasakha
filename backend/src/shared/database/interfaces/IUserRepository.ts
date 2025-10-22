import {PreferenceDto} from '#root/modules/core/classes/validators/UserValidators.js';
import {IUser} from '#shared/interfaces/models.js';
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
  findUsersByPreference(
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
  getUsersByIds(ids: string[]): Promise<IUser[]>;
  /**
   * Finds all users.
   * @returns A promise that resolves to an array of users.
   */
  findAll(session?: ClientSession): Promise<IUser[]>;
}
