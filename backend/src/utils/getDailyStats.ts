import {getContainer} from '#root/bootstrap/loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';
import {QuestionSubmissionRepository} from '#root/shared/database/providers/mongo/repositories/SubmissionRepository.js';

export interface IReviewWiseStats {
  authorLevel: number;
  levelOne: number;
  levelTwo: number;
  levelThree: number;
  levelFour: number;
  levelFive: number;
  levelSix: number;
  levelSeven: number;
  levelEight: number;
  levelNine: number;
}
export interface DailyStats {
  totalQuestions: number;
  totalInReviewQuestions: number;
  totalClosedQuestions: number;
  totalQuestionsUnderExpertReview: number;
  moderatorApprovalRate: number;

  reviewWiseCount: IReviewWiseStats;

  // Today Stats
  todayAdded: number;
  todayGolden: number;
  chatbot: number;
  manual: number;

  // Source-wise Stats
  whatsappStats: {
    addedToday: number;
    closedWithin2Hours: number;
    inReview: number;
    delayed: number;
  };
  chatbotStats: {
    addedToday: number;
    closedWithin2Hours: number;
    inReview: number;
    delayed: number;
  };
}

// export const getDailyStats = async (): Promise<DailyStats> => {
//   const container = getContainer();
//   const questionRepository = container.get<QuestionRepository>(
//     CORE_TYPES.QuestionRepository,
//   );
//   const questionSubmissionRepository =
//     container.get<QuestionSubmissionRepository>(
//       CORE_TYPES.QuestionSubmissionRepository,
//     );

//   const allQuestions = await questionRepository.getAll();

//   ////////////////////////////////////////// TOTAL QUESTIONS STATS ////////////////////////////////////////////

//   // Total Question length
//   const totalQuestions = allQuestions.length || 0;
//   // Moderator approval rate and count of closed & in-review questions
//   const {
//     approvalRate: moderatorApprovalRate,
//     approved: totalClosedQuestions,
//     pending: totalInReviewQuestions,
//   } = await questionRepository.getModeratorApprovalRate('');

//   // Total question under expert review
//   const totalQuestionsUnderExpertReview =
//     (totalQuestions || 0) -
//     (totalClosedQuestions || 0 + totalInReviewQuestions || 0);

//   ////////////////////////////////////////// REVIEW LEVEL WISE STATS ////////////////////////////////////////////

//   const reviewWiseCount =
//     await questionSubmissionRepository.getReviewWiseCount();

//   ////////////////////////////////////////// TODAY STATS ////////////////////////////////////////////////////////

//   const todayStart = new Date();
//   todayStart.setHours(0, 0, 0, 0);

//   const today = allQuestions.filter(q => new Date(q.createdAt) >= todayStart);

//   const todayGolden = allQuestions.filter(
//     q => new Date(q.closedAt) >= todayStart,
//   ).length;
//   const chatbot = today.filter(q => q.source === 'AJRASAKHA').length;
//   const manual = today.length - chatbot;

//   /////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//   return {
//     totalQuestions,
//     totalInReviewQuestions,
//     totalClosedQuestions,
//     totalQuestionsUnderExpertReview,
//     moderatorApprovalRate,
//     reviewWiseCount,

//     todayAdded: today.length,
//     todayGolden,
//     chatbot,
//     manual,
//   };
// };

export const getDailyStats = async (): Promise<DailyStats> => {
  const container = getContainer();

  const questionRepository = container.get<QuestionRepository>(
    CORE_TYPES.QuestionRepository,
  );

  const questionSubmissionRepository =
    container.get<QuestionSubmissionRepository>(
      CORE_TYPES.QuestionSubmissionRepository,
    );

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  /* -------------------------------------------------------
     PARALLEL LIGHTWEIGHT QUERIES
  ------------------------------------------------------- */
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  const totalQuestions = await questionRepository.count();
  const [
    {
      approvalRate: moderatorApprovalRate,
      approved: totalClosedQuestions,
      pending: totalInReviewQuestions,
    },
    reviewWiseCount,
    todayAdded,
    todayGolden,
    chatbotCount,
    manual,
    whatsappAddedToday,
    whatsappClosedWithin2Hours,
    whatsappInReview,
    whatsappDelayed,
    chatbotAddedToday,
    chatbotClosedWithin2Hours,
    chatbotInReview,
    chatbotDelayed,
  ] = await Promise.all([
    questionRepository.getModeratorApprovalRate(''),
    questionSubmissionRepository.getReviewWiseCount(),
    questionRepository.count({ createdAt: { $gte: todayStart } }),
    questionRepository.count({ closedAt: { $gte: todayStart } }),
    questionRepository.count({ createdAt: { $gte: todayStart }, source: 'AJRASAKHA' }),
    questionRepository.count({ createdAt: { $gte: todayStart }, source: { $ne: ['AJRASAKHA', 'WHATSAPP'] } }),
    // WhatsApp stats
    questionRepository.count({ source: 'WHATSAPP', createdAt: { $gte: todayStart } }),
    questionRepository.count({ source: 'WHATSAPP', status: 'closed', closedAt: { $gte: todayStart }, $expr: { $lte: [{ $subtract: ['$closedAt', '$createdAt'] }, TWO_HOURS_MS] } }),
    questionRepository.count({ source: 'WHATSAPP', status: 'in-review' }),
    questionRepository.count({ source: 'WHATSAPP', status: 'delayed' }),
    // Chatbot stats
    questionRepository.count({ source: 'AJRASAKHA', createdAt: { $gte: todayStart } }),
    questionRepository.count({ source: 'AJRASAKHA', status: 'closed', closedAt: { $gte: todayStart }, $expr: { $lte: [{ $subtract: ['$closedAt', '$createdAt'] }, TWO_HOURS_MS] } }),
    questionRepository.count({ source: 'AJRASAKHA', status: 'in-review' }),
    questionRepository.count({ source: 'AJRASAKHA', status: 'delayed' }),
  ]);

  const totalQuestionsUnderExpertReview =
    totalQuestions - (totalClosedQuestions + totalInReviewQuestions);

  return {
    totalQuestions,
    totalInReviewQuestions,
    totalClosedQuestions,
    totalQuestionsUnderExpertReview,
    moderatorApprovalRate,
    reviewWiseCount,
    todayAdded,
    todayGolden,
    chatbot: chatbotCount,
    manual,
    whatsappStats: {
      addedToday: whatsappAddedToday,
      closedWithin2Hours: whatsappClosedWithin2Hours,
      inReview: whatsappInReview,
      delayed: whatsappDelayed,
    },
    chatbotStats: {
      addedToday: chatbotAddedToday,
      closedWithin2Hours: chatbotClosedWithin2Hours,
      inReview: chatbotInReview,
      delayed: chatbotDelayed,
    },
  };
};
