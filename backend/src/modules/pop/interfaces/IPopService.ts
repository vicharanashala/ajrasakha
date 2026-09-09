import {PopMatchStatus} from '#root/shared/interfaces/models.js';

export interface PopLookupResult {
  found: boolean;
  _id?: string;
  shareable_name?: string;
  shareable_link?: string;
  /** Page count of the matched document - autofills the source's `page` field. */
  num_pages?: number;
  /** Where the match was found — 'notFound' when `found` is false. The Edit Source
   *  modal carries this straight through to the new_sources record's
   *  sourceReferenceStatus on save. */
  matchStatus?: PopMatchStatus;
}

export interface IPopService {
  /** Looks up a source against the pop collection (top-level shareable_link, falling
   *  back to duplicate_links) and reports which one matched via matchStatus. */
  lookupBySource(source: string): Promise<PopLookupResult>;
}
