// import { MongoClient, ObjectId } from 'mongodb';
// import ExcelJS from 'exceljs';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import 'dotenv/config';
// // Resolve current script directory (__dirname equivalent in ESM)
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // --- Configuration ---
// const MONGO_URI = process.env.DB_URL;
// const DB_NAME = process.env.DB_NAME || 'agriai';
// console.log("mongoUri ",MONGO_URI)
// console.log("dbName ",DB_NAME)
// // Resolves relative to this script's directory
// // (Change to '../Anara Analysis.xlsx' if the file is in the project root instead of scripts/)
// const INPUT_EXCEL_PATH = path.resolve(__dirname, 'Anara Analysis.xlsx');
// const OUTPUT_EXCEL_PATH = path.resolve(__dirname, 'Anara Analysis Updated.xlsx');

// // Helper to safely parse string to ObjectId if valid
// function toObjectId(id) {
//   if (!id) return null;
//   if (id instanceof ObjectId) return id;
//   const str = id.toString().trim();
//   return ObjectId.isValid(str) ? new ObjectId(str) : null;
// }

// export async function updateExcelWithMongoData() {
//   const client = new MongoClient(MONGO_URI);

//   try {
//     await client.connect();
//     console.log('Connected to MongoDB successfully.');
//     const db = client.db(DB_NAME);

//     const questionsColl = db.collection('question');
//     const submissionsColl = db.collection('question_submission');
//     const answersColl = db.collection('answer');
//     console.log('Collections initialized: question, question_submission, answer');
//     // 1. Read Excel workbook and get target worksheet
//     const workbook = new ExcelJS.Workbook();
//     await workbook.xlsx.readFile(INPUT_EXCEL_PATH);
//     const worksheet = workbook.getWorksheet('Sheet2') || workbook.worksheets[0];

//     // 2. Identify column indexes dynamically from row 1
//     let qidColIdx = -1;
//     let aiAnsColIdx = -1;
//     let authorAnsColIdx = -1;

//     worksheet.getRow(1).eachCell((cell, colNumber) => {
//       const headerText = cell.value ? cell.value.toString().trim() : '';
//       if (headerText === 'QID') {
//         qidColIdx = colNumber;
//       } else if (headerText === 'AI generated ans') {
//         aiAnsColIdx = colNumber;
//       } else if (headerText === 'Author ans') {
//         authorAnsColIdx = colNumber;
//       }
//     });

//     if (qidColIdx === -1 || aiAnsColIdx === -1 || authorAnsColIdx === -1) {
//       throw new Error(
//         `Required column missing. QID: ${qidColIdx}, AI generated ans: ${aiAnsColIdx}, Author ans: ${authorAnsColIdx}`
//       );
//     }

//     // 3. Extract QIDs from Excel rows
//     const rowMappings = [];
//     const validQuestionObjectIds = [];
//     const rawQuestionIds = [];

//     worksheet.eachRow((row, rowNumber) => {
//       if (rowNumber === 1) return; // Skip header

//       const rawQid = row.getCell(qidColIdx).value;
//       if (rawQid) {
//         const qidStr = rawQid.toString().trim();
//         const objId = toObjectId(qidStr);

//         rowMappings.push({ rowNumber, qidStr, objId });
//         rawQuestionIds.push(qidStr);
//         if (objId) {
//           validQuestionObjectIds.push(objId);
//         }
//       }
//     });

//     console.log(`Found ${rowMappings.length} questions to process.`);
//     if (rowMappings.length === 0) {
//       console.log('No rows to process. Exiting.');
//       return;
//     }

//     // 4. Batch query Question collection for aiInitialAnswer
//     const questionIdQuery = [...validQuestionObjectIds, ...rawQuestionIds];

//     const questions = await questionsColl
//       .find(
//         { _id: { $in: questionIdQuery } },
//         { projection: { _id: 1, aiInitialAnswer: 1 } }
//       )
//       .toArray();

//     const questionMap = new Map();
//     for (const q of questions) {
//       questionMap.set(q._id.toString(), q.aiInitialAnswer || '');
//     }

//     // 5. Batch query QuestionSubmission collection by questionId
//     const submissions = await submissionsColl
//       .find(
//         {
//           questionId: {
//             $in: [...validQuestionObjectIds, ...rawQuestionIds]
//           }
//         },
//         {
//           projection: {
//             questionId: 1,
//             history: { $slice: 1 } // only fetch history[0]
//           }
//         }
//       )
//       .toArray();

//     const subAnswerIdMap = new Map(); // questionIdStr -> answerIdStr
//     const answerObjectIds = [];
//     const rawAnswerIds = [];

//     for (const sub of submissions) {
//       const qKey = sub.questionId?.toString();
//       const firstHistory = sub.history && sub.history.length > 0 ? sub.history[0] : null;

//       if (qKey && firstHistory && firstHistory.answer) {
//         const ansIdStr = firstHistory.answer.toString().trim();
//         subAnswerIdMap.set(qKey, ansIdStr);

//         rawAnswerIds.push(ansIdStr);
//         const ansObjId = toObjectId(ansIdStr);
//         if (ansObjId) {
//           answerObjectIds.push(ansObjId);
//         }
//       }
//     }

//     // 6. Batch query Answer collection for author answer text
//     const answerIdQuery = [...answerObjectIds, ...rawAnswerIds];
//     const answers = await answersColl
//       .find(
//         { _id: { $in: answerIdQuery } },
//         { projection: { _id: 1, answer: 1 } }
//       )
//       .toArray();

//     const answerMap = new Map();
//     for (const ans of answers) {
//       answerMap.set(ans._id.toString(), ans.answer || '');
//     }

//     // 7. Populate Excel rows
//     for (const { rowNumber, qidStr } of rowMappings) {
//       const row = worksheet.getRow(rowNumber);

//       // AI generated ans
//       const aiAns = questionMap.get(qidStr) || '';
//       row.getCell(aiAnsColIdx).value = aiAns;

//       // Author ans
//       const answerId = subAnswerIdMap.get(qidStr);
//       const authorAns = answerId ? answerMap.get(answerId) || '' : '';
//       row.getCell(authorAnsColIdx).value = authorAns;

//       row.commit();
//     }

//     // 8. Save updated Excel
//     await workbook.xlsx.writeFile(OUTPUT_EXCEL_PATH);
//     console.log(`Updated Excel saved successfully to: ${OUTPUT_EXCEL_PATH}`);
//   } catch (err) {
//     console.error('Error during execution:', err);
//   } finally {
//     await client.close();
//   }
// }

// // Self-invoking execution
// await updateExcelWithMongoData();






import { MongoClient, ObjectId } from 'mongodb';
import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
// Make sure this matches your actual env or replica set URI
const MONGO_URI = process.env.DB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'your_database_name'; 

const INPUT_EXCEL_PATH = path.resolve(__dirname, 'Anara Analysis.xlsx');
const OUTPUT_EXCEL_PATH = path.resolve(__dirname, 'Anara Analysis Updated.xlsx');

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  const str = id.toString().trim();
  return ObjectId.isValid(str) ? new ObjectId(str) : null;
}

export async function updateExcelWithMongoData() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log(`Connected to MongoDB. Using DB: "${DB_NAME}"`);
    const db = client.db(DB_NAME);

    // List all collections in this DB to verify names
    const existingCollections = (await db.listCollections().toArray()).map(c => c.name);
    console.log('Available collections in database:', existingCollections);

    // Auto-detect singular vs plural collection names
    const qCollName = existingCollections.includes('question') ? 'question' : 'questions';
    const subCollName = existingCollections.includes('question_submission') 
      ? 'question_submission' 
      : (existingCollections.includes('questionsubmissions') ? 'questionsubmissions' : 'question_submissions');
    const ansCollName = existingCollections.includes('answer') ? 'answer' : 'answers';

    console.log(`Target collections:
  - Questions: "${qCollName}"
  - Submissions: "${subCollName}"
  - Answers: "${ansCollName}"`);

    const questionsColl = db.collection(qCollName);
    const submissionsColl = db.collection(subCollName);
    const answersColl = db.collection(ansCollName);

    // 1. Read Excel workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(INPUT_EXCEL_PATH);
    const worksheet = workbook.getWorksheet('Sheet2') || workbook.worksheets[0];

    // 2. Identify column indexes
    let qidColIdx = -1;
    let aiAnsColIdx = -1;
    let authorAnsColIdx = -1;

    worksheet.getRow(1).eachCell((cell, colNumber) => {
      const headerText = cell.value ? cell.value.toString().trim() : '';
      if (headerText === 'QID') qidColIdx = colNumber;
      else if (headerText === 'AI generated ans') aiAnsColIdx = colNumber;
      else if (headerText === 'Author ans') authorAnsColIdx = colNumber;
    });

    if (qidColIdx === -1 || aiAnsColIdx === -1 || authorAnsColIdx === -1) {
      throw new Error(`Columns missing in header. QID: ${qidColIdx}, AI: ${aiAnsColIdx}, Author: ${authorAnsColIdx}`);
    }

    // 3. Extract QIDs
    const rowMappings = [];
    const validQuestionObjectIds = [];
    const rawQuestionIds = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rawQid = row.getCell(qidColIdx).value;
      if (rawQid) {
        const qidStr = rawQid.toString().trim();
        const objId = toObjectId(qidStr);

        rowMappings.push({ rowNumber, qidStr, objId });
        rawQuestionIds.push(qidStr);
        if (objId) validQuestionObjectIds.push(objId);
      }
    });

    console.log(`\nFound ${rowMappings.length} QIDs in Excel.`);
    const sampleId = rowMappings[0]?.qidStr;
    console.log(`Testing first QID: "${sampleId}"`);

    // 4. Batch Query Questions
    const questionIdQuery = [...validQuestionObjectIds, ...rawQuestionIds];
    const questions = await questionsColl
      .find(
        { _id: { $in: questionIdQuery } },
        { projection: { _id: 1, aiInitialAnswer: 1 } }
      )
      .toArray();

    console.log(`[Questions] Found ${questions.length} / ${rowMappings.length} documents matching.`);
    if (questions.length > 0) {
      console.log('Sample question aiInitialAnswer:', questions[0].aiInitialAnswer ? 'Present' : 'Empty/Null');
    }

    const questionMap = new Map();
    for (const q of questions) {
      questionMap.set(q._id.toString(), q.aiInitialAnswer || '');
    }

    // 5. Batch Query Submissions
    const submissions = await submissionsColl
      .find(
        {
          $or: [
            { questionId: { $in: [...validQuestionObjectIds, ...rawQuestionIds] } },
            { question: { $in: [...validQuestionObjectIds, ...rawQuestionIds] } }
          ]
        },
        {
          projection: {
            questionId: 1,
            question: 1,
            history: { $slice: 1 }
          }
        }
      )
      .toArray();

    console.log(`[Submissions] Found ${submissions.length} documents matching.`);

    const subAnswerIdMap = new Map();
    const answerObjectIds = [];
    const rawAnswerIds = [];

    for (const sub of submissions) {
      const qKey = (sub.questionId || sub.question)?.toString();
      const firstHistory = sub.history && sub.history.length > 0 ? sub.history[0] : null;

      if (qKey && firstHistory && firstHistory.answer) {
        const ansIdStr = firstHistory.answer.toString().trim();
        subAnswerIdMap.set(qKey, ansIdStr);
        rawAnswerIds.push(ansIdStr);

        const ansObjId = toObjectId(ansIdStr);
        if (ansObjId) answerObjectIds.push(ansObjId);
      }
    }

    // 6. Batch Query Answers
    const answerIdQuery = [...answerObjectIds, ...rawAnswerIds];
    const answers = await answersColl
      .find(
        { _id: { $in: answerIdQuery } },
        { projection: { _id: 1, answer: 1 } }
      )
      .toArray();

    console.log(`[Answers] Found ${answers.length} documents matching.`);

    const answerMap = new Map();
    for (const ans of answers) {
      answerMap.set(ans._id.toString(), ans.answer || '');
    }

    // 7. Populate Excel rows
    let aiPopulatedCount = 0;
    let authorPopulatedCount = 0;

    for (const { rowNumber, qidStr } of rowMappings) {
      const row = worksheet.getRow(rowNumber);

      const aiAns = questionMap.get(qidStr) || '';
      if (aiAns) aiPopulatedCount++;
      row.getCell(aiAnsColIdx).value = aiAns;

      const answerId = subAnswerIdMap.get(qidStr);
      const authorAns = answerId ? answerMap.get(answerId) || '' : '';
      if (authorAns) authorPopulatedCount++;
      row.getCell(authorAnsColIdx).value = authorAns;

      row.commit();
    }

    console.log(`\nResults:`);
    console.log(`- Rows with AI Answer populated: ${aiPopulatedCount}`);
    console.log(`- Rows with Author Answer populated: ${authorPopulatedCount}`);

    // 8. Save updated Excel
    await workbook.xlsx.writeFile(OUTPUT_EXCEL_PATH);
    console.log(`Updated Excel saved successfully to: ${OUTPUT_EXCEL_PATH}`);
  } catch (err) {
    console.error('Error during execution:', err);
  } finally {
    await client.close();
  }
}

await updateExcelWithMongoData();