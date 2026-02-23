import { SarvamAIClient } from "sarvamai";
import { env } from "@/config/env";

const client = new SarvamAIClient({
  apiSubscriptionKey: env.sarvamApiKey(),
});

export async function translateService(
  text: string,
  targetLang: string
): Promise<string> {
  if (targetLang === "en-IN") return text;

  const response = await client.text.translate({
    input: text,
    source_language_code: "en-IN",
    target_language_code: targetLang as any,
    model: "sarvam-translate:v1",
  });

  if (!response?.translated_text) {
    throw new Error("Translation failed");
  }

  return response.translated_text;
}
