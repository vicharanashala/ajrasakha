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

  /* -------------------------------------------------------
     Run independent queries in parallel
  ------------------------------------------------------- */
  const [
    allQuestions,
    {
      approvalRate: moderatorApprovalRate,
      approved: totalClosedQuestions,
      pending: totalInReviewQuestions,
    },
    reviewWiseCount,
  ] = await Promise.all([
    questionRepository.getAll(),
    questionRepository.getModeratorApprovalRate(''),
    questionSubmissionRepository.getReviewWiseCount(),
  ]);

  /* -------------------------------------------------------
     TOTAL QUESTIONS STATS
  ------------------------------------------------------- */
  const totalQuestions = allQuestions.length || 0;

  const totalQuestionsUnderExpertReview =
    totalQuestions -
    ((totalClosedQuestions || 0) + (totalInReviewQuestions || 0));

  /* -------------------------------------------------------
     TODAY STATS
  ------------------------------------------------------- */
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayQuestions = allQuestions.filter(
    q => new Date(q.createdAt) >= todayStart,
  );

  const todayGolden = allQuestions.filter(
    q => q.closedAt && new Date(q.closedAt) >= todayStart,
  ).length;

  const chatbot = todayQuestions.filter(q => q.source === 'AJRASAKHA').length;

  const manual = todayQuestions.length - chatbot;

  /* -------------------------------------------------------
     FINAL RESPONSE
  ------------------------------------------------------- */
  return {
    totalQuestions,
    totalInReviewQuestions,
    totalClosedQuestions,
    totalQuestionsUnderExpertReview,
    moderatorApprovalRate,

    reviewWiseCount,

    todayAdded: todayQuestions.length,
    todayGolden,
    chatbot,
    manual,
  };
};
