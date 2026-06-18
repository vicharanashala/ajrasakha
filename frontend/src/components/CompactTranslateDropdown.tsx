import { useTranslate } from "@/hooks/api/context/useTranslate";
import { cn } from "@/lib/utils";
import { Languages, Loader2 } from "lucide-react";
import { useEffect } from "react";

type Props = {
  query: string;
  onTranslate: (translatedText: string) => void;
  onError?: (error: string | null) => void;
  sourceLang?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  disabled?: boolean;
};

const ENGLISH_TARGET_LANG = "en-IN";

export default function CompactTranslateDropdown({
  query,
  onTranslate,
  onError,
  sourceLang,
  buttonClassName,
  disabled = false,
}: Props) {
  const { translate, loading, error } = useTranslate();

  useEffect(() => {
    onError?.(error);
  }, [error, onError]);

  const handleTranslate = async () => {
    if (!query.trim() || disabled || loading) return;

    const result = await translate(query, ENGLISH_TARGET_LANG, sourceLang);
    if (result) {
      onTranslate(result);
    }
  };

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        disabled={loading || disabled}
        onClick={handleTranslate}
        title={loading ? "Translating to English..." : "Translate to English"}
        className={cn(
          "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-all duration-200 active:scale-95",
          loading
            ? "border-primary/20 bg-primary/5 text-primary cursor-wait"
            : "border-border bg-background text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-accent/50 hover:shadow-md",
          disabled &&
            "cursor-not-allowed opacity-50 hover:border-border hover:bg-background hover:text-muted-foreground hover:shadow-none",
          buttonClassName,
        )}
      >
        {loading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            <span>Translating</span>
          </>
        ) : (
          <>
            <Languages size={14} />
            <span>Translate to English</span>
          </>
        )}
      </button>
    </div>
  );
}
