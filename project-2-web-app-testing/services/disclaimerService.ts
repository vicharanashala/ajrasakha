export const shouldShowDisclaimer = (
  questionTime: Date
): boolean => {
  const currentTime = new Date();

  const difference =
    currentTime.getTime() - questionTime.getTime();

  const twoHours = 2 * 60 * 60 * 1000;

  return difference >= twoHours;
};

export const getDisclaimer = (language: string): string => {
  const disclaimers: Record<string, string> = {
    English:
      "No matching information was found. Please consult an agricultural expert.",

    Hindi:
      "कोई मिलती-जुलती जानकारी नहीं मिली। कृपया कृषि विशेषज्ञ से सलाह लें।",
  };

  return disclaimers[language] || disclaimers["English"];
};