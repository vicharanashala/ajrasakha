import {getContainer} from '#root/bootstrap/loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import {getISTStartOfToday} from '#root/utils/date.utils.js';
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
  agriExpertCount?: number;
  outReachCount?: number;
  newModeratorApprovalRate?: number;
  // GDB (golden dataset) entries added in the period — all closure types
  // (closed / dynamic_closed / duplicate_closed) by closedAt — plus the split by the
  // role of whoever pushed each one to the GDB.
  gdbTotal?: number;
  gdbByModerator?: number;
  gdbByAuditor?: number;
  // Daily approval % = (questions pushed to GDB in the period / questions pushed to the
  // reviewer system, i.e. created, in the period) × 100.
  dailyApprovalRate?: number;
  // Non-golden entries in the period (today) — pass + dynamic_closed + duplicate_closed.
  todayPass?: number;
  todayDynamicClosed?: number;
  todayDuplicateClosed?: number;
  // Questions entered into the system today (by createdAt), broken down by source.
  todayAddedWebAppCount?: number;
  todayAddedWhatSappCount?: number;
  todayAddedOutReachCount?: number;
  todayAddedAgriExpertCount?: number;
  // Questions entered today (by createdAt), per source AND per type. Within each
  // source the four type counts are mutually exclusive and sum to that source's total.
  todayAddedTypeBySource?: {
    webApp: TodayAddedTypeCounts;
    whatSapp: TodayAddedTypeCounts;
  };
}

export interface TodayAddedTypeCounts {
  dynamic: number;
  staticDynamic: number;
  unique: number;
  duplicate: number;
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

export const getDailyStats = async (
  range?: { startDate?: string; endDate?: string },
): Promise<DailyStats> => {
  const container = getContainer();

  const questionRepository = container.get<QuestionRepository>(
    CORE_TYPES.QuestionRepository,
  );

  const questionSubmissionRepository =
    container.get<QuestionSubmissionRepository>(
      CORE_TYPES.QuestionSubmissionRepository,
    );

  // Date window (IST) for the "today"/period counts. With no range it is today
  // onward (getISTStartOfToday) — the original behaviour. When the dashboard
  // passes startDate/endDate (YYYY-MM-DD), it reports that IST day range instead,
  // e.g. yesterday: [start 00:00 IST, end 23:59:59.999 IST].
  const dateRange: { $gte: Date; $lte?: Date } = range?.startDate
    ? {
        $gte: new Date(`${range.startDate}T00:00:00.000+05:30`),
        $lte: new Date(
          `${range.endDate || range.startDate}T23:59:59.999+05:30`,
        ),
      }
    : { $gte: getISTStartOfToday() };

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
    agriExpertCount,
    outReachCount,
    todayAddedWebAppCount,
    todayAddedWhatSappCount,
    todayAddedOutReachCount,
    todayAddedAgriExpertCount,
    gdbTotal,
    gdbByModerator,
    gdbByAuditor,
    todayPass,
    todayDynamicClosed,
    todayDuplicateClosed
  ] = await Promise.all([
    questionRepository.getModeratorApprovalRate(''),
    questionSubmissionRepository.getReviewWiseCount(),
    questionRepository.getCountByStatus(),
    questionRepository.count({
      isTesting: { $ne: true },
      createdAt: dateRange,
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      status: 'closed',
      closedAt: dateRange ,
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      status: 'closed',
      source: 'AJRASAKHA',
      closedAt: dateRange
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      status: 'closed',
      source: 'WHATSAPP',
      closedAt: dateRange
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      status: 'closed',
      source: 'MANUAL',
      closedAt: dateRange
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      status: 'closed',
      source: 'AGRI_EXPERT',
      closedAt: dateRange
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      status: 'closed',
      source: 'OUTREACH',
      closedAt: dateRange
    }),
    // ── Questions entered into the system today (by createdAt), per source ──
    questionRepository.count({
      isTesting: { $ne: true },
      source: 'AJRASAKHA',
      createdAt: dateRange
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      source: 'WHATSAPP',
      createdAt: dateRange
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      source: 'OUTREACH',
      createdAt: dateRange
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      source: 'AGRI_EXPERT',
      createdAt: dateRange
    }),
    // GDB entries in the period = ALL closure types (closed / dynamic_closed /
    // duplicate_closed) by closedAt — the numerator of the daily approval %.
    questionRepository.count({
      isTesting: { $ne: true },
      status: { $in: ['closed'] },
      closedAt: dateRange,
    }),
    // GDB contribution split straight off the question: a closed question that still
    // carries a moderatorId was closed by a moderator; a closed question with no
    // moderatorId was closed by an auditor. These two are mutually exclusive and
    // together add up to gdbTotal.
    questionRepository.count({
      isTesting: { $ne: true },
      status: { $in: ['closed'] },
      closedAt: dateRange,
      moderatorId: { $ne: null },
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      status: { $in: ['closed'] },
      closedAt: dateRange,
      moderatorId: null,
    }),
    // ── Non-golden entries in the period (Pass by passedAt; the auditor-close
    //    variants by closedAt) — the "today" counterpart of the all-time
    //    "Total Non-Golden Dataset Questions" (pass + dynamic_closed + duplicate_closed).
    questionRepository.count({
      isTesting: { $ne: true },
      status: 'pass',
      passedAt: dateRange,
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      status: 'dynamic_closed',
      closedAt: dateRange,
    }),
    questionRepository.count({
      isTesting: { $ne: true },
      status: 'duplicate_closed',
      closedAt: dateRange,
    }),
  ]);

  // ── Questions entered today (by createdAt) split by SOURCE and, within each
  //    source, by TYPE. The four types are mutually exclusive and exhaustive so
  //    they add up to that source's total:
  //      Duplicate      → has a referenceQuestionId
  //      Dynamic        → tagged 'dynamic' and NOT a duplicate
  //      Static Dynamic → tagged 'static_dynamic' and NOT a duplicate
  //      Unique         → neither tagged nor a duplicate
  const countTypesForSource = async (source: string) => {
    const base = { isTesting: { $ne: true }, createdAt: dateRange, source };
    const [dynamic, staticDynamic, unique, duplicate] = await Promise.all([
      questionRepository.count({ ...base, referenceQuestionId: null, tag: 'dynamic' }),
      questionRepository.count({ ...base, referenceQuestionId: null, tag: 'static_dynamic' }),
      questionRepository.count({ ...base, referenceQuestionId: null, tag: null }),
      questionRepository.count({ ...base, referenceQuestionId: { $ne: null } }),
    ]);
    return { dynamic, staticDynamic, unique, duplicate };
  };
  // Only WebApp (AJRASAKHA) and WhatsApp entries are broken down by type; Outreach
  // and Agri Expert show the total count only.
  const [webAppTypes, whatSappTypes] = await Promise.all([
    countTypesForSource('AJRASAKHA'),
    countTypesForSource('WHATSAPP'),
  ]);
  const todayAddedTypeBySource = {
    webApp: webAppTypes,
    whatSapp: whatSappTypes,
  };

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
  const newModeratorApprovalRate = agriCount == 0 ? 0 : (closed / agriCount) * 100;
  // Daily approval % = questions pushed to GDB in the period ÷ questions pushed to the
  // reviewer system (created) in the period.
  const dailyApprovalRate =
    todayAdded === 0 ? 0 : (gdbTotal / todayAdded) * 100;
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
    agriExpertCount,
    outReachCount,
    newModeratorApprovalRate,
    gdbTotal,
    gdbByModerator,
    gdbByAuditor,
    dailyApprovalRate,
    todayPass,
    todayDynamicClosed,
    todayDuplicateClosed,
    todayAddedWebAppCount,
    todayAddedWhatSappCount,
    todayAddedOutReachCount,
    todayAddedAgriExpertCount,
    todayAddedTypeBySource
  };
};
