import { env } from "@/config/env";
import { apiFetch } from "@/hooks/api/api-fetch";

const MAX_CHARS = 1900;

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
  targetLang: string,
  sourceLang?: string,
): Promise<string> {
  if (!text.trim()) return text;

  const chunks = splitIntoChunks(text);

  const translated = await Promise.all(
    chunks.map(async (chunk) => {
      const res = await apiFetch<{ translated_text: string }>(
        `${env.apiBaseUrl()}/context/translate`,
        { method: "POST", body: JSON.stringify({ text: chunk, targetLang, sourceLang }) },
      );
      if (!res?.translated_text) throw new Error("Empty translation response");
      return res.translated_text;
    }),
  );

  return translated.join(" ");
}
