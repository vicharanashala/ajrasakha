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
  | { type: "escalate_db"; description: string }
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

To be fast and efficient, you must respond with EXACTLY ONE JSON ARRAY containing 1 or more actions to execute in sequence:
[
  {"type":"navigate","url":"<full url>"},
  {"type":"click","selector":"<css selector or text>","description":"<why>"},
  {"type":"fill","selector":"<css selector>","value":"<text>","description":"<why>"},
  {"type":"wait","ms":<milliseconds>,"description":"<why>"},
  {"type":"assert","selector":"<css selector>","expected":"<expected text>","description":"<why>"},
  {"type":"screenshot","filename":"<name>.png"},
  {"type":"escalate_db","description":"Bypass peer-review in DB"},
  {"type":"done","status":"pass"|"fail","message":"<summary>"}
]

Rules:
1. Batch as many consecutive actions together as you safely can (e.g., fill email, fill password, and click submit all in one array!).
2. After clicking a button that triggers a network request or navigation, end your array so the DOM can update before you decide the next steps.
3. If you see an error or unexpected page, take a screenshot then mark as fail in the array.
4. Return an object with type "done" when the goal is fully completed or a blocking failure occurs.
5. Respond with ONLY the JSON array — no markdown, no code fences, no explanation.`;

export async function getNextAction(input: BrainInput): Promise<AgentAction[]> {
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

  const parsed = JSON.parse(cleaned);
  return Array.isArray(parsed) ? parsed as AgentAction[] : [parsed] as AgentAction[];
}
