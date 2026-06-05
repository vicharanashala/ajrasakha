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

1. NON_AGRI — The input is NOT related to agriculture. This means ONLY:
   - Greetings or small talk: "hi", "hello", "how are you", "good morning"
   - Jokes, personal chit-chat, or meaningless text
   - Questions clearly about unrelated topics (movies, sports, politics, coding, math, etc.)
   - Completely empty or gibberish input with no agricultural meaning

   IMPORTANT — Do NOT classify as NON_AGRI if the question:
   - Mentions a crop, seed, or variety name or code (e.g. "PR 133", "HYV", "IR 64", "Bt cotton", "HD 2967")
   - Mentions pests, diseases, fertilizers, irrigation, soil, weather, or farming practices
   - Asks about government schemes, market prices, or subsidies related to farming
   - Contains agricultural terminology even if the phrasing is short or looks like a code
   When in doubt, default to NONE rather than NON_AGRI.

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
