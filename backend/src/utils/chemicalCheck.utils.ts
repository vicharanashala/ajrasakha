import type { ChemicalDetectionResponse } from '#root/modules/ai/services/AiService.js';

export interface ChemicalItem {
  name: string;
  status: 'Banned' | 'Restricted' | 'Allowed';
}

/**
 * Hardcoded chemical data for local testing.
 * Can be easily removed after testing is completed.
 */
export const MOCK_CHEMICALS: ChemicalItem[] = [
  // Banned Chemicals
  { name: 'Aldrin', status: 'Banned' },
  { name: 'Dieldrin', status: 'Banned' },
  { name: 'Endosulfan', status: 'Banned' },
  { name: 'DDT', status: 'Banned' },
  { name: 'Monocrotophos', status: 'Banned' },
  { name: 'Chlordane', status: 'Banned' },
  { name: 'Heptachlor', status: 'Banned' },
  { name: 'Diazinon', status: 'Banned' },
  // Restricted Chemicals
  { name: 'Chlorpyrifos', status: 'Restricted' },
  { name: 'Paraquat', status: 'Restricted' },
  { name: 'Methyl Parathion', status: 'Restricted' },
  { name: 'Atrazine', status: 'Restricted' },
  { name: 'Aluminium Phosphide', status: 'Restricted' },
  { name: 'Captafol', status: 'Restricted' },
  { name: 'Phorate', status: 'Restricted' },
];

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns mock chemical detection response for testing when production API is unavailable.
 */
export function getMockChemicalResponse(text?: string): ChemicalDetectionResponse {
  if (!text || !text.trim()) return { matches: [] };

  const sortedChemicals = [...MOCK_CHEMICALS].sort(
    (a, b) => b.name.length - a.name.length,
  );

  const found: ChemicalItem[] = [];

  for (const chem of sortedChemicals) {
    const escaped = escapeRegExp(chem.name);
    const startsWithWord = /^\w/.test(chem.name);
    const endsWithWord = /\w$/.test(chem.name);
    const prefix = startsWithWord ? '(?<=^|[^\\w])' : '';
    const suffix = endsWithWord ? '(?=[^\\w]|$)' : '';
    const regex = new RegExp(`${prefix}${escaped}${suffix}`, 'i');

    if (regex.test(text)) {
      found.push(chem);
    }
  }

  return {
    matches: found.map((chem) => ({
      name: chem.name,
      status: chem.status,
    })),
  };
}
