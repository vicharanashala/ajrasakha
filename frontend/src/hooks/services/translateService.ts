import { SarvamAIClient } from "sarvamai";
import { env } from "@/config/env";

const client = new SarvamAIClient({
  apiSubscriptionKey: env.sarvamApiKey(),
});

const MAX_CHARS = 1900; // stay safely under the 2000 char limit

function splitIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_CHARS) {
    // Try to split at a newline or sentence boundary within the limit
    let splitAt = remaining.lastIndexOf("\n", MAX_CHARS);
    if (splitAt < MAX_CHARS / 2) splitAt = remaining.lastIndexOf(". ", MAX_CHARS);
    if (splitAt < MAX_CHARS / 2) splitAt = MAX_CHARS;

    chunks.push(remaining.slice(0, splitAt + 1));
    remaining = remaining.slice(splitAt + 1);
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export async function translateService(
  text: string,
  targetLang: string
): Promise<string> {
  // Detect source language from a sample of the text (max 1000 chars for LID API)
  const sample = text.slice(0, 1000);
  const lidResponse = await client.text.identifyLanguage({ input: sample });
  const sourceLang = lidResponse.language_code ?? "en-IN";

  // If source and target are the same, return as-is
  if (sourceLang === targetLang) return text;

  const chunks = splitIntoChunks(text);

  const translated = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await client.text.translate({
        input: chunk,
        source_language_code: sourceLang as any,
        target_language_code: targetLang as any,
        model: "sarvam-translate:v1",
      });

      if (!response?.translated_text) throw new Error("Translation failed");
      return response.translated_text;
    })
  );

  return translated.join(" ");
}
