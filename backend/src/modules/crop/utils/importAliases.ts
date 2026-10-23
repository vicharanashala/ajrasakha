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
 * separately; terms that only repeat the entry's own name or add nothing are skipped.
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
} => {
  const stored = existing.map(a => (typeof a === 'string' ? a : {...a}));
  const byKey = new Map<string, ICropAlias>();
  stored.forEach(a => {
    if (typeof a !== 'string') byKey.set(termKey(a), a);
  });

  const fresh: ICropAlias[] = [];
  const enrichedTerms = new Set<ICropAlias>();
  let skipped = 0;

  for (const alias of incoming) {
    if (norm(alias.english_representation) === norm(entryName)) {
      skipped++;
      continue;
    }
    const match = byKey.get(termKey(alias));
    if (match) {
      if (fillMissingDetails(match, alias)) enrichedTerms.add(match);
      else skipped++;
      continue;
    }
    const copy = {...alias};
    byKey.set(termKey(copy), copy);
    fresh.push(copy);
  }
  return {stored, fresh, enriched: enrichedTerms.size, skipped};
};
