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
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm border
          ${
            loading
              ? "bg-indigo-50 text-indigo-400 border-indigo-100 cursor-wait"
              : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50"
          }`}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span className="text-indigo-600">Translating...</span>
          </>
        ) : (
          <>
            <Sparkles
              size={16}
              className={
                selectedLang ? "text-indigo-600" : "text-yellow-500"
              }
            />
            <span className={selectedLang ? "text-indigo-900" : ""}>
              {selectedLang
                ? `Translated to ${selectedLang.name}`
                : "Translate Query"}
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
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2">
          <div className="px-3 py-2 border-b border-gray-50 mb-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Select Language
            </p>
          </div>

          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang)}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-between group transition-colors"
            >
              <span>{lang.name}</span>
              <span className="opacity-0 group-hover:opacity-100 text-indigo-500 text-xs font-medium bg-indigo-100 px-1.5 py-0.5 rounded">
                AI
              </span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 mt-2">{error}</p>
      )}
    </div>
  );
}