export function buildBaseQuestionMatch(source?: string, isTrainingQuestion?: boolean) {
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
    if (source === 'both') {
      matchStage.source = { $in: ['WHATSAPP', 'AJRASAKHA'] };
    } else if (source.includes(',')) {
      const sourcesArray = source.split(',').map(s => {
        const lower = s.trim().toLowerCase();
        // Handle special case mappings
        if (lower === "annam" || lower === "web application") return "AJRASAKHA";
        if (lower === "question_collection") return "QUESTION_COLLECTION";
        return s.trim().toUpperCase();
      });
      matchStage.source = { $in: sourcesArray };
    } else {
      const lower = source.toLowerCase();
      // Handle special case mappings
      if (lower === "annam" || lower === "web application") {
        matchStage.source = "AJRASAKHA";
      } else if (lower === "question_collection") {
        matchStage.source = "QUESTION_COLLECTION";
      } else {
        matchStage.source = source.toUpperCase();
      }
    }
  }

  return matchStage;
}