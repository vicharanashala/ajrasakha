import {IPop, IPopQueueItemSummary} from '#root/shared/interfaces/models.js';

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

  /** Read-only upload-intake duplicate pre-check, confirmed directly with the PoP team
   *  (same database as pop_unique_documents, no status filter — matches every status
   *  including `failed`, same as PoP's own `_refuse_if_queued`). A match here should BLOCK
   *  the upload — PoP's own POST /dashboard/uploads would 409 on it anyway. */
  findQueuedBySha256(sha256: string): Promise<IPopQueueItemSummary | null>;

  /** Read-only catalogue duplicate pre-check — matches either the document's own `sha256`
   *  or one of its `merged_sha256s` (documents merged into it). A match here is NOT a
   *  reason to block: filing an already-catalogued document into more folders is a normal,
   *  legitimate workflow. Callers should warn, not refuse. */
  findCatalogueBySha256(sha256: string): Promise<IPop | null>;
}
