import React, { createContext, useContext, useState } from "react";

export type Language = "hi" | "en" | "hinglish";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (hi: string, en: string, hinglish?: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (hi, en, hinglish) => en,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("ajrasakha_lang");
    return (saved === "hi" || saved === "en" || saved === "hinglish") ? (saved as Language) : "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("ajrasakha_lang", lang);
  };

  const t = (hi: string, en: string, hinglish?: string): string => {
    if (language === "hinglish") return hinglish || hi || en;
    if (language === "hi") return hi;
    return en;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
