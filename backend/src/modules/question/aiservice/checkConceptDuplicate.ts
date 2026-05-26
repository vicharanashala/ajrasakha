import OpenAI from 'openai';
import {aiConfig} from '#root/config/ai.js';

const GEMMA_API_KEY = aiConfig.gemma_api_key;

const client = new OpenAI({
  apiKey: GEMMA_API_KEY,
  baseURL: aiConfig.gemma_api,
});

export async function checkConceptDuplicate(
  questionA: string,
  referenceQuestions: string[],
): Promise<null | number> {
  console.log(
    `Checking concept duplication for question: "${questionA}" against ${referenceQuestions.length} reference questions...`,
  );

  const formattedQuestions = referenceQuestions
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n');

  const response = await client.chat.completions.create({
    model: 'MiniMaxAI/MiniMax-M2.7',
    // model: "google/gemma-3-12b-it",
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `You are an agricultural duplicate question detector.

Your task: Determine if the input question asks the EXACT SAME thing as any candidate question, even if phrased differently.

Rules:
- If a match exists, respond with ONLY the single digit number of the BEST matching candidate (e.g. 1).
- Do NOT return multiple numbers, commas, ranges, or any explanation.
- If no candidate matches, respond with only: NONE`,
      },
      {
        role: 'user',
        content: `Input Question:
${questionA}

Candidate Questions:
${formattedQuestions}

Reply with ONE number only, or NONE.`,
      },
    ],
  });

  const result = response.choices?.[0]?.message?.content?.trim() ?? '';

  console.log(`LLM response: "${result}"`);

  if (result.toUpperCase() === 'NONE') {
    return null;
  }
  // Extract only the first number — handles stray "1, 2, 3" style responses
  const firstMatch = result.match(/\d+/);
  if (!firstMatch) {
    console.log('Invalid LLM response — no number found');
    return null;
  }
  const parsedIndex = parseInt(firstMatch[0], 10);

  // Convert 1-based index → 0-based index
  return parsedIndex - 1;
}
