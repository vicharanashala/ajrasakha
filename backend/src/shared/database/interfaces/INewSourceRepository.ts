import {INewSource} from '#root/shared/interfaces/models.js';

export interface INewSourceRepository {
  /** Inserts a new document into the `new_sources` collection. */
  create(data: Omit<INewSource, '_id' | 'createdAt' | 'updatedAt'>): Promise<INewSource>;

  /** Updates an existing `new_sources` document by id (e.g. on save, once editing completes). */
  updateById(
    id: string,
    updates: Partial<Pick<INewSource, 'sources' | 'status' | 'timeTaken'>>,
  ): Promise<INewSource | null>;

  /** Stamps closedAt on the record's reviewArray entry when the Edit Source modal closes —
   *  independent of updateById, since the modal can close without the edit being completed. */
  recordClose(id: string): Promise<INewSource | null>;
}
