  import type { ReviewRow } from "../components/review-level/reviewLevel.coloumn";
  import type { ReviewLevelQuestion} from "../types";

  export function mapReviewQuestionToRow(
    q: ReviewLevelQuestion
  ): ReviewRow {
    return {
      _id: q._id,
      question: q.question,
      status: q.status,
      moderatorAssignedAt: q.moderatorAssignedAt ?? null,
      updatedAt: q.updatedAt ?? null,
      isDuplicate: Boolean(
        q.similarityScore &&
        q.referenceQuestionId &&
        q.referenceQuestion &&
        q.referenceSource
      ),
      levels: q.reviewLevels.map(l =>
      l.value === "NA"
        ? "NA"
        : {
            time: l.value.time,
            yet_to_complete: l.value.yet_to_complete,
          }
    ),
    };
  }
