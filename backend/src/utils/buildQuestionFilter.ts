
import { GetDetailedQuestionsQuery } from "#root/modules/question/classes/validators/QuestionVaidators.js";
import { ObjectId } from "mongodb";

export const buildQuestionFilter = async (
  query: GetDetailedQuestionsQuery & { searchEmbedding: number[] | null },
  QuestionSubmissionCollection,AnswersCollection
) => {

  const filter: any = {};

  const caseInsensitive = (field: string, value?: string) => {
    if (value && value !== "all") {
      filter[field] = { $regex: `^${value}$`, $options: "i" };
    }
  };

  const {
    status,
    source,
    state,
    crop,
    priority,
    domain,
    answersCountMin,
    answersCountMax,
    startTime,
    endTime,
    dateRange,
    closedAtStart,
    closedAtEnd,
    user,
    review_level,
    consecutiveApprovals
  } = query;

  caseInsensitive("status", status);
  caseInsensitive("source", source);
  caseInsensitive("priority", priority);
  caseInsensitive("details.state", state);
  caseInsensitive("details.crop", crop);
  caseInsensitive("details.domain", domain);

  if (answersCountMin !== undefined || answersCountMax !== undefined) {
    filter.totalAnswersCount = {};
    if (answersCountMin !== undefined) filter.totalAnswersCount.$gte = answersCountMin;
    if (answersCountMax !== undefined) filter.totalAnswersCount.$lte = answersCountMax;
  }

  if (startTime || endTime) {
    const date: any = {};
    if (startTime) date.$gte = new Date(`${startTime}T00:00:00.000+05:30`);
    if (endTime) date.$lte = new Date(`${endTime}T23:59:59.999+05:30`);
    filter.createdAt = date;
  }

  else if (dateRange && dateRange !== "all") {
    const now = new Date();
    const ranges: Record<string, () => Date> = {
      today: () => new Date(now.setHours(0, 0, 0, 0)),
      week: () => new Date(now.setDate(now.getDate() - 7)),
      month: () => new Date(now.setMonth(now.getMonth() - 1)),
      quarter: () => new Date(now.setMonth(now.getMonth() - 3)),
      year: () => new Date(now.setFullYear(now.getFullYear() - 1)),
    };

    const startDate = ranges[dateRange]?.();
    if (startDate) filter.createdAt = { $gte: startDate };
  }

  else if (closedAtStart || closedAtEnd) {
    const closed: any = {};
    if (closedAtStart) closed.$gte = new Date(`${closedAtStart}T00:00:00.000+05:30`);
    if (closedAtEnd) closed.$lte = new Date(`${closedAtEnd}T23:59:59.999+05:30`);
    filter.closedAt = closed;
  }

  if (user && user !== "all") {
    const submissions = await QuestionSubmissionCollection
      .find({ "history.updatedBy": new ObjectId(user) })
      .project({ questionId: 1 })
      .toArray();

    const ids = submissions.map(s => s.questionId);

    if (!ids.length) return { filter: { _id: { $in: [] } } };

    filter._id = { $in: ids };
  }

  if (review_level && review_level !== "all") {
    const numericLevel = parseInt(review_level.replace("Level ", "").trim());

    if (!isNaN(numericLevel)) {
      const requiredSize = numericLevel + 1;

      const submissions = await QuestionSubmissionCollection
        .find({ history: { $size: requiredSize } })
        .project({ questionId: 1 })
        .toArray();

      const ids = submissions.map(s => s.questionId);

      if (!ids.length) return { filter: { _id: { $in: [] } } };

      filter._id = filter._id
        ? { $in: ids.filter(x => filter._id.$in.some(y => y.equals(x))) }
        : { $in: ids };
    }
  }
  const approvalCount =
  consecutiveApprovals && consecutiveApprovals !== 'all'
    ? parseInt(consecutiveApprovals, 10)
    : null;
    // --- Consecutive Approvals Filter ---
if (approvalCount !== null && !isNaN(approvalCount)) {
  const answers = await AnswersCollection.find({
    approvalCount: approvalCount,
  })
    .project({ questionId: 1 })
    .toArray();

  const approvalFilteredIds = answers.map(a =>
    a.questionId.toString(),
  );

  if (approvalFilteredIds.length === 0) {
    return { questions: [], totalPages: 0, totalCount: 0 };
  }

  // Intersect with existing _id filter if present
  if (filter._id) {
    filter._id = {
      $in: approvalFilteredIds
        .map(id => new ObjectId(id))
        .filter(id =>
          filter._id.$in.some((existing: any) => existing.equals(id)),
        ),
    };
  } else {
    filter._id = {
      $in: approvalFilteredIds.map(id => new ObjectId(id)),
    };
  }
}

  return { filter };
};