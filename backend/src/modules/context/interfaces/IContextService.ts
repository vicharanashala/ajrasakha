import { IContext } from '#root/shared/interfaces/models.js';

export interface IContextService {
  /**
   * Create a new context
   */
  addContext(
    userId: string,
    text: string
  ): Promise<{
    insertedId: string;
  }>;

  /**
   * Fetch context by ID
   */
  getById(contextId: string): Promise<IContext | null>;
}
