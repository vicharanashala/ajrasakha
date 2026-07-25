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
    if (source === 'both') {
      matchStage.source = { $in: ['WHATSAPP', 'AJRASAKHA'] };
    } else if (source.includes(',')) {
      const sourcesArray = source.split(',').map(s => {
        const lower = s.trim().toLowerCase();
        return (lower === "annam" || lower === "web application") ? "AJRASAKHA" : s.trim().toUpperCase();
      });
      matchStage.source = { $in: sourcesArray };
    } else {
      const lower = source.toLowerCase();
      matchStage.source = 
        (lower === "annam" || lower === "web application") 
          ? "AJRASAKHA" 
          : source.toUpperCase();
    }
  }

  return matchStage;
}