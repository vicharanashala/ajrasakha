import {IPop} from '#root/shared/interfaces/models.js';

export interface IPopRepository {
  /**
   * Finds a `pop_unique_documents` document whose `shareable_link` exactly matches the
   * given source.
   * @param shareableLink - The source value to match against `shareable_link`.
   */
  findByShareableLink(shareableLink: string): Promise<IPop | null>;
}
