import OpenAI from "openai";
import { aiConfig } from "#root/config/ai.js";

const GEMMA_API_KEY = aiConfig.gemma_api_key;

const client = new OpenAI({
  apiKey: GEMMA_API_KEY,
  baseURL: aiConfig.gemma_api,
});

export async function checkConceptDuplicate(
  questionA: string,
  referenceQuestions: string[]
): Promise<string | null> {

  console.log(
    `Checking concept duplication for question: "${questionA}" against ${referenceQuestions.length} reference questions...`
  );

  const formattedQuestions = referenceQuestions
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");

  const response = await client.chat.completions.create({
    model: "google/gemma-3-12b-it",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
You are an agricultural question classifier.

Your task:
Determine if the input question asks the SAME concept as any candidate question.

Rules:
- Pest and disease are different concepts.
- Different crops are different concepts.
- Yield, variety, fertilizer, irrigation, pest, and disease are different concepts.

Output rules:
- If a candidate question matches the SAME concept, return the FULL candidate question text exactly.
- If none match, return: NONE
`
      },
      {
        role: "user",
        content: `
Input Question:
${questionA}

Candidate Questions:
${formattedQuestions}

Return the exact matching candidate question or NONE.
`
      }
    ]
  });

  const result =
    response.choices?.[0]?.message?.content?.trim() ?? "";

  console.log(`LLM response: "${result}"`);

  if (result.toUpperCase() === "NONE") {
    return null;
  }

  return result;
}