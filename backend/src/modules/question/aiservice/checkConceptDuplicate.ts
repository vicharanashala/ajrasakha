import OpenAI from "openai";
import { aiConfig } from "#root/config/ai.js";

const GEMMA_API_KEY = aiConfig.gemma_api_key;

const client = new OpenAI({
  apiKey: GEMMA_API_KEY,
  baseURL: aiConfig.gemma_api,
});

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
      ? referenceQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "(no candidate questions)";

  const response = await client.chat.completions.create({
    model: "MiniMaxAI/MiniMax-M2.7",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
You are a classifier for an agricultural advisory platform.

Classify the input question into exactly ONE of three outcomes:

1. NON_AGRI — The input is NOT related to agriculture. Examples:
   - Greetings or small talk: "hi", "hello", "how are you", "good morning"
   - Jokes, personal chit-chat, or meaningless text
   - Questions about unrelated topics (movies, sports, politics, general knowledge,
     coding, math homework, etc.)
   - Empty or gibberish input

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
        role: "user",
        content: `
Input Question:
${questionA}

Candidate Questions:
${formattedQuestions}

Return ONLY one of: NON_AGRI, NONE, or the matching candidate number.
`,
      },
    ],
  });

  const raw = response.choices?.[0]?.message?.content?.trim() ?? "";
  console.log(`LLM response: "${raw}"`);

  const upper = raw.toUpperCase();

  if (upper.includes("NON_AGRI") || upper.includes("NON-AGRI") || upper.includes("NONAGRI")) {
    return { isNonAgri: true, matchedIndex: null };
  }

  if (upper === "NONE") {
    return { isNonAgri: false, matchedIndex: null };
  }

  // Parse candidate number (1-based) → 0-based index
  const cleaned = raw.replace(/\D/g, "");
  const parsed = parseInt(cleaned, 10);
  if (isNaN(parsed)) {
    console.log("Invalid LLM response, treating as no match");
    return { isNonAgri: false, matchedIndex: null };
  }

  const zeroIndex = parsed - 1;
  if (zeroIndex < 0 || zeroIndex >= referenceQuestions.length) {
    console.log("LLM returned out-of-range candidate index, treating as no match");
    return { isNonAgri: false, matchedIndex: null };
  }

  return { isNonAgri: false, matchedIndex: zeroIndex };
}
