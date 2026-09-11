import {IPop} from '#root/shared/interfaces/models.js';

export interface IPopRepository {
  /**
   * Finds a `pop_unique_documents` document whose `shareable_link` exactly matches the
   * given source.
   * @param shareableLink - The source value to match against `shareable_link`.
   */
  findByShareableLink(shareableLink: string): Promise<IPop | null>;

  /** Finds a `pop_unique_documents` document by its own `_id`. */
  findById(id: string): Promise<IPop | null>;

  /** Merges the given fields into a `pop_unique_documents` document, returning it after
   *  the update. Used to fill in year_of_release/live_source_link/shareable_name when
   *  the reviewer supplies them via the missing-fields modal. */
  updateFields(id: string, fields: Partial<IPop>): Promise<IPop | null>;
}
