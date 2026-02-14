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

export default function SarvamTranslateDropdown({ query, onTranslate }: Props) {
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

    const result = await translate(query, lang.code);
    if (result) {
      onTranslate(result);
    }
  };

  return (
    <div ref={dropdownRef} className="relative z-10">
      <button
        onClick={() => !loading && setIsOpen((prev) => !prev)}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-1 rounded-md text-sm font-medium transition-all duration-200 shadow-sm border
          ${
            loading
              ? "bg-indigo-50 text-primary border-primary/30 cursor-wait"
              : "bg-white text-gray-700 border-primary/30 hover:border-primary hover:bg-primary/5 transition-all"
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
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100">
          <div className="px-3 py-2 border-b border-gray-100 bg-white">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Select Language
            </p>
          </div>
          <div className="max-h-60 overflow-y-auto py-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang)}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-primary flex items-center justify-between group transition-colors"
              >
                <span>{lang.name}</span>
                <span className="opacity-0 group-hover:opacity-100 text-primary text-xs font-medium bg-indigo-100 px-1.5 py-0.5 rounded">
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