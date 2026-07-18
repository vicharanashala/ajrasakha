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
  // chatbot: number;
  // manual: number;
  agriCount?: number,
  nonAgriCount?: number,
  open?: number;
  pending?: number;
  closed?: number;
  dynamic?: number;
  duplicate?: number;
  delayed?: number;
  hold?: number;
  pass?: number;
  inReview?: number;
  rerouted?: number;
  dynamicClosed?: number;
  paeSubmitted?: number;
  webAppCount?: number;
  manualCount?: number;
  whatSappCount?: number;
  duplicateClosed?: number;
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
  const totalQuestions = await questionRepository.count({
      isTesting: { $ne: true },
    });
  const [
    {
      approvalRate: moderatorApprovalRate,
      approved: totalClosedQuestions,
      pending: totalInReviewQuestions,
    },
    reviewWiseCount,
    statusCount,
    todayAdded,
    todayGolden,
    webAppCount,
    whatSappCount,
    manualCount,
  ] = await Promise.all([
    questionRepository.getModeratorApprovalRate(''),
    questionSubmissionRepository.getReviewWiseCount(),
    questionRepository.getCountByStatus(),
    questionRepository.count({
      isTesting: { $ne: true },
      createdAt: { $gte: todayStart },
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      closedAt: { $gte: todayStart } ,
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      source: 'AJRASAKHA',
      closedAt: { $gte: todayStart }
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      source: 'WHATSAPP',
      closedAt: { $gte: todayStart }
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      source: { $nin: ['AJRASAKHA' , 'WHATSAPP']},
      closedAt: { $gte: todayStart }
    })
  ]);

  const nonAgriCount = statusCount.find(s => s._id === 'non_agri')?.count ?? 0;
  const agriCount = totalQuestions - nonAgriCount;
  const closed = statusCount.find(s => s._id === 'closed')?.count ?? 0;
  const pending = statusCount.find(s => s._id === 'pending')?.count ?? 0;
  const nonAgri = statusCount.find(s => s._id === 'non_agri')?.count ?? 0;
  const dynamic = statusCount.find(s => s._id === 'dynamic')?.count ?? 0;
  const duplicate = statusCount.find(s => s._id === 'duplicate')?.count ?? 0;
  const open = statusCount.find(s => s._id === 'open')?.count ?? 0;
  const delayed = statusCount.find(s => s._id === 'delayed')?.count ?? 0;
  const hold = statusCount.find(s => s._id === 'hold')?.count ?? 0;
  const paeSubmitted = statusCount.find(s => s._id === 'pae_submitted')?.count ?? 0;
  const dynamicClosed = statusCount.find(s => s._id === 'dynamic_closed')?.count ?? 0;
  const rerouted = statusCount.find(s => s._id === 're-routed')?.count ?? 0;
  const inReview = statusCount.find(s => s._id === 'in-review')?.count ?? 0;
  const pass = statusCount.find(s => s._id === 'pass')?.count ?? 0;
  const duplicateClosed = statusCount.find(s => s._id === 'duplicate_closed')?.count ?? 0;

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
    // chatbot: chatbotCount,
    // manual,
    agriCount,
    nonAgriCount,
    open,
    pending,
    closed,
    dynamic,
    duplicate,
    delayed,
    hold,
    pass,
    inReview,
    rerouted,
    dynamicClosed,
    paeSubmitted,
    webAppCount,
    manualCount,
    whatSappCount,
    duplicateClosed,
  };
};
