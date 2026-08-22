import { useTranslate } from "@/hooks/api/context/useTranslate";
import { ChevronDown, Loader2, Sparkles, Check } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./atoms/dropdown-menu";

type Language = {
  code: string;
  name: string;
};

type Props = {
  query1: string;
  query2: string;
  onTranslate: (translatedText1: string, translatedText2: string) => void;
  sourceLang?: string;
  onTranslateStart?: () => void;
  onTranslateEnd?: () => void;
};

const LANGUAGES: Language[] = [
  { code: "en-IN", name: "English (English)" },
  { code: "default", name: "Default" },
  { code: "hi-IN", name: "Hindi (हिंदी)" },
  { code: "bn-IN", name: "Bengali (বাংলা)" },
  { code: "gu-IN", name: "Gujarati (ગુજરાતી)" },
  { code: "kn-IN", name: "Kannada (ಕನ್ನಡ)" },
  { code: "ml-IN", name: "Malayalam (മലയാളം)" },
  { code: "mr-IN", name: "Marathi (मराठी)" },
  { code: "od-IN", name: "Odia (ଓଡ଼ିଆ)" },
  { code: "pa-IN", name: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "ta-IN", name: "Tamil (தமிழ்)" },
  { code: "te-IN", name: "Telugu (తెలుగు)" },
  { code: "as-IN", name: "Assamese (অসমীয়া)" },
  { code: "brx-IN", name: "Bodo (बर')" },
  { code: "doi-IN", name: "Dogri (डोगरी)" },
  { code: "kok-IN", name: "Konkani (कोंकणी)" },
  { code: "ks-IN", name: "Kashmiri (کٲشُر)" },
  { code: "mai-IN", name: "Maithili (मैथिली)" },
  { code: "mni-IN", name: "Manipuri (Meiteilon) (ꯃꯤꯇꯩꯂꯣﻥ)" },
  { code: "ne-IN", name: "Nepali (नेपाली)" },
  { code: "sa-IN", name: "Sanskrit (संस्कृतम्)" },
  { code: "sat-IN", name: "Santali (ᱥᱟᱱᱛᱟᱲᱤ)" },
  { code: "sd-IN", name: "Sindhi (سنڌي)" },
  { code: "ur-IN", name: "Urdu (اردو)" },
];

export default function SarvamTranslatePairDropdown({
  query1,
  query2,
  onTranslate,
  sourceLang,
  onTranslateStart,
  onTranslateEnd,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState<Language | null>(null);
  const { translate, loading, error } = useTranslate();

  // Reset selected language when queries change
  useEffect(() => {
    setSelectedLang(null);
  }, [query1, query2]);

  const handleSelect = async (lang: Language) => {
    if (!query1 && !query2) return;

    setOpen(false);
    setSelectedLang(lang);
    if (lang.code === "default") {
      onTranslate(query1, query2);
      return;
    }

    try {
      if (onTranslateStart) onTranslateStart();
      // Translate both queries in parallel
      const [res1, res2] = await Promise.all([
        query1.trim() ? translate(query1, lang.code, sourceLang) : Promise.resolve(null),
        query2.trim() ? translate(query2, lang.code, sourceLang) : Promise.resolve(null),
      ]);
      onTranslate(res1 || query1, res2 || query2);
    } catch (err) {
      console.error("Failed to translate pair", err);
    } finally {
      if (onTranslateEnd) onTranslateEnd();
    }
  };

  // Get concise display name for selected language (e.g., "Hindi" instead of "Hindi (हिंदी)")
  const displayLangName = selectedLang
    ? (selectedLang.name.includes(" (") ? selectedLang.name.split(" (")[0] : selectedLang.name)
    : "Translate";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={loading}
          title={selectedLang ? `Translating in ${selectedLang.name}` : "Translate question & answer"}
          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border shrink-0 cursor-pointer shadow-xs
            ${
              loading
                ? "bg-primary/10 text-primary border-primary/30 cursor-wait"
                : open
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                  : "bg-zinc-100/90 hover:bg-zinc-200/90 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 border-zinc-200/90 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 active:scale-95"
            }`}
        >
          {loading ? (
            <>
              <Loader2 size={12} className="animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-emerald-700 dark:text-emerald-300 text-xs whitespace-nowrap">Translating...</span>
            </>
          ) : (
            <>
              <Sparkles
                size={12}
                className="text-emerald-600 dark:text-emerald-400 shrink-0"
              />
              <span className="truncate max-w-[80px] whitespace-nowrap">
                {displayLangName}
              </span>
              <ChevronDown
                size={12}
                className={`transition-transform duration-200 shrink-0 text-zinc-400 dark:text-zinc-500 ${
                  open ? "rotate-180 text-emerald-600 dark:text-emerald-400" : ""
                }`}
              />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-56 p-1.5 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md shadow-2xl z-50 text-zinc-900 dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2.5 py-1.5 mb-1 border-b border-zinc-100 dark:border-zinc-850">
          <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            Select Language
          </p>
        </div>
        <div className="space-y-0.5">
          {LANGUAGES.map((lang) => {
            const isSelected = selectedLang?.code === lang.code;
            return (
              <DropdownMenuItem
                key={lang.code}
                onClick={() => handleSelect(lang)}
                className={`w-full px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold"
                    : "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="truncate">{lang.name}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                </div>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
      {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
    </DropdownMenu>
  );
}
