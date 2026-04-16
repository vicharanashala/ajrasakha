// src/agent/brain.ts
// The LLM "brain" — uses Gemini to decide what action to take next

import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const model = genAI.getGenerativeModel({
  model: "gemini-flash-lite-latest",
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  ],
  generationConfig: {
    temperature: 0,
    responseMimeType: "application/json",
  },
});

export type AgentAction =
  | { type: "navigate";  url: string }
  | { type: "click";     selector: string; description: string }
  | { type: "fill";      selector: string; value: string; description: string }
  | { type: "wait";      ms: number; description: string }
  | { type: "assert";    selector: string; expected: string; description: string }
  | { type: "screenshot"; filename: string }
  | { type: "done";      status: "pass" | "fail"; message: string };

export interface BrainInput {
  goal: string;
  previousActions: string[];
  currentUrl: string;
  pageSnapshot: string;
  error?: string;
}

const SYSTEM_PROMPT = `You are an AI QA engineer testing a web application called Ajrasakha — an Agricultural Q&A platform.

Your job is to execute test scenarios step by step. On each step you receive:
- The test goal
- What actions you've already taken
- The current URL
- A snapshot of the current page DOM/text
- Any errors from the last action

You must respond with EXACTLY ONE JSON action from this list:
- {"type":"navigate","url":"<full url>"}
- {"type":"click","selector":"<css selector or text>","description":"<why>"}
- {"type":"fill","selector":"<css selector>","value":"<text>","description":"<why>"}
- {"type":"wait","ms":<milliseconds>,"description":"<why>"}
- {"type":"assert","selector":"<css selector>","expected":"<expected text>","description":"<why>"}
- {"type":"screenshot","filename":"<name>.png"}
- {"type":"done","status":"pass"|"fail","message":"<summary>"}

Rules:
1. Prefer CSS selectors with id or name attributes for inputs (e.g. input[name="email"]).
2. After filling a form, click the submit/login button.
3. If you see an error or unexpected page, take a screenshot then mark as fail.
4. Return "done" when the goal is fully completed or a blocking failure occurs.
5. Respond with ONLY the JSON object — no markdown, no code fences, no explanation.`;

export async function getNextAction(input: BrainInput): Promise<AgentAction> {
  const userMessage = `
GOAL: ${input.goal}

PREVIOUS ACTIONS (${input.previousActions.length}):
${input.previousActions.slice(-10).join("\n") || "(none yet)"}

CURRENT URL: ${input.currentUrl}

PAGE SNAPSHOT:
${input.pageSnapshot.slice(0, 3000)}

${input.error ? `LAST ERROR: ${input.error}` : ""}

What is the next single action to take?`;

  const result = await model.generateContent([
    { text: SYSTEM_PROMPT },
    { text: userMessage },
  ]);

  const raw = result.response.text().trim();

  // Strip any accidental markdown fences just in case
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

  return JSON.parse(cleaned) as AgentAction;
}
