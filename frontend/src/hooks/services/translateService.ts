import { SarvamAIClient } from "sarvamai";
import { env } from "@/config/env";

const client = new SarvamAIClient({
  apiSubscriptionKey: env.sarvamApiKey(),
});

const MAX_CHARS = 1900; // stay safely under the 2000 char limit

// Detect language from Unicode script ranges — no API call needed
function detectLangFromScript(text: string): string {
  const sample = text.slice(0, 200);
  if (/[\u0A00-\u0A7F]/.test(sample)) return "pa-IN"; // Gurmukhi (Punjabi)
  if (/[\u0900-\u097F]/.test(sample)) return "hi-IN"; // Devanagari (Hindi/Marathi)
  if (/[\u0980-\u09FF]/.test(sample)) return "bn-IN"; // Bengali
  if (/[\u0C80-\u0CFF]/.test(sample)) return "kn-IN"; // Kannada
  if (/[\u0D00-\u0D7F]/.test(sample)) return "ml-IN"; // Malayalam
  if (/[\u0B80-\u0BFF]/.test(sample)) return "ta-IN"; // Tamil
  if (/[\u0C00-\u0C7F]/.test(sample)) return "te-IN"; // Telugu
  if (/[\u0A80-\u0AFF]/.test(sample)) return "gu-IN"; // Gujarati
  if (/[\u0B00-\u0B7F]/.test(sample)) return "od-IN"; // Odia
  return "en-IN"; // default to English
}

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
  targetLang: string,
  sourceLang?: string
): Promise<string> {
  // Use provided sourceLang, or detect from Unicode script ranges (no API call)
  const resolvedSourceLang = sourceLang ?? detectLangFromScript(text);

  // If source and target are the same, return as-is
  if (resolvedSourceLang === targetLang) return text;

  const chunks = splitIntoChunks(text);

  const translated = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await client.text.translate({
        input: chunk,
        source_language_code: resolvedSourceLang as any,
        target_language_code: targetLang as any,
        model: "sarvam-translate:v1",
      });

      if (!response?.translated_text) throw new Error("Translation failed");
      return response.translated_text;
    })
  );

  return translated.join(" ");
}
