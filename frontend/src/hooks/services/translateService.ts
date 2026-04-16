import { SarvamAIClient } from "sarvamai";
import { env } from "@/config/env";

const client = new SarvamAIClient({
  apiSubscriptionKey: env.sarvamApiKey(),
});

const MAX_CHARS = 1900; // stay safely under the 2000 char limit

/**
 * Normalize literal escape sequences (\n, \t) into real characters,
 * and strip markdown formatting so the translation API gets clean plain text.
 */
function cleanForTranslation(text: string): string {
  return text
    // Convert literal \n (backslash + n) into real newlines
    .replace(/\\n/g, '\n')
    // Convert literal \t into real tabs
    .replace(/\\t/g, '\t')
    // Strip markdown bold
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    // Strip markdown italic
    .replace(/\*([^*]+)\*/g, '$1')
    // Strip markdown links → keep label
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Strip headings
    .replace(/^#{1,6}\s+/gm, '')
    // Strip table pipes
    .replace(/\|/g, ' ')
    // Strip horizontal rules
    .replace(/^---+$/gm, '')
    // Collapse excessive whitespace / newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Detect the source language LOCALLY by checking Unicode script ranges.
 * This avoids the flaky Sarvam text-lid API entirely.
 *
 * Works by counting characters in each script range and picking the
 * dominant non-Latin script. Falls back to "en-IN" for Latin-only text.
 */
function detectLanguageLocally(text: string): string {
  const scripts: Record<string, { regex: RegExp; lang: string }> = {
    gurmukhi:   { regex: /[\u0A00-\u0A7F]/g, lang: 'pa-IN' },  // Punjabi
    devanagari: { regex: /[\u0900-\u097F]/g, lang: 'hi-IN' },  // Hindi
    bengali:    { regex: /[\u0980-\u09FF]/g, lang: 'bn-IN' },  // Bengali
    gujarati:   { regex: /[\u0A80-\u0AFF]/g, lang: 'gu-IN' },  // Gujarati
    kannada:    { regex: /[\u0C80-\u0CFF]/g, lang: 'kn-IN' },  // Kannada
    malayalam:  { regex: /[\u0D00-\u0D7F]/g, lang: 'ml-IN' },  // Malayalam
    tamil:      { regex: /[\u0B80-\u0BFF]/g, lang: 'ta-IN' },  // Tamil
    telugu:     { regex: /[\u0C00-\u0C7F]/g, lang: 'te-IN' },  // Telugu
    odia:       { regex: /[\u0B00-\u0B7F]/g, lang: 'od-IN' },  // Odia
    marathi:    { regex: /[\u0900-\u097F]/g, lang: 'mr-IN' },  // Marathi (also Devanagari)
    urdu:       { regex: /[\u0600-\u06FF]/g, lang: 'ur-IN' },  // Urdu (Arabic script)
    assamese:   { regex: /[\u0980-\u09FF]/g, lang: 'as-IN' },  // Assamese (also Bengali script)
  };

  let maxCount = 0;
  let detectedLang = 'en-IN';

  // Use a sample of the text for faster detection
  const sample = text.slice(0, 500);

  for (const [, { regex, lang }] of Object.entries(scripts)) {
    const matches = sample.match(regex);
    const count = matches ? matches.length : 0;
    if (count > maxCount) {
      maxCount = count;
      detectedLang = lang;
    }
  }

  return detectedLang;
}

function splitIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_CHARS) {
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
  // Clean the text: convert literal \n to real newlines, strip markdown
  const cleanText = cleanForTranslation(text);

  if (!cleanText.trim()) throw new Error("Nothing to translate");

  // Detect source language LOCALLY using Unicode script detection
  // (avoids the flaky Sarvam text-lid API that returns 500 errors)
  const sourceLang = detectLanguageLocally(cleanText);

  // If source and target are the same, return as-is
  if (sourceLang === targetLang) return text;

  // Translate in chunks
  const chunks = splitIntoChunks(cleanText);

  const translated = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await client.text.translate({
        input: chunk,
        source_language_code: sourceLang as any,
        target_language_code: targetLang as any,
        model: "sarvam-translate:v1",
      });

      if (!response?.translated_text) throw new Error("Empty translation response");
      return response.translated_text;
    })
  );

  return translated.join(" ");
}
