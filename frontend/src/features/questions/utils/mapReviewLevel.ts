import type { ReviewRow } from "../components/review-level/reviewLevel.coloumn";
import type { ReviewLevelQuestion, ReviewLevelValue } from "../types";


function formatLevelValue(value: ReviewLevelValue) {
  if (value === "NA") return "NA";
  return value.time ?? "NA";
}

export function mapReviewQuestionToRow(
  q: ReviewLevelQuestion
): ReviewRow {
  return {
    question: q.question,

    // convert reviewLevels[] → levels[]
    levels: q.reviewLevels.map(l => formatLevelValue(l.value)),
  };
}
