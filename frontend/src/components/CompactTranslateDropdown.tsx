import { useTranslate } from "@/hooks/api/context/useTranslate";
import { cn } from "@/lib/utils";
import { Languages, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu";

type Language = {
  code: string;
  name: string;
};

type Props = {
  query: string;
  onTranslate: (translatedText: string) => void;
  onError?: (error: string | null) => void;
  sourceLang?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
};

const LANGUAGES: Language[] = [
  { code: "en-IN", name: "English (English)" },
  { code: "default", name: "Default" },
  // { code: "hi-IN", name: "Hindi (हिंदी)" },
  // { code: "bn-IN", name: "Bengali (বাংলা)" },
  // { code: "gu-IN", name: "Gujarati (ગુજરાતી)" },
  // { code: "kn-IN", name: "Kannada (ಕನ್ನಡ)" },
  // { code: "ml-IN", name: "Malayalam (മലയാളം)" },
  // { code: "mr-IN", name: "Marathi (मराठी)" },
  // { code: "od-IN", name: "Odia (ଓଡ଼ିଆ)" },
  // { code: "pa-IN", name: "Punjabi (ਪੰਜਾਬੀ)" },
  // { code: "ta-IN", name: "Tamil (தமிழ்)" },
  // { code: "te-IN", name: "Telugu (తెలుగు)" },
  // { code: "as-IN", name: "Assamese (অসমীয়া)" },
  // { code: "brx-IN", name: "Bodo (बर')" },
  // { code: "doi-IN", name: "Dogri (डोगरी)" },
  // { code: "kok-IN", name: "Konkani (कोंकणी)" },
  // { code: "ks-IN", name: "Kashmiri (کٲشُر)" },
  // { code: "mai-IN", name: "Maithili (मैथिली)" },
  // { code: "mni-IN", name: "Manipuri (Meiteilon) (ꯃꯤꯇꯩꯂꯣꯟ)" },
  // { code: "ne-IN", name: "Nepali (नेपाली)" },
  // { code: "sa-IN", name: "Sanskrit (संस्कृतम्)" },
  // { code: "sat-IN", name: "Santali (ᱥᱟᱱᱛᱟᱲᱤ)" },
  // { code: "sd-IN", name: "Sindhi (سنڌي)" },
  // { code: "ur-IN", name: "Urdu (اردو)" },
];

export default function CompactTranslateDropdown({
  query,
  onTranslate,
  onError,
  sourceLang,
  buttonClassName,
  dropdownClassName,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const { translate, loading, error } = useTranslate();

  useEffect(() => {
    onError?.(error);
  }, [error, onError]);

  const handleSelect = async (lang: Language) => {
    if (!query) return;
    setIsOpen(false);
    if(lang.code === 'default')return onTranslate(query);
    const result = await translate(query, lang.code, sourceLang);
    if (result) {
      onTranslate(result);
    }
  };

  return (
    <div className="relative flex-shrink-0">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={loading}
            title={loading ? "Translating…" : "Translate"}
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-all duration-200 active:scale-90",
              loading
                ? "border-primary/20 bg-primary/5 text-primary cursor-wait"
                : "border-border bg-background text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-accent/50 hover:shadow-md",
              buttonClassName
            )}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Languages size={14} />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={cn(
            "w-48 p-0 max-h-60 overflow-y-auto z-[100] border-border bg-popover shadow-2xl",
            dropdownClassName
          )}
        >
          <div className="px-3 py-2 border-b border-border bg-muted/30 sticky top-0 z-10 backdrop-blur-sm">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Select Language
            </p>
          </div>
          <div className="py-1">
            {LANGUAGES.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onClick={() => handleSelect(lang)}
                className="px-3 py-2 text-xs flex items-center justify-between group cursor-pointer hover:bg-accent"
              >
                <span>{lang.name}</span>
                <span className="opacity-0 group-hover:opacity-100 text-primary text-[9px] uppercase tracking-tight font-bold bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20 transition-all">
                  AI
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
