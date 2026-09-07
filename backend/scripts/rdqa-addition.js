import { MongoClient, ObjectId } from 'mongodb';
import XLSX from 'xlsx';
import path from 'path';
import 'dotenv/config';

// ============================================================
// CONFIGURATION
// ============================================================

const MONGO_URI = process.env.DB_URL || process.env.DB_URI || '';
const DB_NAME = process.env.DB_NAME || '';

const QUESTIONS_COLLECTION = 'questions';
const SUBMISSIONS_COLLECTION = 'question_submissions';
const ANSWERS_COLLECTION = 'answers';
const USERS_COLLECTION = 'users';

const INPUT_EXCEL_PATH = './RDQA-18th Aug.xlsx';
const OUTPUT_EXCEL_PATH = './RDQA-18th Aug-Enriched.xlsx';

// ============================================================
// HELPERS
// ============================================================

/**
 * Format user full name from user document
 */
function formatUserName(user) {
  if (!user) return '';
  return `${user.firstName || ''} ${user.lastName || ''}`.trim();
}

/**
 * Parse Excel date representation (Date, string, or serial number)
 */
function parseExcelDate(rawDate) {
  if (!rawDate) return null;
  if (rawDate instanceof Date) return isNaN(rawDate.getTime()) ? null : rawDate;

  // Handle Excel serial date numbers
  if (typeof rawDate === 'number') {
    return new Date(Math.round((rawDate - 25569) * 86400 * 1000));
  }

  const parsed = new Date(rawDate);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ============================================================
// MAIN PROCESSING FUNCTION
// ============================================================

async function enrichExcelData() {
  const client = new MongoClient(MONGO_URI);

  try {
    // --------------------------------------------------------
    // Connect to MongoDB
    // --------------------------------------------------------
    console.log('🚀 Connecting to MongoDB at:', MONGO_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB successfully.\n');

    const db = client.db(DB_NAME);
    const questionsCollection = db.collection(QUESTIONS_COLLECTION);
    const submissionsCollection = db.collection(SUBMISSIONS_COLLECTION);
    const answersCollection = db.collection(ANSWERS_COLLECTION);
    const usersCollection = db.collection(USERS_COLLECTION);

    // In-memory cache for user names
    const userCache = new Map();

    async function getUserName(userId) {
      if (!userId) return '';
      const idStr = String(userId);

      if (userCache.has(idStr)) {
        return userCache.get(idStr);
      }

      let queryId = idStr;
      if (ObjectId.isValid(idStr)) {
        queryId = new ObjectId(idStr);
      }

      const user = await usersCollection.findOne(
        { _id: queryId },
        { projection: { firstName: 1, lastName: 1 } }
      );

      const fullName = formatUserName(user);
      userCache.set(idStr, fullName);
      return fullName;
    }

    // --------------------------------------------------------
    // Read Excel File
    // --------------------------------------------------------
    console.log(`📖 Reading Excel file: ${INPUT_EXCEL_PATH}...`);
    const workbook = XLSX.readFile(INPUT_EXCEL_PATH, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error('❌ Worksheet not found in Excel file.');
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    console.log(`✅ Loaded ${rows.length} rows from sheet: "${sheetName}".\n`);

    // --------------------------------------------------------
    // Process Rows & Lookup Collections
    // --------------------------------------------------------
    console.log('🔍 Processing and querying database...');

    const enrichedRows = [];
    let maxLevelsCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const questionText = String(row['Question'] || '').trim();
      const rawCreatedAt = row['Created At'];
      const createdAtDate = parseExcelDate(rawCreatedAt);

      if (!questionText) {
        enrichedRows.push({ ...row, questionId: '', author: '', levels: [], moderator: '' });
        continue;
      }

      // 1. Find the question in MongoDB
      let questionDoc = null;

      if (createdAtDate) {
        const startOfDay = new Date(createdAtDate);
        startOfDay.setUTCHours(0, 0, 0, 0);

        const endOfDay = new Date(createdAtDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        questionDoc = await questionsCollection.findOne({
          question: questionText,
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        });
      }

      // Fallback matching by exact question text
      if (!questionDoc) {
        questionDoc = await questionsCollection.findOne({
          question: questionText,
        });
      }

      let questionIdStr = '';
      let authorName = '';
      const levelNames = [];
      let moderatorName = '';

      if (questionDoc && questionDoc._id) {
        const qId = questionDoc._id;
        questionIdStr = qId.toString();

        // 2. Lookup Question Submission History
        const submission = await submissionsCollection.findOne({
          $or: [{ questionId: qId }, { questionId: questionIdStr }],
        });

        if (submission && Array.isArray(submission.history)) {
          for (let hIdx = 0; hIdx < submission.history.length; hIdx++) {
            const historyItem = submission.history[hIdx];
            const userName = await getUserName(historyItem.updatedBy);

            if (hIdx === 0) {
              authorName = userName;
            } else {
              levelNames.push(userName);
            }
          }

          if (levelNames.length > maxLevelsCount) {
            maxLevelsCount = levelNames.length;
          }
        }

        // 3. Lookup Answer & Moderator (approvedBy)
        const answerDoc = await answersCollection.findOne(
          {
            $or: [{ questionId: qId }, { questionId: questionIdStr }],
            approvedBy: { $exists: true, $ne: null },
          },
          { sort: { isFinalAnswer: -1, createdAt: -1 } }
        );

        if (answerDoc && answerDoc.approvedBy) {
          moderatorName = await getUserName(answerDoc.approvedBy);
        }
      }

      enrichedRows.push({
        ...row,
        questionId: questionIdStr,
        author: authorName,
        levels: levelNames,
        moderator: moderatorName,
      });

      if ((i + 1) % 20 === 0 || i === rows.length - 1) {
        console.log(`⏳ Processed ${i + 1}/${rows.length} rows`);
      }
    }

    // --------------------------------------------------------
    // Flatten Dynamic Level Columns
    // --------------------------------------------------------
    const finalFormattedRows = enrichedRows.map((item) => {
      const { levels, ...rest } = item;
      const formatted = { ...rest };

      // Ensure every row has matching level 1, level 2, ... columns
      for (let l = 1; l <= maxLevelsCount; l++) {
        formatted[`level ${l}`] = levels && levels[l - 1] ? levels[l - 1] : '';
      }

      // Re-position moderator at the end
      const moderatorVal = formatted.moderator;
      delete formatted.moderator;
      formatted.moderator = moderatorVal;

      return formatted;
    });

    // --------------------------------------------------------
    // Write Enriched File
    // --------------------------------------------------------
    const newWorksheet = XLSX.utils.json_to_sheet(finalFormattedRows);
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);

    XLSX.writeFile(newWorkbook, OUTPUT_EXCEL_PATH);

    // ========================================================
    // SUMMARY REPORT
    // ========================================================
    console.log('\n==================================================');
    console.log('               ENRICHMENT COMPLETED');
    console.log('==================================================');
    console.log(`Total Rows Processed : ${rows.length}`);
    console.log(`Max Review Levels    : ${maxLevelsCount}`);
    console.log(`Output File Saved To : ${OUTPUT_EXCEL_PATH}`);
    console.log('==================================================\n');
  } catch (error) {
    console.error('🔴 Error enriching Excel data:', error);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

// ============================================================
// RUN
// ============================================================

enrichExcelData();