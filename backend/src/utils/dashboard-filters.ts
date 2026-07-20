export function buildBaseQuestionMatch(source?: string,isTrainingQuestion?: boolean) {
  const matchStage: any = {
    $and: [
      {
        isTesting: { $ne: true },
        isTrainingQuestion: isTrainingQuestion === true ? true : { $ne: true },
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