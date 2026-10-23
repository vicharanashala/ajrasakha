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

/**
 * Splits incoming terms into those worth adding and those to skip: a term is
 * skipped when it repeats one already stored (or one earlier in the same import),
 * or when it only repeats the entry's own name.
 */
export const selectNewAliases = (
  entryName: string,
  existing: unknown[],
  incoming: ICropAlias[],
): {fresh: ICropAlias[]; skipped: number} => {
  const seen = new Set(
    existing
      .filter((a): a is ICropAlias => typeof a === 'object' && a !== null)
      .map(termKey),
  );
  const fresh: ICropAlias[] = [];
  let skipped = 0;

  for (const alias of incoming) {
    const key = termKey(alias);
    if (seen.has(key) || norm(alias.english_representation) === norm(entryName)) {
      skipped++;
      continue;
    }
    seen.add(key);
    fresh.push(alias);
  }
  return {fresh, skipped};
};
