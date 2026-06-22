export function buildBaseQuestionMatch(source?: string) {
  const matchStage: any = {
    $and: [
      {
        isTesting: { $ne: true },
      },
      {
        status: { $nin: ['non_agri'] }
      }
    ],
  };

  if (source) {
    matchStage.source =
      source.toLowerCase() !== "whatsapp"
        ? "AJRASAKHA"
        : source.toUpperCase();
  }

  return matchStage;
}