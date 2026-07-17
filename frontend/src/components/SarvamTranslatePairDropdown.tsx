import { useTranslate } from "@/hooks/api/context/useTranslate";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  { code: "gu-IN", name: "Gujarati (ગુજરાਤੀ)" },
  { code: "kn-IN", name: "Kannada (ಕನ್ನಡ)" },
  { code: "ml-IN", name: "Malayalam (മലയാളം)" },
  { code: "mr-IN", name: "Marathi (मराठी)" },
  { code: "od-IN", name: "Odia (ଓଡ଼ିଆ)" },
  { code: "pa-IN", name: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "ta-IN", name: "Tamil (தமிழ்)" },
  { code: "te-IN", name: "Telugu (తెలుగు)" },
  { code: "as-IN", name: "Assamese (অસમীয়া)" },
  { code: "brx-IN", name: "Bodo (बर')" },
  { code: "doi-IN", name: "Dogri (डोगरी)" },
  { code: "kok-IN", name: "Konkani (कोंकणी)" },
  { code: "ks-IN", name: "Kashmiri (کٲशُر)" },
  { code: "mai-IN", name: "Maithili (मैथिली)" },
  { code: "mni-IN", name: "Manipuri (Meiteilon) (ꯃꯤꯇꯩꯂꯣﻥ)" },
  { code: "ne-IN", name: "Nepali (नेपाली)" },
  { code: "sa-IN", name: "Sanskrit (संस्कृतम्)" },
  { code: "sat-IN", name: "Santali (ᱥａｎｔａᱲｉ)" },
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
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState<Language | null>(null);
  const { translate, loading, error } = useTranslate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset selected language when queries change
  useEffect(() => {
    setSelectedLang(null);
  }, [query1, query2]);

  const handleSelect = async (lang: Language) => {
    if (!query1 && !query2) return;

    setIsOpen(false);
    setSelectedLang(lang);
    if (lang.code === "default") {
      onTranslate(query1, query2);
      return;
    }

    try {
      if (onTranslateStart) onTranslateStart();
      // Add artificial delay for testing visual loaders (2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2000));
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

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => !loading && setIsOpen((prev) => !prev)}
        disabled={loading}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 shadow-sm border
          ${
            loading
              ? "bg-primary/5 text-primary border-primary/20 cursor-wait"
              : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-accent/50 hover:shadow-md active:scale-95"
          }`}
      >
        {loading ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            <span className="text-primary text-[10px]">Translating...</span>
          </>
        ) : (
          <>
            <Sparkles
              size={12}
              className="text-primary"
            />
            <span>
              {selectedLang
                ? `${selectedLang.name}`
                : "Translate"}
            </span>
            <ChevronDown
              size={10}
              className={`transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-popover text-popover-foreground rounded-lg shadow-xl border border-border z-50 backdrop-blur-sm">
          <div className="px-2.5 py-1.5 border-b border-border bg-muted/30">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
              Select Language
            </p>
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang)}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground/80 hover:bg-accent hover:text-primary flex items-center justify-between group transition-colors"
              >
                <span>{lang.name}</span>
                <span className="opacity-0 group-hover:opacity-100 text-primary text-[9px] uppercase tracking-tight font-bold bg-primary/10 px-1 py-0.5 rounded-full border border-primary/20 transition-all">
                  AI
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}
