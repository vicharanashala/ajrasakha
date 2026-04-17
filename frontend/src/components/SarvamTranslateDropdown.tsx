import { useTranslate } from "@/hooks/api/context/useTranslate";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Language = {
  code: string;
  name: string;
};

type Props = {
  query: string;
  onTranslate: (translatedText: string) => void;
  sourceLang?: string;
};

const LANGUAGES: Language[] = [
  { code: "en-IN", name: "English (English)" },
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
  { code: "mni-IN", name: "Manipuri (Meiteilon) (ꯃꯤꯇꯩꯂꯣꯟ)" },
  { code: "ne-IN", name: "Nepali (नेपाली)" },
  { code: "sa-IN", name: "Sanskrit (संस्कृतम्)" },
  { code: "sat-IN", name: "Santali (ᱥᱟᱱᱛᱟᱲᱤ)" },
  { code: "sd-IN", name: "Sindhi (سنڌي)" },
  { code: "ur-IN", name: "Urdu (اردو)" },
];

export default function SarvamTranslateDropdown({ query, onTranslate, sourceLang }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState<Language | null>(null);
  const {translate, loading, error} = useTranslate();
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

  // Reset selected language when query changes
  useEffect(() => {
    setSelectedLang(null);
  }, [query]);

  const handleSelect = async (lang: Language) => {
    if (!query) return;

    setIsOpen(false);
    setSelectedLang(lang);

    const result = await translate(query, lang.code, sourceLang);
    if (result) {
      onTranslate(result);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => !loading && setIsOpen((prev) => !prev)}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm border
          ${
            loading
              ? "bg-primary/5 text-primary border-primary/20 cursor-wait"
              : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-accent/50 hover:shadow-md active:scale-95"
          }`}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span className="text-primary">Translating...</span>
          </>
        ) : (
          <>
            <Sparkles
              size={16}
              className="text-primary"
            />
            <span>
              {selectedLang
                ? `${selectedLang.name}`
                : "Translate"}
            </span>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-popover text-popover-foreground rounded-xl shadow-2xl border border-border z-50 backdrop-blur-sm">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Select Language
            </p>
          </div>
          <div className="max-h-60 overflow-y-auto py-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang)}
                className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-accent hover:text-primary flex items-center justify-between group transition-colors"
              >
                <span>{lang.name}</span>
                <span className="opacity-0 group-hover:opacity-100 text-primary text-[10px] uppercase tracking-tight font-bold bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20 transition-all">
                  AI
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}