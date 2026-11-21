export const supportedLanguages = [
  "English",
  "Hindi",
];

export const isLanguageSupported = (
  language: string
): boolean => {
  return supportedLanguages.includes(language);
};

export const getResponseLanguage = (
  language: string
): string => {
  return isLanguageSupported(language) ? language : "English";
};