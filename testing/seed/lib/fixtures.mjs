// =============================================================================
// testing/seed/lib/fixtures.mjs
// -----------------------------------------------------------------------------
// Stable enumeration of states, crops, domains, sources, and statuses used by
// the seed scripts and by the Locust tasks in Phase 3.
// Kept in one place so seed and load gen stay in lock-step.
// =============================================================================

// 20 states + UTs keeps us realistic without exploding matrix size.
export const STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan',
  'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

// Crops are the same set used by the chatbot dashboard filters.
export const CROPS = [
  'wheat', 'rice', 'maize', 'sugarcane', 'cotton', 'soybean',
  'groundnut', 'mustard', 'pulses', 'millets', 'jowar', 'bajra',
  'barley', 'turmeric', 'onion', 'potato', 'tomato', 'banana',
  'mango', 'grapes',
];

export const SEASONS = ['kharif', 'rabi', 'zaid'];

// Mirrors backend QuestionStatus union
export const QUESTION_STATUSES = [
  'open',
  'in-review',
  'closed',
  'delayed',
  'pae_submitted',
  'dynamic',
  'queue_progress',
  'auditor_review',
];

// Mirrors backend UserRole union, only what the reviewer system exercises
export const ROLES = {
  EXPERT: 'expert',
  PAE_EXPERT: 'pae_expert',
  MODERATOR: 'moderator',
  GATE_KEEPER: 'gate_keeper',
  AUDITOR: 'auditor',
  ADMIN: 'admin',
};

export const PRIORITIES = ['low', 'medium', 'high', 'critical'];

// Mirrors backend QuestionSource
export const SOURCES = [
  'AJRASAKHA',
  'AGRI_EXPERT',
  'WHATSAPP',
  'OUTREACH',
  'CROP_DOCTOR',
];

// 20 paired crops for the duplicate-detection fixture used by Phase 4's
// bug-1204 harness.  Each entry is [original, near-duplicate] (cosine ≥ 0.70).
export const DUPLICATE_PAIRS = [
  ['What is the best fertilizer for rice cultivation?', 'Which fertilizer works well for rice farming?'],
  ['How to control aphids in mustard crop?',        'What pesticide controls aphids on mustard plants?'],
  ['My tomato leaves have yellow spots.',          'Tomato plant leaves are turning yellow with spots.'],
  ['When to sow wheat in Punjab?',                 'Best sowing time for wheat in Punjab state?'],
  ['Recommended irrigation for sugarcane',         'How much water does sugarcane need?'],
];

// 10 templates that, paired with a crop, generate the bulk of synthetic Q&A.
export const QUESTION_TEMPLATES = [
  'What is the best fertilizer for {crop} cultivation?',
  'How to control aphids in {crop}?',
  'My {crop} leaves have yellow spots — what should I do?',
  'When is the right time to sow {crop} in {state}?',
  'Recommended irrigation schedule for {crop}',
  'Is {crop} suitable for {season} sowing in {state}?',
  'What pests commonly affect {crop}?',
  'How to improve yield of {crop}?',
  'Organic manure options for {crop}',
  'Symptoms of nitrogen deficiency in {crop}',
];

// deterministic pseudo-random helper so re-runs produce identical seeds
// unless SEED_TESTS_RANDOM=1 is exported.
export function rng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}
