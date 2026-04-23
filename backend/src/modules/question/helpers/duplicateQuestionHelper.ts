import { ObjectId, ClientSession } from 'mongodb';
import { IQuestion } from '#root/shared/interfaces/models.js';
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
): Promise<{ isDuplicate: boolean; duplicateData?: any }> {
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
      id: item.id
        ? new ObjectId(String(item.id))
        : new ObjectId() // preserve the real reviewer question _id
    })),
    ...(questions.golden || []).map((item: any) => ({
      question: item.question,
      answer: item.answer,
      agri_specialist: item.metadata?.["Agri Specialist"] || "Unknown",
      referenceSource: "golden",
      score: item.score * 100,
      id: item.id
        ? new ObjectId(String(item.id))
        : new ObjectId()
    })),
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

    // Rule 1: immediate duplicate
    if (highestScore >= 95) {
      isDuplicate = true;
      matchedQuestion = match.question;
      matchedQuestionId = match.questionId;
      matchedScore = highestScore;
      referenceSourcefrom = match.referenceSource;
      break;
    }

    // Rule 2: collect candidates for LLM
    if (highestScore >= 85 && highestScore < 95) {
      llmCandidates.push(match);
    }
  }

  // Rule 3: call LLM once
  if (!isDuplicate && llmCandidates.length > 0) {
    const candidateQuestions = llmCandidates.map(q => q.question);

    const matchedQuestionfromllm = await checkConceptDuplicate(
      baseQuestion.question,
      candidateQuestions,
    );
    if (matchedQuestionfromllm) {
      const filtermatchinQuestion = topSimilar.filter(
        ele => ele.question == matchedQuestionfromllm,
      );

      isDuplicate = true;
      matchedQuestion = filtermatchinQuestion[0].question;
      matchedQuestionId = filtermatchinQuestion[0].questionId;
      matchedScore = filtermatchinQuestion[0].similarityScore;
      referenceSourcefrom = filtermatchinQuestion[0].referenceSource;

      const duplicateQuestion = {
        ...baseQuestion,
        similarityScore: Number(matchedScore.toFixed(2)),
        referenceQuestionId: matchedQuestionId,
        referenceQuestion: matchedQuestion,
        referenceSource: referenceSourcefrom
      }

      await duplicateQuestionRepository.addDuplicate(
        duplicateQuestion,
        session
      )
      logData.outcome = 'DUPLICATE_DETECTED'
      logData.matchedQuestion = matchedQuestion
      logData.similarityScore = matchedScore.toFixed(2)

      chatbotSimilarityLogger.warn('ADD_QUESTION_LOG', logData)
      return { isDuplicate: true, duplicateData: duplicateQuestion }
    }
  }

  // Final action: Persist duplicate and return
  if (isDuplicate && matchedQuestionId && matchedQuestion) {
    const duplicateQuestion = {
      ...baseQuestion,
      similarityScore: Number(matchedScore.toFixed(2)),
      referenceQuestionId: matchedQuestionId,
      referenceQuestion: matchedQuestion,
      referenceSource: referenceSourcefrom,
    };

    await duplicateQuestionRepository.addDuplicate(
      duplicateQuestion,
      session,
    );

    logData.outcome = 'DUPLICATE_DETECTED';
    logData.matchedQuestion = matchedQuestion;
    logData.similarityScore = matchedScore.toFixed(2);

    chatbotSimilarityLogger.warn('ADD_QUESTION_LOG', logData);
    return { isDuplicate: true, duplicateData: duplicateQuestion };
  }

  return { isDuplicate: false };
}
