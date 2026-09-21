import OpenAI from 'openai';
import {aiConfig} from '#root/config/ai.js';

const gemmaClient = new OpenAI({
  apiKey: aiConfig.gemma_api_key,
  baseURL: aiConfig.gemma_api,
});

const minimaxClient = new OpenAI({
  apiKey: aiConfig.minimax_api_key,
  baseURL: aiConfig.minimax_api,
});

const PRIMARY_MODEL = 'google/gemma-4-E4B-it';
const FALLBACK_MODEL = 'MiniMaxAI/MiniMax-M2.7';

/**
 * Single LLM call that classifies the input question as:
 *   - non-agri (greeting / small talk / unrelated topic), OR
 *   - a duplicate of one of the candidate questions, OR
 *   - neither (normal new agricultural question).
 *
 * Returns:
 *   { isNonAgri: true, matchedIndex: null }    → non-agri
 *   { isNonAgri: false, matchedIndex: <n> }    → duplicate of candidate at 0-based index n
 *   { isNonAgri: false, matchedIndex: null }   → agri question, no match
 */
export async function checkConceptDuplicate(
  questionA: string,
  referenceQuestions: string[]
): Promise<{ isNonAgri: boolean; matchedIndex: number | null }> {
  console.log(
    `Checking concept duplication + non-agri for: "${questionA}" against ${referenceQuestions.length} candidate(s)...`
  );

  const formattedQuestions =
    referenceQuestions.length > 0
      ? referenceQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')
      : '(no candidate questions)';

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
You are a classifier for an agricultural advisory platform.

Classify the input question into exactly ONE of three outcomes:

1. NON_AGRI — The input is strictly NOT related to agriculture, farming, weather, or rural livelihood. This means ONLY:
   - Pure greetings or small talk: "hi", "hello", "how are you", "good morning", "good evening", "thanks", "bye"
   - Jokes, personal chit-chat, or meaningless conversational text ("who are you", "tell me a joke")
   - Questions clearly about completely unrelated topics (e.g. movies, video games, sports scores/cricket matches, political elections, software programming/coding, school algebra/calculus, celebrity gossip)
   - Completely empty or unintelligible gibberish input ("asdfgh", ".....", "123456", "????")

   IMPORTANT — Do NOT classify as NON_AGRI if the question relates to ANY of the following (classify as NONE or the matching candidate number):
   - Weather, Sky Conditions & Forecasts: ANY question about weather, sky conditions (e.g. "Will the sky remain clear in Karaikal, Puducherry tonight", "is it cloudy", "clear sky", "cloud cover"), rain, rainfall forecast, precipitation, monsoons, storms, thunderstorms, cyclones, temperature, heatwave, cold wave, frost, fog, humidity, wind speed/direction, or sunshine/sunlight for ANY location, date, or time. Farmers rely on weather and sky conditions for critical farming operations like irrigation, pesticide spraying, harvesting, and sowing.
   - Crops, Plants & Seeds: Mentions any crop, plant, tree, grain, vegetable, fruit, flower, seed, variety name, or seed code (e.g. "PR 133", "HYV", "IR 64", "Bt cotton", "HD 2967", "Pusa 1121", "chilli", "paddy", "cotton", "wheat", "mustard", "sugarcane", "tomato", "onion", "soybean", "groundnut").
   - Farm Management & Practices: Sowing, planting, harvesting, weeding, pruning, grafting, nursery management, crop rotation, intercropping, organic farming, greenhouse, polyhouse, mulching.
   - Soil, Water & Nutrition: Soil health, soil testing, soil types, fertilizers (urea, DAP, NPK, potash), organic manure, compost, vermicompost, biofertilizers, irrigation methods (drip, sprinkler, flood), borewell, canal water, water quality, drainage.
   - Pests, Diseases & Weeds: Insects, pests, caterpillars, borers, fungal/bacterial/viral crop diseases, leaf curl, yellowing, blight, rot, wilt, weed control, pesticides, insecticides, fungicides, weedicides, bio-pesticides.
   - Livestock, Dairy, Poultry & Allied Agriculture: Cattle, cows, buffaloes, goats, sheep, poultry/chickens, animal feed, fodder, veterinary care, milk production, fisheries, aquaculture, beekeeping/apiculture, sericulture/silkworms, mushroom farming.
   - Markets, Pricing & Government Schemes: Mandi prices, APMC rates, Minimum Support Price (MSP), crop insurance (PMFBY), government agricultural subsidies and schemes (PM-KISAN, KCC, soil health card), agricultural loans, procurement.
   - Farm Machinery & Infrastructure: Tractors, tillers, sprayers, harvesters, threshers, drip equipment, solar water pumps, cold storage, godowns, fencing.
   - Land & Measurement: Acre, bigha, hectare, guntha, land preparation, field bunding.

   CRITICAL RULE: When in doubt, ALWAYS default to NONE rather than NON_AGRI. A question should ONLY be classified as NON_AGRI if you are 100% certain it has zero connection to farming, agriculture, weather, soil, livestock, or rural livelihood.

2. <CANDIDATE_NUMBER> — The input IS agriculture-related AND asks the EXACT SAME
   meaning as one of the candidate questions (even if phrased differently).
   Return only the matching candidate number (1-based).

3. NONE — The input IS agriculture-related but does NOT match any candidate.

Output rules:
* Return ONLY one of: NON_AGRI, NONE, or a single candidate number.
* No explanation, no extra text.
      `,
    },
    {
      role: 'user',
      content: `Input Question:
${questionA}

Candidate Questions:
${formattedQuestions}

Return ONLY one of: NON_AGRI, NONE, or the matching candidate number.
`,
    },
  ];

  let raw: string;

  try {
    const response = await gemmaClient.chat.completions.create({
      model: PRIMARY_MODEL,
      temperature: 0,
      messages,
    });
    raw = response.choices?.[0]?.message?.content?.trim() ?? '';
    console.log(`[${PRIMARY_MODEL}] response: "${raw}"`);
  } catch (primaryErr: any) {
    console.warn(`[${PRIMARY_MODEL}] failed (${primaryErr?.message}), falling back to ${FALLBACK_MODEL}`);
    const fallbackResponse = await minimaxClient.chat.completions.create({
      model: FALLBACK_MODEL,
      temperature: 0,
      messages,
    });
    raw = fallbackResponse.choices?.[0]?.message?.content?.trim() ?? '';
    console.log(`[${FALLBACK_MODEL}] response: "${raw}"`);
  }

  return parseResponse(raw, referenceQuestions);
}

function parseResponse(
  raw: string,
  referenceQuestions: string[],
): { isNonAgri: boolean; matchedIndex: number | null } {
  const upper = raw.toUpperCase();

  if (upper.includes('NON_AGRI') || upper.includes('NON-AGRI') || upper.includes('NONAGRI')) {
    return { isNonAgri: true, matchedIndex: null };
  }

  if (upper === 'NONE') {
    return { isNonAgri: false, matchedIndex: null };
  }

  const cleaned = raw.replace(/\D/g, '');
  const parsed = parseInt(cleaned, 10);
  if (isNaN(parsed)) {
    console.log('Invalid LLM response, treating as no match');
    return { isNonAgri: false, matchedIndex: null };
  }

  const zeroIndex = parsed - 1;
  if (zeroIndex < 0 || zeroIndex >= referenceQuestions.length) {
    console.log('LLM returned out-of-range candidate index, treating as no match');
    return { isNonAgri: false, matchedIndex: null };
  }

  return { isNonAgri: false, matchedIndex: zeroIndex };
}
