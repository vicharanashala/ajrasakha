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
): Promise<null|number> {

  console.log(
    `Checking concept duplication for question: "${questionA}" against ${referenceQuestions.length} reference questions...`
  );

  const formattedQuestions = referenceQuestions
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");

//   const response = await client.chat.completions.create({
//     model: "google/gemma-4-E4B-it",
//     // model: "google/gemma-3-12b-it",
//     temperature: 0,
//     messages: [
//       {
//         role: "system",
//         content: `
//         You are an agricultural similar question finder.
 
//         Your task:
//         Determine whether the input question is asking the EXACT SAME meaning as any candidate question, even if phrased differently.
         
//         Output rules:
         
//         * If a candidate question matches, return only the candidate number.
//         * If none match, return only: NONE
//         `
//       },
//       {
//         role: "user",
//         content: `
// Input Question:
// ${questionA}

// Candidate Questions:
// ${formattedQuestions}

// Return ONLY the matching candidate number or NONE.
// `
//       }
//     ]
//   });


  const response = await fetch(
    'https://api.vicharanashala.org/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.vicharanashala_api_token}`,
      },
      body: JSON.stringify({
        model: 'MiniMaxAI/MiniMax-M2.7',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `
  You are an agricultural similar question finder.

  Your task:
  Determine whether the input question is asking the EXACT SAME meaning as any candidate question, even if phrased differently.

  Output rules:

  * If a candidate question matches, return only the candidate number.
  * If none match, return only: NONE
            `,
          },
          {
            role: 'user',
            content: `
  Input Question:
  ${questionA}

  Candidate Questions:
  ${formattedQuestions}

  Return ONLY the matching candidate number or NONE.
            `,
          },
        ],
      }),
    },
  );
   
  const data: any = await response.json();

  const result = data?.choices?.[0]?.message?.content?.trim() ?? '';

  console.log(`LLM response: "${result}"`);

  if (result.toUpperCase() === "NONE") {
    return null;
  }
 // return result
 const cleaned = result.replace(/\D/g, "");
 const parsedIndex = parseInt(cleaned, 10);
  if (isNaN(parsedIndex)) {
    console.log("Invalid LLM response");
    return null;
  }

  // Convert 1-based index → 0-based index
  return parsedIndex - 1;
}