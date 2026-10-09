import {IPop, PopMatchStatus, PopRequiredField} from '#root/shared/interfaces/models.js';

export interface PopLookupResult {
  found: boolean;
  _id?: string;
  shareable_name?: string;
  shareable_link?: string;
  year_of_release?: string | number | null;
  live_source_link?: string | null;
  /** Which of year_of_release/live_source_link/shareable_name are missing on the
   *  matched document - non-empty only when `found` is true. */
  missingFields?: PopRequiredField[];
  /** Where the match was found — 'notFound' when `found` is false. The Edit Source
   *  modal carries this straight through to the updated_sources record's
   *  sourceReferenceStatus on save. */
  matchStatus?: PopMatchStatus;
}

export interface IPopService {
  /** Looks up a source against the pop_unique_documents collection (top-level
   *  shareable_link, falling back to duplicate_links) and reports which one matched via
   *  matchStatus, along with which required fields (if any) are missing. */
  lookupBySource(source: string): Promise<PopLookupResult>;

  /** Fills in the given (previously-missing) fields on a matched pop_unique_documents
   *  document and returns the refreshed lookup result. */
  updateMissingFields(
    id: string,
    fields: Partial<Record<PopRequiredField, string | number>>,
  ): Promise<PopLookupResult>;

  findById(id: string): Promise<IPop | null>;
}
