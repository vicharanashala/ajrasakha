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

const BATCH_SIZE = 500;

// ============================================================
// USER IDS
// ============================================================

const USER_IDS = [
  // Add user IDs here
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
        authored: new Set(),
        reviewed: new Set(),
        moderated: new Set(),
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
            userStats
              .get(authorId)
              .authored
              .add(questionId);
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

          userStats
            .get(reviewerId)
            .reviewed
            .add(questionId);
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
    // ========================================================

    console.log(
      '\n🔍 Processing answers for moderation...'
    );

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

        userStats
          .get(moderatorId)
          .moderated
          .add(questionId);
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
    // CREATE EXCEL ROWS
    // ========================================================

    console.log(
      '\n📊 Preparing Excel data...'
    );

    const excelRows = [];

    for (const userId of USER_IDS) {
      const stats =
        userStats.get(userId);

      const user =
        userMap.get(userId);

      excelRows.push({
        'No.': excelRows.length + 1,

        'User ID': userId,

        'Name':
          user?.name || 'User not found',

        'No. of Questions Authored':
          stats?.authored.size || 0,

        'No. of Questions Reviewed':
          stats?.reviewed.size || 0,

        'No. of Questions Moderated':
          stats?.moderated.size || 0,
      });
    }

    // ========================================================
    // CREATE EXCEL
    // ========================================================

    console.log(
      '\n📊 Creating Excel report...'
    );

    const worksheet =
      XLSX.utils.json_to_sheet(
        excelRows
      );

    // ========================================================
    // COLUMN WIDTHS
    // ========================================================

    worksheet['!cols'] = [
      {
        wch: 8,
      },
      {
        wch: 30,
      },
      {
        wch: 30,
      },
      {
        wch: 32,
      },
      {
        wch: 32,
      },
      {
        wch: 33,
      },
    ];

    // ========================================================
    // FREEZE HEADER
    // ========================================================

    worksheet['!freeze'] = {
      xSplit: 0,
      ySplit: 1,
    };

    // ========================================================
    // CREATE WORKBOOK
    // ========================================================

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'User Question Report'
    );

    // ========================================================
    // WRITE EXCEL
    // ========================================================

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