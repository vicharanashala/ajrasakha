import { translateService } from "@/hooks/services/translateService";
import { useCallback, useState } from "react";

export function useTranslate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translate = useCallback(
    async (text: string, targetLang: string) => {
      if (!text.trim()) return null;

      setLoading(true);
      setError(null);

      try {
        const translatedText = await translateService(text, targetLang);
        return translatedText;
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error("Translation error:", err);
        setError(`Failed to translate: ${msg}`);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { translate, loading, error };
}
