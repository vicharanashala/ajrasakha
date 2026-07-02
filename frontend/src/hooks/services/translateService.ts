import { env } from "@/config/env";
import { apiFetch } from "@/hooks/api/api-fetch";

const MAX_TOTAL_CHARS = 30_000;

export async function translateService(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<string> {
  if (!text.trim()) return text;
  if (text.length > MAX_TOTAL_CHARS)
    throw new Error(`Text is too long to translate (max ${MAX_TOTAL_CHARS} characters)`);

  const res = await apiFetch<{ translated_text: string }>(
    `${env.apiBaseUrl()}/context/translate`,
    { method: "POST", body: JSON.stringify({ text, targetLang, sourceLang }) },
  );

  if (!res?.translated_text) throw new Error("Empty translation response");
  return res.translated_text;
}
