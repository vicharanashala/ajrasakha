export interface LanguageOption {
  code: string;
  name: string;
}

export const SARVAM_LANGUAGES: LanguageOption[] = [
  { code: "en-IN", name: "English" },
  { code: "hi-IN", name: "Hindi" },
  { code: "mr-IN", name: "Marathi" },
  { code: "te-IN", name: "Telugu" },
  { code: "ta-IN", name: "Tamil" },
  { code: "kn-IN", name: "Kannada" },
  { code: "bn-IN", name: "Bengali" },
  { code: "gu-IN", name: "Gujarati" },
  { code: "ml-IN", name: "Malayalam" },
  { code: "pa-IN", name: "Punjabi" },
  { code: "od-IN", name: "Odia" },
  { code: "as-IN", name: "Assamese" },
  { code: "ur-IN", name: "Urdu" },
  { code: "sa-IN", name: "Sanskrit" },
  { code: "ne-IN", name: "Nepali" },
  { code: "kok-IN", name: "Konkani" },
  { code: "ks-IN", name: "Kashmiri" },
  { code: "doi-IN", name: "Dogri" },
  { code: "mai-IN", name: "Maithili" },
  { code: "mni-IN", name: "Manipuri" },
  { code: "sat-IN", name: "Santali" },
  { code: "sd-IN", name: "Sindhi" },
  { code: "brx-IN", name: "Bodo" },
];

/**
 * Returns a human-friendly language name from an ISO language code.
 */
export function getLanguageName(code?: string | null): string {
  if (!code) return "Unknown";
  const normalized = code.trim().toLowerCase();
  const baseCode = normalized.split("-")[0];

  const found = SARVAM_LANGUAGES.find(
    (l) =>
      l.code.toLowerCase() === normalized ||
      l.code.split("-")[0].toLowerCase() === baseCode
  );

  if (found) return found.name;
  if (normalized === "auto") return "Auto";
  if (normalized === "unknown") return "Auto";
  return code;
}

/**
 * Detect language from text using Unicode character block analysis and optional STT hint.
 * Operates purely on the client without calling any external API or endpoint.
 */
export function detectLanguageFromText(
  text: string,
  sttHint?: string | null
): string {
  const clean = text?.trim();
  if (!clean) return "auto";

  // Check Unicode ranges for Indic scripts:

  // 1. Devanagari (\u0900-\u097F): Hindi, Marathi, Sanskrit, Nepali, Maithili, etc.
  if (/[\u0900-\u097F]/.test(clean)) {
    // If STT detected Marathi, or text has Marathi distinctive character ळ (\u0933)
    if (sttHint === "mr-IN" || /[\u0933]/.test(clean)) {
      return "mr-IN";
    }
    // If STT hint is another Devanagari language, respect it
    if (
      sttHint &&
      ["hi-IN", "mr-IN", "sa-IN", "ne-IN", "mai-IN", "kok-IN", "doi-IN", "brx-IN"].includes(
        sttHint
      )
    ) {
      return sttHint;
    }
    return "hi-IN";
  }

  // 2. Bengali / Assamese (\u0980-\u09FF)
  if (/[\u0980-\u09FF]/.test(clean)) {
    if (sttHint === "as-IN" || /[\u09F0\u09F1]/.test(clean)) return "as-IN";
    return "bn-IN";
  }

  // 3. Gurmukhi / Punjabi (\u0A00-\u0A7F)
  if (/[\u0A00-\u0A7F]/.test(clean)) return "pa-IN";

  // 4. Gujarati (\u0A80-\u0AFF)
  if (/[\u0A80-\u0AFF]/.test(clean)) return "gu-IN";

  // 5. Odia (\u0B00-\u0B7F)
  if (/[\u0B00-\u0B7F]/.test(clean)) return "od-IN";

  // 6. Tamil (\u0B80-\u0BFF)
  if (/[\u0B80-\u0BFF]/.test(clean)) return "ta-IN";

  // 7. Telugu (\u0C00-\u0C7F)
  if (/[\u0C00-\u0C7F]/.test(clean)) return "te-IN";

  // 8. Kannada (\u0C80-\u0CFF)
  if (/[\u0C80-\u0CFF]/.test(clean)) return "kn-IN";

  // 9. Malayalam (\u0D00-\u0D7F)
  if (/[\u0D00-\u0D7F]/.test(clean)) return "ml-IN";

  // 10. Perso-Arabic / Urdu (\u0600-\u06FF)
  if (/[\u0600-\u06FF]/.test(clean)) {
    if (sttHint && ["ur-IN", "ks-IN", "sd-IN"].includes(sttHint)) return sttHint;
    return "ur-IN";
  }

  // 11. Latin / English - check if text contains Latin letters without Indic scripts
  if (/[a-zA-Z]/.test(clean)) {
    return "en-IN";
  }

  // Fallback to STT hint if present, else auto
  return sttHint && sttHint !== "unknown" ? sttHint : "auto";
}
