export function buildBaseQuestionMatch(source?: string) {
  const matchStage: any = {
    $and: [
      {
        isTesting: { $ne: true },
      },
      {
        isOnHold: { $ne: true },
      },
      {
        status: { $nin: ['non_agri'] }
      }
    ],
  };

  if (source) {
    matchStage.source =
      source !== "whatsapp"
        ? "AJRASAKHA"
        : source.toUpperCase();
  }

  return matchStage;
}