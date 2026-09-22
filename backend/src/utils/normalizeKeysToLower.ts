const KEY_ALIASES: Record<string, string> = {
  // Question text
  'question': 'question',
  'question_text': 'question',
  'question text': 'question',
  'questions': 'question',
  'query': 'question',
  'prompt': 'question',
  'question title': 'question',
  'question_title': 'question',

  // Crop
  'crop': 'crop',
  'crop_name': 'crop',
  'crop name': 'crop',
  'crops': 'crop',

  // State
  'state': 'state',
  'state_name': 'state',
  'state name': 'state',
  'states': 'state',

  // District
  'district': 'district',
  'district_name': 'district',
  'district name': 'district',
  'districts': 'district',

  // Domain
  'domain': 'domain',
  'domain_name': 'domain',
  'domain name': 'domain',
  'domains': 'domain',

  // Season
  'season': 'season',
  'season_name': 'season',
  'season name': 'season',
  'seasons': 'season',

  // Priority
  'priority': 'priority',
  'priority_level': 'priority',
  'priority level': 'priority',

  // AI Initial Answer
  'aiinitialanswer': 'aiinitialanswer',
  'ai_initial_answer': 'aiinitialanswer',
  'ai initial answer': 'aiinitialanswer',
  'ai_answer': 'aiinitialanswer',
  'ai answer': 'aiinitialanswer',
  'initial_answer': 'aiinitialanswer',
  'initial answer': 'aiinitialanswer',

  // Source
  'source': 'source',
  'question_source': 'source',
  'source_name': 'source',
};

export const normalizeKeysToLower = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(normalizeKeysToLower);
  } else if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((acc, rawKey) => {
      const trimmedLower = rawKey.trim().toLowerCase();
      const canonicalKey = KEY_ALIASES[trimmedLower] || trimmedLower;
      const normalizedValue = normalizeKeysToLower(obj[rawKey]);
      
      // If the canonical key already exists (e.g. from an earlier alias),
      // do not overwrite a valid non-empty value with an empty/undefined value
      if (acc[canonicalKey] !== undefined && acc[canonicalKey] !== '' && (normalizedValue === undefined || normalizedValue === '')) {
        return acc;
      }

      acc[canonicalKey] = normalizedValue;
      return acc;
    }, {} as any);
  }
  return obj;
};

