import { ObjectId, ClientSession } from 'mongodb';
import { IQuestion, QuestionStatus } from '#root/shared/interfaces/models.js';
import { AiService } from '#root/modules/ai/services/AiService.js';
import { IDuplicateQuestionRepository } from '#root/shared/database/interfaces/IDuplicateQuestionRepository.js';
import { chatbotSimilarityLogger } from '../logger/chatbot-similarity.logger.js';
import { checkConceptDuplicate } from '#root/modules/question/aiservice/checkConceptDuplicate.js';

export async function checkDuplicateQuestionHelper(
  baseQuestion: IQuestion,
  details: IQuestion['details'],
  logData: Record<string, any>,
  aiService: AiService,
  duplicateQuestionRepository: IDuplicateQuestionRepository,
  session?: ClientSession,
  fromOutReach?: boolean,
): Promise<{ isDuplicate: boolean; duplicateData?: any; isNonAgri?: boolean; nonAgriData?: any }> {
  const cropName = typeof details.crop === 'string' ? details.crop : details.crop?.name || '';

  const questions = await aiService.getQuestionByContextAndMetaData(
    baseQuestion.question,
    details.state,
    details.district,
    cropName,
  );
  // merge reviewer + golden
  let merged = [
    ...(questions.reviewer || []).map((item: any) => ({
      question: item.question,
      answer: item.answer,
      agri_specialist: item.source || "AGRI_EXPERT",
      referenceSource: "reviewer",
      score: item.score * 100,
      id: new ObjectId(String(item.id)),
    }))
   /* ...(questions.golden || []).map((item: any) => ({
      question: item.question,
      answer: item.answer,
      agri_specialist: item.metadata?.["Agri Specialist"] || "Unknown",
      referenceSource: "golden",
      score: item.score * 100,
      id: item.id
        ? new ObjectId(String(item.id))
        : new ObjectId()
    })),*/
  ];

  merged = Array.from(
    new Map(merged.map(q => [q.question, q])).values(),
  ).map(q => ({ ...q }));

  merged.sort((a, b) => b.score - a.score);

  const bestFive = merged.slice(0, 5);

  const topSimilar = bestFive.map(q => ({
    questionId: q.id,
    question: q.question,
    similarityScore: q.score,
    referenceSource: q.referenceSource
  }));

  logData.totalMatches = topSimilar.length;
  logData.matches = topSimilar.map((q) => ({
    questionId: q.questionId,
    question: q.question,
    similarityScore: q.similarityScore,
  }));
  logData.topMatches = topSimilar;
  logData.threshold = 85;

  let isDuplicate = false;
  let matchedQuestion = '';
  let matchedQuestionId: ObjectId | null = null;
  let matchedScore = 0;
  let referenceSourcefrom = '';

  const llmCandidates: typeof topSimilar = [];

  for (const match of topSimilar) {
    const highestScore = match.similarityScore;

    // Rule 1: immediate duplicate (>=95) — trust the embedding match, no LLM call.
    if (highestScore >= 95) {
      isDuplicate = true;
      matchedQuestion = match.question;
      matchedQuestionId = match.questionId;
      matchedScore = highestScore;
      referenceSourcefrom = match.referenceSource;
      break;
    }

    // Rule 2: collect mid-score (85-95) candidates for LLM comparison.
    if (highestScore >= 85 && highestScore < 95) {
      llmCandidates.push(match);
    }
  }

  // Rule 3: single combined LLM call.
  // When there is NO immediate >=95 duplicate, call the LLM once. It returns
  // one of three outcomes in a single round-trip (saves LLM cost vs. two calls):
  //   - non-agri (greeting/smalltalk/unrelated) → mark status='non_agri'
  //   - duplicate of candidate N → mark status='duplicate'
  //   - neither → leave as a normal open question
  // We still call this LLM when llmCandidates is empty, because pure non-agri
  // inputs (like "hi") rarely produce any candidates above the 85 threshold.
  if (!isDuplicate) {
    try {
      const candidateQuestions = llmCandidates.map(q => q.question);
      const llmResult = await checkConceptDuplicate(
        baseQuestion.question,
        candidateQuestions,
      );

      // (a) Non-agri short-circuit — beats duplicate detection.
      if (llmResult.isNonAgri) {
        const nonAgriQuestion = {
          ...baseQuestion,
          status: 'non_agri' as QuestionStatus,
        };
        logData.outcome = 'NON_AGRI_DETECTED';
        logData.nonAgri = true;
        chatbotSimilarityLogger.warn('ADD_QUESTION_LOG', logData);
        return { isDuplicate: false, isNonAgri: true, nonAgriData: nonAgriQuestion };
      }

      // (b) LLM picked a candidate → treat as duplicate.
      if (
        llmResult.matchedIndex !== null &&
        llmResult.matchedIndex >= 0 &&
        llmResult.matchedIndex < llmCandidates.length
      ) {
        const matchedCandidate = llmCandidates[llmResult.matchedIndex];
        console.log("Matched Candidate:", matchedCandidate);
        isDuplicate = true;
        matchedQuestion = matchedCandidate.question;
        matchedQuestionId = matchedCandidate.questionId;
        matchedScore = matchedCandidate.similarityScore;
        referenceSourcefrom = matchedCandidate.referenceSource;
      }
      // (c) Otherwise → plain agri question, fall through to "no duplicate" return.
    } catch (llmError: any) {
      // LLM outage must never block the pipeline — fall through and treat as open.
      console.error(
        '⚠️ Combined LLM check failed, proceeding as open:',
        llmError?.message,
      );
    }
  }

  // Persist duplicate and return.
  if (isDuplicate && matchedQuestionId && matchedQuestion) {
    const duplicateQuestion = {
      ...baseQuestion,
      similarityScore: Number(matchedScore.toFixed(2)),
      referenceQuestionId: matchedQuestionId,
      referenceQuestion: matchedQuestion,
      referenceSource: referenceSourcefrom,
      status: 'duplicate' as QuestionStatus,
    };

    if (fromOutReach) {
      await duplicateQuestionRepository.addDuplicate(
        duplicateQuestion,
        session,
      );
    }

    logData.outcome = 'DUPLICATE_DETECTED';
    logData.matchedQuestion = matchedQuestion;
    logData.similarityScore = matchedScore.toFixed(2);

    chatbotSimilarityLogger.warn('ADD_QUESTION_LOG', logData);
    return { isDuplicate: true, duplicateData: duplicateQuestion };
  }

  return { isDuplicate: false };
}
