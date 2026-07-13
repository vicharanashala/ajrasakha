import { IMedia, MediaKind } from '#root/shared/interfaces/models.js';

export interface IMediaRepository {
  /** List media, optionally filtered by kind, ordered by `order` then newest first. */
  list(kind?: MediaKind): Promise<IMedia[]>;
  getById(id: string): Promise<IMedia | null>;
  create(media: Omit<IMedia, '_id'>): Promise<IMedia>;
  /** Delete the metadata document. The GCS object is removed by the service. */
  delete(id: string): Promise<boolean>;
  /** Next order value for a kind (appends to the end). */
  nextOrder(kind: MediaKind): Promise<number>;
}
