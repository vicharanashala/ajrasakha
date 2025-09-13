import {IContext} from '#root/shared/interfaces/models.js';
import {ClientSession, ObjectId} from 'mongodb';

/**
 * Interface representing a repository for context-related operations.
 */
export interface IContextRepository {
  /**
   * Adds a new context.
   * @param text - The text content of the context.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the inserted context ID.
   */
  addContext(
    text: string,
    session?: ClientSession,
  ): Promise<{insertedId: string}>;

  /**
   * Retrieves a context by its ID.
   * @param contextId - The ID of the context to retrieve.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to the context if found, or null if not found.
   */
  getById(contextId: string, session?: ClientSession): Promise<IContext | null>;
}
