import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';

/**
 * Stateless helpers shared between QuestionService (queue rendering) and
 * QuestionReportService (Excel reports). Extracted here so the expert-name /
 * answer-source formatting lives in exactly one place instead of being copied
 * into each service.
 */

/** Flatten an answer's `sources` array into a human-readable multi-line string. */
export function formatAnswerSources(
  sources?: {source: string; sourceName?: string; page?: string | number}[],
): string {
  if (!sources?.length) return '';
  return sources
    .map(s => {
      const label = s.sourceName?.trim();
      const page =
        s.page != null && String(s.page).trim() ? ` (p.${s.page})` : '';
      const src = (s.source ?? '').toString().trim();
      if (!label && !src) return '';
      return label ? `${label}: ${src}${page}` : `${src}${page}`;
    })
    .filter(Boolean)
    .join('\n');
}

/** Resolve expert ids → display names in a single batched lookup. */
export async function resolveExpertNames(
  userRepo: IUserRepository,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const users = await userRepo.getUsersByIds(unique);
  for (const u of users) {
    const name =
      `${(u as any).firstName ?? ''} ${(u as any).lastName ?? ''}`.trim();
    map.set(u._id.toString(), name || (u as any).email || 'Unknown');
  }
  return map;
}

/** Resolve expert ids → {name, isTrainingUser} in a single batched lookup. */
export async function resolveExpertMeta(
  userRepo: IUserRepository,
  ids: string[],
): Promise<Map<string, {name: string; isTrainingUser: boolean}>> {
  const map = new Map<string, {name: string; isTrainingUser: boolean}>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const users = await userRepo.getUsersByIds(unique);
  for (const u of users) {
    const name =
      `${(u as any).firstName ?? ''} ${(u as any).lastName ?? ''}`.trim();
    map.set(u._id.toString(), {
      name: name || (u as any).email || 'Unknown',
      isTrainingUser: (u as any).isTrainingUser === true,
    });
  }
  return map;
}
