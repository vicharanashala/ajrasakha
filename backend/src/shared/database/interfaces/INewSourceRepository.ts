import {INewSource} from '#root/shared/interfaces/models.js';

export interface INewSourceRepository {
  /** Inserts a new document into the `new_sources` collection. */
  create(data: Omit<INewSource, '_id' | 'createdAt'>): Promise<INewSource>;
}
