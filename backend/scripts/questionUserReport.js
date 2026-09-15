/**
 * User Question Report — per-user counts of questions Authored / Reviewed / Moderated,
 * bucketed month-wise (IST) from September 2025 onward.
 *
 * How to run:
 *   1. Fill in the USER_IDS array below with the user ids to report on.
 *   2. Make sure DB_URL and DB_NAME are set (backend/.env is loaded automatically).
 *   3. From the backend/ directory:
 *        node scripts/questionUserReport.js
 *
 * Output: backend/user-question-report.xlsx with 4 sheets —
 *   Totals   : one row per user, Sep-2025-onward distinct totals (Authored/Reviewed/Moderated)
 *   Authored : rows = users, columns = months (Sep 2025 → current, IST) + Total
 *   Reviewed : same layout
 *   Moderated: same layout
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================
// CONFIGURATION
// ============================================================

const MONGO_URI = process.env.DB_URL || '';
const DB_NAME = process.env.DB_NAME || 'agriai';

const USERS_COLLECTION = 'users';
const QUESTION_SUBMISSIONS_COLLECTION = 'question_submissions';
const ANSWERS_COLLECTION = 'answers';
const QUESTIONS_COLLECTION = 'questions';

const BATCH_SIZE = 500;

// ============================================================
// MONTH-WISE CONFIG
// ============================================================

// Counts are bucketed by calendar month starting from this month (inclusive).
const START_YEAR = 2025;
const START_MONTH = 9; // September (1-based)
const START_KEY = `${START_YEAR}-${String(START_MONTH).padStart(2, '0')}`;

// Dates are stored in UTC; bucket them by IST (UTC+5:30) calendar month.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// All months from START (Sep 2025) through the current month, as { key, label }.
function buildMonthRange() {
  // Current month in IST.
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const endYear = nowIst.getUTCFullYear();
  const endMonth = nowIst.getUTCMonth() + 1; // 1-based
  const months = [];
  let y = START_YEAR;
  let m = START_MONTH;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    months.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

const MONTHS = buildMonthRange();

// 'YYYY-MM' (IST) for a UTC date value, or null if missing/invalid.
function monthKeyOf(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Shift by the IST offset and read UTC parts → IST calendar month (timezone-independent).
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Add a questionId to a per-month bucket ({ 'YYYY-MM': Set }), ignoring events before START.
function addMonthEvent(bucket, value, questionId) {
  const key = monthKeyOf(value);
  if (!key || key < START_KEY) return;
  if (!bucket[key]) bucket[key] = new Set();
  bucket[key].add(questionId);
}

// ============================================================
// USER IDS
// ============================================================

const USER_IDS = [
  // Add user IDs here
  '6911c8f78b081f98c41063d7', //anjali
  '6911c81e8b081f98c41063cf',//khaja
  '6911c89c8b081f98c41063d6', //Tejas
  '6911c86d8b081f98c41063d4', //Kavya
  '6911c8958b081f98c41063d5',//Satarupa
  '6911c8598b081f98c41063d2', //Salim
  '6911c8648b081f98c41063d3', //Rounaq
];

// ============================================================
// OUTPUT FILE
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE_PATH = path.join(
  __dirname,
  '..',
  'user-question-report.xlsx'
);

// ============================================================
// VALIDATION
// ============================================================

if (!MONGO_URI) {
  throw new Error(
    '❌ DB_URL is not defined in the environment.'
  );
}

if (USER_IDS.length === 0) {
  throw new Error(
    '❌ No user IDs provided in USER_IDS.'
  );
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Creates both ObjectId and string representations of user IDs.
 *
 * This allows us to match fields that may have been stored as
 * either ObjectId or string in MongoDB.
 */
function getUserIdValues(userIds) {
  const values = [];

  for (const userId of userIds) {
    values.push(userId);

    if (ObjectId.isValid(userId)) {
      values.push(new ObjectId(userId));
    }
  }

  return values;
}

/**
 * Converts MongoDB ID to string safely.
 */
function idToString(id) {
  if (id === null || id === undefined) {
    return '';
  }

  return String(id);
}

// ============================================================
// EXPORT USER QUESTION REPORT
// ============================================================

async function exportUserQuestionReport() {
  const client = new MongoClient(MONGO_URI);

  try {
    // --------------------------------------------------------
    // CONNECT TO MONGODB
    // --------------------------------------------------------

    console.log('🚀 Connecting to MongoDB...');

    await client.connect();

    console.log(
      '✅ Connected to MongoDB successfully.\n'
    );

    const db = client.db(DB_NAME);

    const usersCollection =
      db.collection(USERS_COLLECTION);

    const questionSubmissionsCollection =
      db.collection(
        QUESTION_SUBMISSIONS_COLLECTION
      );

    const answersCollection =
      db.collection(ANSWERS_COLLECTION);

    const questionsCollection =
      db.collection(QUESTIONS_COLLECTION);

    // --------------------------------------------------------
    // PREPARE USER IDS
    // --------------------------------------------------------

    const userIdValues = getUserIdValues(USER_IDS);

    // --------------------------------------------------------
    // FETCH USERS
    // --------------------------------------------------------

    console.log('👥 Fetching users...');

    const users = await usersCollection
      .find(
        {
          $or: [
            {
              _id: {
                $in: USER_IDS
                  .filter(id => ObjectId.isValid(id))
                  .map(id => new ObjectId(id)),
              },
            },
          ],
        },
        {
          projection: {
            _id: 1,
            firstName: 1,
            lastName: 1,
          },
        }
      )
      .toArray();

    // --------------------------------------------------------
    // CREATE USER MAP
    // --------------------------------------------------------

    const userMap = new Map();

    for (const user of users) {
      const userId = idToString(user._id);

      const name = [
        user.firstName,
        user.lastName,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      userMap.set(userId, {
        name: name || 'N/A',
      });
    }

    console.log(
      `✅ Users found: ${users.length}/${USER_IDS.length}\n`
    );

    // ========================================================
    // RESULTS
    // ========================================================

    /**
     * Map structure:
     *
     * userStats = {
     *   userId: {
     *     authored: Set(),
     *     reviewed: Set(),
     *     moderated: Set()
     *   }
     * }
     */

    const userStats = new Map();

    for (const userId of USER_IDS) {
      userStats.set(userId, {
        // Each metric is a { 'YYYY-MM': Set<questionId> } month bucket.
        authored: {},
        reviewed: {},
        moderated: {},
      });
    }

    // ========================================================
    // 1. QUESTIONS AUTHORED + REVIEWED
    // ========================================================

    console.log(
      '🔍 Processing question submissions...'
    );

    const totalSubmissions =
      await questionSubmissionsCollection.countDocuments({
        $or: [
          {
            'history.0.updatedBy': {
              $in: userIdValues,
            },
          },
          {
            'history.updatedBy': {
              $in: userIdValues,
            },
          },
        ],
      });

    console.log(
      `📊 Question submissions to check: ${totalSubmissions}`
    );

    let processedSubmissions = 0;

    let lastSubmissionId = null;

    while (true) {
      // ------------------------------------------------------
      // BUILD QUERY
      // ------------------------------------------------------

      const query = {
        $or: [
          {
            'history.0.updatedBy': {
              $in: userIdValues,
            },
          },
          {
            'history.updatedBy': {
              $in: userIdValues,
            },
          },
        ],
      };

      // ------------------------------------------------------
      // CURSOR PAGINATION
      // ------------------------------------------------------

      if (lastSubmissionId) {
        query._id = {
          $gt: lastSubmissionId,
        };
      }

      // ------------------------------------------------------
      // FETCH BATCH
      // ------------------------------------------------------

      const submissions =
        await questionSubmissionsCollection
          .find(
            query,
            {
              projection: {
                _id: 1,
                questionId: 1,
                history: 1,
              },
            }
          )
          .sort({
            _id: 1,
          })
          .limit(BATCH_SIZE)
          .toArray();

      // ------------------------------------------------------
      // NO MORE SUBMISSIONS
      // ------------------------------------------------------

      if (submissions.length === 0) {
        break;
      }

      // ======================================================
      // PROCESS EACH SUBMISSION
      // ======================================================

      for (const submission of submissions) {
        const questionId =
          idToString(submission.questionId);

        const history =
          Array.isArray(submission.history)
            ? submission.history
            : [];

        // ----------------------------------------------------
        // AUTHORED
        //
        // history[0].updatedBy === userId
        // ----------------------------------------------------

        const firstHistoryEntry = history[0];

        if (firstHistoryEntry) {
          const authorId =
            idToString(
              firstHistoryEntry.updatedBy
            );

          if (userStats.has(authorId)) {
            // Bucket by when the author created their (first) entry.
            addMonthEvent(
              userStats.get(authorId).authored,
              firstHistoryEntry.createdAt,
              questionId,
            );
          }
        }

        // ----------------------------------------------------
        // REVIEWED
        //
        // History AFTER index 0
        //
        // updatedBy === userId
        //
        // status !== "in-review"
        // ----------------------------------------------------

        for (
          let i = 1;
          i < history.length;
          i++
        ) {
          const historyEntry = history[i];

          if (!historyEntry) {
            continue;
          }

          const reviewerId =
            idToString(
              historyEntry.updatedBy
            );

          if (!userStats.has(reviewerId)) {
            continue;
          }

          if (
            historyEntry.status === 'in-review'
          ) {
            continue;
          }

          // Bucket by when the review was completed (updatedAt), else createdAt.
          addMonthEvent(
            userStats.get(reviewerId).reviewed,
            historyEntry.updatedAt ?? historyEntry.createdAt,
            questionId,
          );
        }
      }

      // ------------------------------------------------------
      // UPDATE CURSOR
      // ------------------------------------------------------

      processedSubmissions +=
        submissions.length;

      lastSubmissionId =
        submissions[
          submissions.length - 1
        ]._id;

      // ------------------------------------------------------
      // PROGRESS
      // ------------------------------------------------------

      const percentage =
        totalSubmissions === 0
          ? 100
          : (
              (processedSubmissions /
                totalSubmissions) *
              100
            ).toFixed(2);

      console.log(
        `📊 Submissions: ${processedSubmissions}/${totalSubmissions} (${percentage}%)`
      );
    }

    // ========================================================
    // 2. QUESTIONS MODERATED
    //
    // A user "moderated" a question when they approved its answer
    // (answers.approvedBy). We DON'T bucket by the answer's time — instead we
    // collect the approved questionIds per user here, then (below) look up each
    // question's closedAt and bucket the moderated count by that closedAt month.
    // Only questions that are actually closed are counted.
    // ========================================================

    console.log(
      '\n🔍 Processing answers for moderation...'
    );

    // questionId -> Set of our userIds who approved that question's answer.
    const moderatedQuestionUsers = new Map();

    const totalAnswers =
      await answersCollection.countDocuments({
        approvedBy: {
          $in: userIdValues,
        },
      });

    console.log(
      `📊 Answers to check: ${totalAnswers}`
    );

    let processedAnswers = 0;

    let lastAnswerId = null;

    while (true) {
      // ------------------------------------------------------
      // BUILD QUERY
      // ------------------------------------------------------

      const query = {
        approvedBy: {
          $in: userIdValues,
        },
      };

      // ------------------------------------------------------
      // CURSOR PAGINATION
      // ------------------------------------------------------

      if (lastAnswerId) {
        query._id = {
          $gt: lastAnswerId,
        };
      }

      // ------------------------------------------------------
      // FETCH BATCH
      // ------------------------------------------------------

      const answers =
        await answersCollection
          .find(
            query,
            {
              projection: {
                _id: 1,
                questionId: 1,
                approvedBy: 1,
              },
            }
          )
          .sort({
            _id: 1,
          })
          .limit(BATCH_SIZE)
          .toArray();

      // ------------------------------------------------------
      // NO MORE ANSWERS
      // ------------------------------------------------------

      if (answers.length === 0) {
        break;
      }

      // ======================================================
      // PROCESS ANSWERS
      // ======================================================

      for (const answer of answers) {
        const moderatorId =
          idToString(answer.approvedBy);

        if (!userStats.has(moderatorId)) {
          continue;
        }

        const questionId =
          idToString(answer.questionId);

        // Record which of our users approved this question; the closedAt-based
        // bucketing happens in the questions pass below.
        if (!moderatedQuestionUsers.has(questionId)) {
          moderatedQuestionUsers.set(questionId, new Set());
        }
        moderatedQuestionUsers.get(questionId).add(moderatorId);
      }

      // ------------------------------------------------------
      // UPDATE CURSOR
      // ------------------------------------------------------

      processedAnswers += answers.length;

      lastAnswerId =
        answers[
          answers.length - 1
        ]._id;

      // ------------------------------------------------------
      // PROGRESS
      // ------------------------------------------------------

      const percentage =
        totalAnswers === 0
          ? 100
          : (
              (processedAnswers /
                totalAnswers) *
              100
            ).toFixed(2);

      console.log(
        `📊 Answers: ${processedAnswers}/${totalAnswers} (${percentage}%)`
      );
    }

    // ========================================================
    // 2b. BUCKET MODERATED BY QUESTION closedAt
    //
    // For every question a user approved, look up the question document and, if
    // it is closed (has closedAt), bucket the moderated count by that closedAt
    // month (IST). Questions without a closedAt are skipped.
    // ========================================================

    console.log(
      '\n🔍 Looking up closedAt for moderated questions...'
    );

    const moderatedQuestionIds = [...moderatedQuestionUsers.keys()];
    const moderatedObjectIds = moderatedQuestionIds
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    console.log(
      `📊 Moderated questions to resolve: ${moderatedQuestionIds.length}`
    );

    let resolvedClosed = 0;

    for (let i = 0; i < moderatedObjectIds.length; i += BATCH_SIZE) {
      const idBatch = moderatedObjectIds.slice(i, i + BATCH_SIZE);

      const questions = await questionsCollection
        .find(
          {
            _id: { $in: idBatch },
            closedAt: { $exists: true, $ne: null },
          },
          {
            projection: {
              _id: 1,
              closedAt: 1,
            },
          }
        )
        .toArray();

      for (const question of questions) {
        const questionId = idToString(question._id);
        const users = moderatedQuestionUsers.get(questionId);
        if (!users) continue;

        for (const userId of users) {
          if (!userStats.has(userId)) continue;
          // Bucket by the question's closedAt (IST month).
          addMonthEvent(
            userStats.get(userId).moderated,
            question.closedAt,
            questionId,
          );
        }
      }

      resolvedClosed += questions.length;
    }

    console.log(
      `📊 Closed moderated questions matched: ${resolvedClosed}`
    );

    // ========================================================
    // CREATE EXCEL ROWS
    // ========================================================

    console.log(
      '\n📊 Preparing Excel data...'
    );

    // Distinct questionIds across every month bucket of a metric.
    const distinctTotal = (bucket) => {
      const union = new Set();
      for (const key of Object.keys(bucket || {})) {
        for (const id of bucket[key]) union.add(id);
      }
      return union.size;
    };

    // Combined summary: one row per user with the Sep-2025-onward distinct totals.
    const buildTotalsRows = () => {
      const rows = [];
      let index = 1;
      for (const userId of USER_IDS) {
        const stats = userStats.get(userId);
        const user = userMap.get(userId);
        rows.push({
          'No.': index++,
          'User ID': userId,
          'Name': user?.name || 'User not found',
          'No. of Questions Authored': stats ? distinctTotal(stats.authored) : 0,
          'No. of Questions Reviewed': stats ? distinctTotal(stats.reviewed) : 0,
          'No. of Questions Moderated': stats ? distinctTotal(stats.moderated) : 0,
        });
      }
      return rows;
    };

    // Build one row per user for a given metric: No. / User ID / Name, then a column
    // per month (Sep 2025 → current), then a Total (distinct questions across all months).
    const buildMetricRows = (metric) => {
      const rows = [];
      let index = 1;

      for (const userId of USER_IDS) {
        const stats = userStats.get(userId);
        const user = userMap.get(userId);
        const bucket = stats ? stats[metric] : {};

        const row = {
          'No.': index++,
          'User ID': userId,
          'Name': user?.name || 'User not found',
        };

        const union = new Set();
        for (const { key, label } of MONTHS) {
          const set = bucket[key];
          row[label] = set ? set.size : 0;
          if (set) {
            for (const id of set) union.add(id);
          }
        }
        row['Total'] = union.size;

        rows.push(row);
      }

      return rows;
    };

    // ========================================================
    // CREATE EXCEL (one sheet per metric, months as columns)
    // ========================================================

    console.log(
      '\n📊 Creating Excel report...'
    );

    const colWidths = [
      { wch: 6 }, // No.
      { wch: 28 }, // User ID
      { wch: 26 }, // Name
      ...MONTHS.map(() => ({ wch: 11 })), // month columns
      { wch: 10 }, // Total
    ];

    const workbook = XLSX.utils.book_new();

    // Combined summary sheet first (Sep-2025-onward totals per user).
    const totalsSheet = XLSX.utils.json_to_sheet(buildTotalsRows());
    totalsSheet['!cols'] = [
      { wch: 6 }, { wch: 28 }, { wch: 26 }, { wch: 30 }, { wch: 30 }, { wch: 30 },
    ];
    totalsSheet['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, totalsSheet, 'Totals');

    // Then one month-wise sheet per metric.
    for (const { metric, sheetName } of [
      { metric: 'authored', sheetName: 'Authored' },
      { metric: 'reviewed', sheetName: 'Reviewed' },
      { metric: 'moderated', sheetName: 'Moderated' },
    ]) {
      const sheet = XLSX.utils.json_to_sheet(buildMetricRows(metric));
      sheet['!cols'] = colWidths;
      sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    }

    XLSX.writeFile(
      workbook,
      OUTPUT_FILE_PATH
    );

    // ========================================================
    // FINAL SUMMARY
    // ========================================================

    console.log('\n');

    console.log(
      '=================================================='
    );

    console.log(
      '          USER QUESTION REPORT'
    );

    console.log(
      '=================================================='
    );

    console.log(
      `Users processed      : ${USER_IDS.length}`
    );

    console.log(
      `Submissions checked  : ${processedSubmissions}`
    );

    console.log(
      `Answers checked      : ${processedAnswers}`
    );

    console.log(
      '\n📄 Excel saved to:'
    );

    console.log(
      OUTPUT_FILE_PATH
    );

    console.log(
      '\n✅ Report generation completed.'
    );

  } catch (error) {
    console.error(
      '\n🔴 Error generating user question report:',
      error
    );
  } finally {
    await client.close();

    console.log(
      '\n🔌 Disconnected from MongoDB.'
    );
  }
}

// ============================================================
// RUN
// ============================================================

exportUserQuestionReport();