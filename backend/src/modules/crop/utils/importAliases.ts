import {ICropAlias} from '#root/shared/interfaces/models.js';

/** One entry of a sheet import: a standardized name plus every vernacular term for it. */
export interface CropImportEntry {
  name: string;
  scientificName?: string;
  aliases: ICropAlias[];
}

export interface CropImportResult {
  name: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  reason: string;
}

/** What one entry's import changed, kept for the audit trail (not sent to the client). */
export interface CropImportChange extends CropImportResult {
  operation: 'create' | 'update';
  entryId?: string;
  addedAliases: ICropAlias[];
  /** Stored aliases before and after their empty details were filled. */
  filledBefore: ICropAlias[];
  filledAfter: ICropAlias[];
  scientificName?: {before: string | null; after: string};
  conflicts: string[];
}

const norm = (value?: string) => (value ?? '').trim().toLowerCase();

/** Identifies a vernacular term by language, region and its two spellings. */
const termKey = (alias: ICropAlias) =>
  [
    alias.language,
    alias.region,
    alias.english_representation,
    alias.native_representation,
  ]
    .map(norm)
    .join('|');

/** Optional term details a sheet row can fill in on a matching stored term. */
const DETAIL_KEYS = ['source_link', 'page_number', 'agri_expert', 'remark'] as const;

/**
 * Copies details from an incoming term onto a stored one, only where the stored
 * value is empty, so existing data is never overwritten. Returns true if anything changed.
 */
const fillMissingDetails = (target: ICropAlias, source: ICropAlias): boolean => {
  let changed = false;
  for (const key of DETAIL_KEYS) {
    const value = source[key]?.trim();
    if (value && !target[key]?.trim()) {
      target[key] = value;
      changed = true;
    }
  }
  for (const [key, value] of Object.entries(source.extra_fields ?? {})) {
    if (value?.trim() && !target.extra_fields?.[key]?.trim()) {
      target.extra_fields = {...target.extra_fields, [key]: value.trim()};
      changed = true;
    }
  }
  return changed;
};

/**
 * Plans how incoming terms merge into an entry's stored terms. A term matching a
 * stored one (same language, region, English and native name, ignoring case) fills
 * in that term's empty details instead of being added again. New terms are returned
 * separately; a new term that only repeats the entry's own name, or a matching term
 * that adds nothing, is skipped.
 */
export const planAliasMerge = (
  entryName: string,
  existing: (ICropAlias | string)[],
  incoming: ICropAlias[],
): {
  stored: (ICropAlias | string)[];
  fresh: ICropAlias[];
  enriched: number;
  skipped: number;
  filledBefore: ICropAlias[];
  filledAfter: ICropAlias[];
} => {
  const stored = existing.map(a => (typeof a === 'string' ? a : {...a}));
  const byKey = new Map<string, ICropAlias>();
  stored.forEach(a => {
    if (typeof a !== 'string') byKey.set(termKey(a), a);
  });

  const fresh: ICropAlias[] = [];
  // Snapshot of each stored alias taken just before its first detail is filled.
  const enrichedTerms = new Map<ICropAlias, ICropAlias>();
  let skipped = 0;

  for (const alias of incoming) {
    // A stored alias is always enriched, even when it repeats the entry's own name.
    const match = byKey.get(termKey(alias));
    if (match) {
      const snapshot = {...match, ...(match.extra_fields && {extra_fields: {...match.extra_fields}})};
      if (fillMissingDetails(match, alias)) {
        if (!enrichedTerms.has(match)) enrichedTerms.set(match, snapshot);
      } else skipped++;
      continue;
    }
    if (norm(alias.english_representation) === norm(entryName)) {
      skipped++;
      continue;
    }
    const copy = {...alias};
    byKey.set(termKey(copy), copy);
    fresh.push(copy);
  }
  return {
    stored,
    fresh,
    enriched: enrichedTerms.size,
    skipped,
    filledBefore: [...enrichedTerms.values()],
    filledAfter: [...enrichedTerms.keys()],
  };
};
