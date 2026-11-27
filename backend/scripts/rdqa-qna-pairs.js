
// /**
//  * RDQA Q&A Pairs → Excel
//  *
//  * Fetches questions closed within a configured IST date range.
//  *
//  * Collections:
//  *   - questions
//  *   - answers
//  *   - users
//  *
//  * Excel columns:
//  *   Sl No
//  *   Question
//  *   Status
//  *   Priority
//  *   State
//  *   District
//  *   Crop
//  *   Season
//  *   Domain
//  *   Normalized Crop
//  *   Question Source
//  *   Closed At
//  *   Created At
//  *   Answer
//  *   Answer Sources
//  *   Closed By
//  *   Author ID
//  *   Author Email
//  *
//  * Answer selection:
//  *   1. Prefer isFinalAnswer: true
//  *   2. If no final answer exists, select the latest answer.
//  *
//  * Dates are interpreted as IST calendar days.
//  *
//  * Read-only. Uses DB_URL / DB_NAME from .env.
//  *
//  * Usage:
//  *   node scripts/rdqa-qna-pairs.js
//  *   node scripts/rdqa-qna-pairs.js --out=rdqa-qna-pairs.xlsx
//  */

// import 'dotenv/config';

// import { MongoClient, ObjectId } from 'mongodb';
// import ExcelJS from 'exceljs';
// import path from 'node:path';

// // --------------------------------------------------
// // Date Configuration (IST)
// // --------------------------------------------------

// const FROM_DATE = '2026-11-19';
// const TO_DATE = '2026-11-19';

// // --------------------------------------------------
// // Arguments
// // --------------------------------------------------

// const args = process.argv.slice(2);

// const argVal = (name, fallback) => {
//   const hit = args.find(a => a.startsWith(`--${name}=`));
//   return hit ? hit.slice(name.length + 3) : fallback;
// };

// const OUT = argVal(
//   'out',
//   `rdqa-qna-pairs-${FROM_DATE}-to-${TO_DATE}.xlsx`,
// );

// // --------------------------------------------------
// // Date Helpers
// // --------------------------------------------------

// const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// const from = new Date(`${FROM_DATE}T00:00:00.000+05:30`);

// // Exclusive upper boundary: midnight after TO_DATE.
// const toExclusive = new Date(
//   new Date(`${TO_DATE}T00:00:00.000+05:30`).getTime() +
//     24 * 60 * 60 * 1000,
// );

// if (
//   Number.isNaN(from.getTime()) ||
//   Number.isNaN(toExclusive.getTime()) ||
//   from >= toExclusive
// ) {
//   console.error('❌ Invalid date range. Use YYYY-MM-DD.');
//   process.exit(1);
// }

// // Excel date cells don't carry timezone information.
// // Shift timestamps to display IST.
// const asIST = value => {
//   if (!value) return null;

//   const date = new Date(value);

//   if (Number.isNaN(date.getTime())) return null;

//   return new Date(date.getTime() + IST_OFFSET_MS);
// };

// // --------------------------------------------------
// // Database Configuration
// // --------------------------------------------------

// const DB_URL = process.env.DB_URL;
// const DB_NAME = process.env.DB_NAME || 'agriai';

// if (!DB_URL) {
//   console.error('❌ DB_URL is not set. Configure it in .env.');
//   process.exit(1);
// }

// // --------------------------------------------------
// // General Helpers
// // --------------------------------------------------

// const idStr = value => (value ? value.toString() : '');

// const toObjectId = value => {
//   const id = idStr(value);

//   if (!id || !ObjectId.isValid(id)) return null;

//   return new ObjectId(id);
// };

// // Convert values into Excel-friendly strings.
// const displayValue = value => {
//   if (value === null || value === undefined) return '';

//   if (Array.isArray(value)) {
//     return value.map(displayValue).join(', ');
//   }

//   if (typeof value === 'object') {
//     return JSON.stringify(value);
//   }

//   return String(value);
// };

// // --------------------------------------------------
// // Run
// // --------------------------------------------------

// const client = new MongoClient(DB_URL);

// await client.connect();

// console.log('✅ Connected to MongoDB');

// try {
//   const db = client.db(DB_NAME);

//   const questionsCollection = db.collection('questions');
//   const answersCollection = db.collection('answers');
//   const usersCollection = db.collection('users');

//   // --------------------------------------------------
//   // Step 1: Fetch Questions
//   // --------------------------------------------------

//   const questionFilter = {
//     closedAt: {
//       $gte: from,
//       $lt: toExclusive,
//     },
//   };

//   console.log('\n📅 Date Range (IST)');
//   console.log(`From: ${FROM_DATE}`);
//   console.log(`To:   ${TO_DATE}`);

//   const questions = await questionsCollection
//     .find(questionFilter)
//     .sort({ closedAt: 1 })
//     .toArray();

//   console.log(`\n📦 Questions found: ${questions.length}`);

//   if (questions.length === 0) {
//     console.log('Nothing to export. No questions found.');
//     process.exitCode = 0;
//   } else {
//     // --------------------------------------------------
//     // Step 2: Fetch Related Answers
//     // --------------------------------------------------

//     const questionIds = questions.map(q => q._id);

//     const answers = await answersCollection
//       .find({
//         questionId: { $in: questionIds },
//       })
//       .sort({
//         answerIteration: 1,
//         createdAt: 1,
//       })
//       .toArray();

//     console.log(`📝 Answers found: ${answers.length}`);

//     // Group answers by questionId.
//     const answersByQuestion = new Map();

//     for (const answer of answers) {
//       const key = idStr(answer.questionId);

//       if (!answersByQuestion.has(key)) {
//         answersByQuestion.set(key, []);
//       }

//       answersByQuestion.get(key).push(answer);
//     }

//     // --------------------------------------------------
//     // Step 3: Select Answer for Each Question
//     // --------------------------------------------------

//     const selectedAnswers = questions.map(question => {
//       const questionAnswers =
//         answersByQuestion.get(idStr(question._id)) ?? [];

//       // Prefer the final answer.
//       const finalAnswer = questionAnswers
//         .filter(answer => answer.isFinalAnswer)
//         .at(-1);

//       // Otherwise, use the latest available answer.
//       const selectedAnswer =
//         finalAnswer ?? questionAnswers.at(-1) ?? null;

//       return {
//         question,
//         answer: selectedAnswer,
//       };
//     });

//     // --------------------------------------------------
//     // Step 4: Collect Author IDs
//     // --------------------------------------------------

//     const authorIds = new Set();

//     for (const { answer } of selectedAnswers) {
//       if (!answer?.authorId) continue;

//       const objectId = toObjectId(answer.authorId);

//       if (objectId) {
//         authorIds.add(objectId.toString());
//       }
//     }

//     // --------------------------------------------------
//     // Step 5: Fetch Users in Bulk
//     // --------------------------------------------------

//     const users = authorIds.size
//       ? await usersCollection
//           .find({
//             _id: {
//               $in: [...authorIds].map(id => new ObjectId(id)),
//             },
//           })
//           .project({
//             email: 1,
//             firstName: 1,
//             lastName: 1,
//           })
//           .toArray()
//       : [];

//     const userById = new Map(
//       users.map(user => [idStr(user._id), user]),
//     );

//     console.log(`👤 Authors found: ${users.length}`);

//     // --------------------------------------------------
//     // Step 6: Build Excel Rows
//     // --------------------------------------------------

//     const rows = selectedAnswers.map(
//       ({ question, answer }, index) => {
//         const details = question.details ?? {};

//         const authorId = answer?.authorId ?? null;

//         const author = authorId
//           ? userById.get(idStr(authorId))
//           : null;

//         return {
//           'Sl No': index + 1,

//           Question: question.question ?? '',

//           Status: question.status ?? '',

//           Priority: displayValue(question.priority),

//           State: details.state ?? '',

//           District: details.district ?? '',

//           Crop: displayValue(details.crop),

//           Season: details.season ?? '',

//           Domain: displayValue(details.domain),

//           'Normalized Crop': details.normalised_crop ?? '',

//           'Question Source': question.source ?? '',

//           'Closed At (IST)': asIST(question.closedAt),

//           'Created At (IST)': asIST(question.createdAt),

//           Answer: answer?.answer ?? '',

//           'Answer Sources': displayValue(answer?.sources),

//           'Closed By': question.closedBy ?? '',

//           'Author ID': idStr(authorId),

//           'Author Email': author?.email ?? '',
//         };
//       },
//     );

//     // --------------------------------------------------
//     // Step 7: Create Excel Workbook
//     // --------------------------------------------------

//     const workbook = new ExcelJS.Workbook();

//     workbook.creator = 'RDQA Q&A Pairs Export';
//     workbook.created = new Date();

//     const worksheet = workbook.addWorksheet('RDQA Q&A Pairs');

//     const headers = Object.keys(rows[0]);

//     worksheet.columns = headers.map(header => ({
//       header,
//       key: header,

//       width:
//         header === 'Question'
//           ? 60
//           : header === 'Answer'
//             ? 80
//             : header === 'Answer Sources'
//               ? 60
//               : header === 'Priority'
//                 ? 25
//                 : header.includes('At (IST)')
//                   ? 22
//                   : Math.min(Math.max(header.length + 4, 15), 30),
//     }));

//     // Add data rows.
//     rows.forEach(row => {
//       worksheet.addRow(row);
//     });

//     // --------------------------------------------------
//     // Step 8: Excel Formatting
//     // --------------------------------------------------

//     const headerRow = worksheet.getRow(1);

//     headerRow.font = {
//       bold: true,
//     };

//     headerRow.eachCell(cell => {
//       cell.fill = {
//         type: 'pattern',
//         pattern: 'solid',
//         fgColor: {
//           argb: 'FFE4F6EA',
//         },
//       };

//       cell.alignment = {
//         vertical: 'middle',
//         horizontal: 'center',
//         wrapText: true,
//       };
//     });

//     // Wrap long question and answer text.
//     rows.forEach((_, index) => {
//       const row = worksheet.getRow(index + 2);

//       row.getCell('Question').alignment = {
//         vertical: 'top',
//         wrapText: true,
//       };

//       row.getCell('Answer').alignment = {
//         vertical: 'top',
//         wrapText: true,
//       };

//       row.getCell('Answer Sources').alignment = {
//         vertical: 'top',
//         wrapText: true,
//       };
//     });

//     // Format timestamps as IST.
//     const dateColumns = [
//       'Closed At (IST)',
//       'Created At (IST)',
//     ];

//     dateColumns.forEach(column => {
//       const columnNumber = headers.indexOf(column) + 1;

//       for (let row = 2; row <= worksheet.rowCount; row++) {
//         worksheet.getRow(row).getCell(columnNumber).numFmt =
//           'yyyy-mm-dd hh:mm:ss';
//       }
//     });

//     // Freeze header and enable filters.
//     worksheet.views = [
//       {
//         state: 'frozen',
//         ySplit: 1,
//       },
//     ];

//     worksheet.autoFilter = {
//       from: {
//         row: 1,
//         column: 1,
//       },
//       to: {
//         row: 1,
//         column: headers.length,
//       },
//     };

//     // --------------------------------------------------
//     // Step 9: Write Excel File
//     // --------------------------------------------------

//     const outPath = path.resolve(OUT);

//     await workbook.xlsx.writeFile(outPath);

//     // --------------------------------------------------
//     // Step 10: Summary
//     // --------------------------------------------------

//     const questionsWithAnswers = selectedAnswers.filter(
//       item => item.answer !== null,
//     ).length;

//     const questionsWithoutAnswers =
//       questions.length - questionsWithAnswers;

//     const finalAnswersCount = selectedAnswers.filter(
//       item => item.answer?.isFinalAnswer === true,
//     ).length;

//     console.log('\n======================================');
//     console.log('       RDQA Q&A PAIRS REPORT');
//     console.log('======================================');

//     console.log(`📅 Date Range       : ${FROM_DATE} → ${TO_DATE}`);
//     console.log(`📦 Total Questions  : ${questions.length}`);
//     console.log(`📝 Questions with Answers: ${questionsWithAnswers}`);
//     console.log(`⚠️ Questions without Answers: ${questionsWithoutAnswers}`);
//     console.log(`✅ Final Answers    : ${finalAnswersCount}`);
//     console.log(`👤 Authors Resolved : ${users.length}`);
//     console.log(`📄 Excel File       : ${outPath}`);

//     console.log('\n✅ Export completed successfully!');
//   }
// } catch (error) {
//   console.error('\n❌ Error exporting RDQA Q&A pairs:', error);
//   process.exitCode = 1;
// } finally {
//   await client.close();
//   console.log('\n🔒 MongoDB connection closed');
// }



/**
 * RDQA Q&A Pairs → Excel
 *
 * Fetches questions closed within a configured IST date range.
 *
 * Collections:
 *   - questions
 *   - answers
 *   - users
 *
 * Excel columns:
 *   Sl No
 *   Question
 *   Status
 *   Priority
 *   State
 *   District
 *   Crop
 *   Season
 *   Domain
 *   Normalized Crop
 *   Question Source
 *   Closed At
 *   Created At
 *   Answer
 *   Answer Sources
 *   Closed By (Approved By Email)
 *   Author ID
 *   Author Email
 *
 * Answer selection:
 *   1. Prefer isFinalAnswer: true
 *   2. If no final answer exists, select the latest answer.
 *
 * Closed By:
 *   Uses answers.approvedBy and resolves the user's email.
 *
 * Dates are interpreted as IST calendar days.
 *
 * Read-only. Uses DB_URL / DB_NAME from .env.
 *
 * Usage:
 *   node scripts/rdqa-qna-pairs.js
 *   node scripts/rdqa-qna-pairs.js --out=rdqa-qna-pairs.xlsx
 */

// import 'dotenv/config';

// import { MongoClient, ObjectId } from 'mongodb';
// import ExcelJS from 'exceljs';
// import path from 'node:path';

// // --------------------------------------------------
// // Date Configuration (IST)
// // --------------------------------------------------

// const FROM_DATE = '2026-11-19';
// const TO_DATE = '2026-11-19';

// // --------------------------------------------------
// // Arguments
// // --------------------------------------------------

// const args = process.argv.slice(2);

// const argVal = (name, fallback) => {
//   const hit = args.find(a => a.startsWith(`--${name}=`));
//   return hit ? hit.slice(name.length + 3) : fallback;
// };

// const OUT = argVal(
//   'out',
//   `rdqa-qna-pairs-${FROM_DATE}-to-${TO_DATE}.xlsx`,
// );

// // --------------------------------------------------
// // Date Helpers
// // --------------------------------------------------

// const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// const from = new Date(`${FROM_DATE}T00:00:00.000+05:30`);

// const toExclusive = new Date(
//   new Date(`${TO_DATE}T00:00:00.000+05:30`).getTime() +
//     24 * 60 * 60 * 1000,
// );

// if (
//   Number.isNaN(from.getTime()) ||
//   Number.isNaN(toExclusive.getTime()) ||
//   from >= toExclusive
// ) {
//   console.error('❌ Invalid date range. Use YYYY-MM-DD.');
//   process.exit(1);
// }

// // Excel date cells don't carry timezone information.
// // Shift timestamps to display IST.
// const asIST = value => {
//   if (!value) return null;

//   const date = new Date(value);

//   if (Number.isNaN(date.getTime())) return null;

//   return new Date(date.getTime() + IST_OFFSET_MS);
// };

// // --------------------------------------------------
// // Database Configuration
// // --------------------------------------------------

// const DB_URL = process.env.DB_URL;
// const DB_NAME = process.env.DB_NAME || 'agriai';

// if (!DB_URL) {
//   console.error('❌ DB_URL is not set. Configure it in .env.');
//   process.exit(1);
// }

// // --------------------------------------------------
// // General Helpers
// // --------------------------------------------------

// const idStr = value => (value ? value.toString() : '');

// const toObjectId = value => {
//   const id = idStr(value);

//   if (!id || !ObjectId.isValid(id)) return null;

//   return new ObjectId(id);
// };

// // Convert values into Excel-friendly strings.
// const displayValue = value => {
//   if (value === null || value === undefined) return '';

//   if (Array.isArray(value)) {
//     return value.map(displayValue).join(', ');
//   }

//   if (typeof value === 'object') {
//     return JSON.stringify(value);
//   }

//   return String(value);
// };

// // --------------------------------------------------
// // Run
// // --------------------------------------------------

// const client = new MongoClient(DB_URL);

// await client.connect();

// console.log('✅ Connected to MongoDB');

// try {
//   const db = client.db(DB_NAME);

//   const questionsCollection = db.collection('questions');
//   const answersCollection = db.collection('answers');
//   const usersCollection = db.collection('users');

//   // --------------------------------------------------
//   // Step 1: Fetch Questions
//   // --------------------------------------------------

//   const questionFilter = {
//     closedAt: {
//       $gte: from,
//       $lt: toExclusive,
//     },
//   };

//   console.log('\n📅 Date Range (IST)');
//   console.log(`From: ${FROM_DATE}`);
//   console.log(`To:   ${TO_DATE}`);

//   const questions = await questionsCollection
//     .find(questionFilter)
//     .sort({ closedAt: 1 })
//     .toArray();

//   console.log(`\n📦 Questions found: ${questions.length}`);

//   if (questions.length === 0) {
//     console.log('Nothing to export. No questions found.');
//     process.exitCode = 0;
//   } else {
//     // --------------------------------------------------
//     // Step 2: Fetch Related Answers
//     // --------------------------------------------------

//     const questionIds = questions.map(q => q._id);

//     const answers = await answersCollection
//       .find({
//         questionId: { $in: questionIds },
//       })
//       .sort({
//         answerIteration: 1,
//         createdAt: 1,
//       })
//       .toArray();

//     console.log(`📝 Answers found: ${answers.length}`);

//     // Group answers by questionId.
//     const answersByQuestion = new Map();

//     for (const answer of answers) {
//       const key = idStr(answer.questionId);

//       if (!answersByQuestion.has(key)) {
//         answersByQuestion.set(key, []);
//       }

//       answersByQuestion.get(key).push(answer);
//     }

//     // --------------------------------------------------
//     // Step 3: Select Answer for Each Question
//     // --------------------------------------------------

//     const selectedAnswers = questions.map(question => {
//       const questionAnswers =
//         answersByQuestion.get(idStr(question._id)) ?? [];

//       // Prefer the latest final answer.
//       const finalAnswer = questionAnswers
//         .filter(answer => answer.isFinalAnswer)
//         .at(-1);

//       // Otherwise, use the latest available answer.
//       const selectedAnswer =
//         finalAnswer ?? questionAnswers.at(-1) ?? null;

//       return {
//         question,
//         answer: selectedAnswer,
//       };
//     });

//     // --------------------------------------------------
//     // Step 4: Collect Author and Approver IDs
//     // --------------------------------------------------

//     const userIds = new Set();

//     for (const { answer } of selectedAnswers) {
//       if (!answer) continue;

//       // Answer author
//       const authorObjectId = toObjectId(answer.authorId);

//       if (authorObjectId) {
//         userIds.add(authorObjectId.toString());
//       }

//       // Answer approver
//       const approvedByObjectId = toObjectId(answer.approvedBy);

//       if (approvedByObjectId) {
//         userIds.add(approvedByObjectId.toString());
//       }
//     }

//     // --------------------------------------------------
//     // Step 5: Fetch Users in Bulk
//     // --------------------------------------------------

//     const users = userIds.size
//       ? await usersCollection
//           .find({
//             _id: {
//               $in: [...userIds].map(id => new ObjectId(id)),
//             },
//           })
//           .project({
//             email: 1,
//             firstName: 1,
//             lastName: 1,
//           })
//           .toArray()
//       : [];

//     const userById = new Map(
//       users.map(user => [idStr(user._id), user]),
//     );

//     console.log(`👤 Users resolved: ${users.length}`);

//     // --------------------------------------------------
//     // Step 6: Build Excel Rows
//     // --------------------------------------------------

//     const rows = selectedAnswers.map(
//       ({ question, answer }, index) => {
//         const details = question.details ?? {};

//         const authorId = answer?.authorId ?? null;
//         const approvedBy = answer?.approvedBy ?? null;

//         const author = authorId
//           ? userById.get(idStr(authorId))
//           : null;

//         const approver = approvedBy
//           ? userById.get(idStr(approvedBy))
//           : null;

//         return {
//           'Sl No': index + 1,

//           Question: question.question ?? '',

//           Status: question.status ?? '',

//           Priority: displayValue(question.priority),

//           State: details.state ?? '',

//           District: details.district ?? '',

//           Crop: displayValue(details.crop),

//           Season: details.season ?? '',

//           Domain: displayValue(details.domain),

//           'Normalized Crop': details.normalised_crop ?? '',

//           'Question Source': question.source ?? '',

//           'Closed At (IST)': asIST(question.closedAt),

//           'Created At (IST)': asIST(question.createdAt),

//           Answer: answer?.answer ?? '',

//           'Answer Sources': displayValue(answer?.sources),

//           'Closed By': approver?.email ?? '',

//           'Author ID': idStr(authorId),

//           'Author Email': author?.email ?? '',
//         };
//       },
//     );

//     // --------------------------------------------------
//     // Step 7: Create Excel Workbook
//     // --------------------------------------------------

//     const workbook = new ExcelJS.Workbook();

//     workbook.creator = 'RDQA Q&A Pairs Export';
//     workbook.created = new Date();

//     const worksheet = workbook.addWorksheet('RDQA Q&A Pairs');

//     const headers = Object.keys(rows[0]);

//     worksheet.columns = headers.map(header => ({
//       header,
//       key: header,

//       width:
//         header === 'Question'
//           ? 60
//           : header === 'Answer'
//             ? 80
//             : header === 'Answer Sources'
//               ? 60
//               : header === 'Priority'
//                 ? 25
//                 : header.includes('At (IST)')
//                   ? 22
//                   : Math.min(Math.max(header.length + 4, 15), 30),
//     }));

//     // Add data rows.
//     rows.forEach(row => {
//       worksheet.addRow(row);
//     });

//     // --------------------------------------------------
//     // Step 8: Excel Formatting
//     // --------------------------------------------------

//     const headerRow = worksheet.getRow(1);

//     headerRow.font = {
//       bold: true,
//     };

//     headerRow.eachCell(cell => {
//       cell.fill = {
//         type: 'pattern',
//         pattern: 'solid',
//         fgColor: {
//           argb: 'FFE4F6EA',
//         },
//       };

//       cell.alignment = {
//         vertical: 'middle',
//         horizontal: 'center',
//         wrapText: true,
//       };
//     });

//     // Wrap long question and answer text.
//     rows.forEach((_, index) => {
//       const row = worksheet.getRow(index + 2);

//       row.getCell('Question').alignment = {
//         vertical: 'top',
//         wrapText: true,
//       };

//       row.getCell('Answer').alignment = {
//         vertical: 'top',
//         wrapText: true,
//       };

//       row.getCell('Answer Sources').alignment = {
//         vertical: 'top',
//         wrapText: true,
//       };
//     });

//     // Format timestamps as IST.
//     const dateColumns = [
//       'Closed At (IST)',
//       'Created At (IST)',
//     ];

//     dateColumns.forEach(column => {
//       const columnNumber = headers.indexOf(column) + 1;

//       for (let row = 2; row <= worksheet.rowCount; row++) {
//         worksheet.getRow(row).getCell(columnNumber).numFmt =
//           'yyyy-mm-dd hh:mm:ss';
//       }
//     });

//     // Freeze header and enable filters.
//     worksheet.views = [
//       {
//         state: 'frozen',
//         ySplit: 1,
//       },
//     ];

//     worksheet.autoFilter = {
//       from: {
//         row: 1,
//         column: 1,
//       },
//       to: {
//         row: 1,
//         column: headers.length,
//       },
//     };

//     // --------------------------------------------------
//     // Step 9: Write Excel File
//     // --------------------------------------------------

//     const outPath = path.resolve(OUT);

//     await workbook.xlsx.writeFile(outPath);

//     // --------------------------------------------------
//     // Step 10: Summary
//     // --------------------------------------------------

//     const questionsWithAnswers = selectedAnswers.filter(
//       item => item.answer !== null,
//     ).length;

//     const questionsWithoutAnswers =
//       questions.length - questionsWithAnswers;

//     const finalAnswersCount = selectedAnswers.filter(
//       item => item.answer?.isFinalAnswer === true,
//     ).length;

//     const approvedAnswersCount = selectedAnswers.filter(
//       item => item.answer?.approvedBy,
//     ).length;

//     console.log('\n======================================');
//     console.log('       RDQA Q&A PAIRS REPORT');
//     console.log('======================================');

//     console.log(`📅 Date Range       : ${FROM_DATE} → ${TO_DATE}`);
//     console.log(`📦 Total Questions  : ${questions.length}`);
//     console.log(`📝 Questions with Answers: ${questionsWithAnswers}`);
//     console.log(`⚠️ Questions without Answers: ${questionsWithoutAnswers}`);
//     console.log(`✅ Final Answers    : ${finalAnswersCount}`);
//     console.log(`👤 Approved By      : ${approvedAnswersCount}`);
//     console.log(`👥 Users Resolved   : ${users.length}`);
//     console.log(`📄 Excel File       : ${outPath}`);

//     console.log('\n✅ Export completed successfully!');
//   }
// } catch (error) {
//   console.error('\n❌ Error exporting RDQA Q&A pairs:', error);
//   process.exitCode = 1;
// } finally {
//   await client.close();
//   console.log('\n🔒 MongoDB connection closed');
// }



/**
 * RDQA Q&A Pairs → Excel
 *
 * Fetches questions closed within a configured IST date range.
 *
 * Collections:
 *   - questions
 *   - answers
 *   - users
 *   - question_submissions
 *
 * Excel columns:
 *   Sl No
 *   Question
 *   Status
 *   Priority
 *   State
 *   District
 *   Crop
 *   Season
 *   Domain
 *   Normalized Crop
 *   Question Source
 *   Closed At
 *   Created At
 *   Answer
 *   Answer Sources
 *   Closed By (Approved By Email)
 *   Author ID
 *   Author Email
 *   Submission Author
 *   Level 1
 *   Level 2
 *   Level 3
 *
 * Submission history mapping:
 *   history[0] = Submission Author
 *   history[1] = Level 1
 *   history[2] = Level 2
 *   history[3] = Level 3
 *
 * All history updatedBy IDs are resolved through users.email.
 *
 * Answer selection:
 *   1. Prefer the latest isFinalAnswer: true
 *   2. If no final answer exists, select the latest answer.
 *
 * Dates are interpreted as IST calendar days.
 *
 * Read-only. Uses DB_URL / DB_NAME from .env.
 *
 * Usage:
 *   node scripts/rdqa-qna-pairs.js
 *   node scripts/rdqa-qna-pairs.js --out=rdqa-qna-pairs.xlsx
 */

import 'dotenv/config';

import { MongoClient, ObjectId } from 'mongodb';
import ExcelJS from 'exceljs';
import path from 'node:path';

// --------------------------------------------------
// Date Configuration (IST)
// --------------------------------------------------

const FROM_DATE = '2026-11-19';
const TO_DATE = '2026-11-19';

// --------------------------------------------------
// Arguments
// --------------------------------------------------

const args = process.argv.slice(2);

const argVal = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const OUT = argVal(
  'out',
  `rdqa-qna-pairs-${FROM_DATE}-to-${TO_DATE}.xlsx`,
);

// --------------------------------------------------
// Date Helpers
// --------------------------------------------------

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const from = new Date(`${FROM_DATE}T00:00:00.000+05:30`);

const toExclusive = new Date(
  new Date(`${TO_DATE}T00:00:00.000+05:30`).getTime() +
    24 * 60 * 60 * 1000,
);

if (
  Number.isNaN(from.getTime()) ||
  Number.isNaN(toExclusive.getTime()) ||
  from >= toExclusive
) {
  console.error('❌ Invalid date range. Use YYYY-MM-DD.');
  process.exit(1);
}

// Excel date cells don't carry timezone information.
// Shift timestamps to display IST.
const asIST = value => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return new Date(date.getTime() + IST_OFFSET_MS);
};

// --------------------------------------------------
// Database Configuration
// --------------------------------------------------

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';

if (!DB_URL) {
  console.error('❌ DB_URL is not set. Configure it in .env.');
  process.exit(1);
}

// --------------------------------------------------
// General Helpers
// --------------------------------------------------

const idStr = value => (value ? value.toString() : '');

const toObjectId = value => {
  const id = idStr(value);

  if (!id || !ObjectId.isValid(id)) return null;

  return new ObjectId(id);
};

// Convert values into Excel-friendly strings.
const displayValue = value => {
  if (value === null || value === undefined) return '';

  if (Array.isArray(value)) {
    return value.map(displayValue).join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

// Support both ObjectId and string references.
const referenceValues = ids => [
  ...ids,
  ...ids.map(id => idStr(id)),
];

// --------------------------------------------------
// Run
// --------------------------------------------------

const client = new MongoClient(DB_URL);

await client.connect();

console.log('✅ Connected to MongoDB');

try {
  const db = client.db(DB_NAME);

  const questionsCollection = db.collection('questions');
  const answersCollection = db.collection('answers');
  const usersCollection = db.collection('users');
  const submissionsCollection = db.collection('question_submissions');

  // --------------------------------------------------
  // Step 1: Fetch Questions
  // --------------------------------------------------

  const questionFilter = {
    closedAt: {
      $gte: from,
      $lt: toExclusive,
    },
  };

  console.log('\n📅 Date Range (IST)');
  console.log(`From: ${FROM_DATE}`);
  console.log(`To:   ${TO_DATE}`);

  const questions = await questionsCollection
    .find(questionFilter)
    .sort({ closedAt: 1 })
    .toArray();

  console.log(`\n📦 Questions found: ${questions.length}`);

  if (questions.length === 0) {
    console.log('Nothing to export. No questions found.');
  } else {
    const questionIds = questions.map(q => q._id);

    const questionReferences = referenceValues(questionIds);

    // --------------------------------------------------
    // Step 2: Fetch Related Answers
    // --------------------------------------------------

    const answers = await answersCollection
      .find({
        questionId: {
          $in: questionReferences,
        },
      })
      .sort({
        answerIteration: 1,
        createdAt: 1,
      })
      .toArray();

    console.log(`📝 Answers found: ${answers.length}`);

    // Group answers by questionId.
    const answersByQuestion = new Map();

    for (const answer of answers) {
      const key = idStr(answer.questionId);

      if (!answersByQuestion.has(key)) {
        answersByQuestion.set(key, []);
      }

      answersByQuestion.get(key).push(answer);
    }

    // --------------------------------------------------
    // Step 3: Fetch Question Submissions
    // --------------------------------------------------

    const submissions = await submissionsCollection
      .find({
        questionId: {
          $in: questionReferences,
        },
      })
      .sort({
        updatedAt: -1,
      })
      .toArray();

    console.log(`📋 Question submissions found: ${submissions.length}`);

    // Map submission by questionId.
    // If multiple submissions exist, retain the latest updatedAt.
    const submissionByQuestion = new Map();

    for (const submission of submissions) {
      const key = idStr(submission.questionId);

      if (!submissionByQuestion.has(key)) {
        submissionByQuestion.set(key, submission);
      }
    }

    // --------------------------------------------------
    // Step 4: Select Answer and Submission for Each Question
    // --------------------------------------------------

    const selectedRecords = questions.map(question => {
      const key = idStr(question._id);

      const questionAnswers = answersByQuestion.get(key) ?? [];

      // Prefer the latest final answer.
      const finalAnswer = questionAnswers
        .filter(answer => answer.isFinalAnswer)
        .at(-1);

      // Otherwise, use the latest available answer.
      const selectedAnswer =
        finalAnswer ?? questionAnswers.at(-1) ?? null;

      const submission = submissionByQuestion.get(key) ?? null;

      return {
        question,
        answer: selectedAnswer,
        submission,
      };
    });

    // --------------------------------------------------
    // Step 5: Collect All User IDs
    // --------------------------------------------------

    const userIds = new Set();

    const collectUserId = value => {
      const objectId = toObjectId(value);

      if (objectId) {
        userIds.add(objectId.toString());
      }
    };

    for (const { answer, submission } of selectedRecords) {
      if (answer) {
        // Answer author
        collectUserId(answer.authorId);

        // Answer approver
        collectUserId(answer.approvedBy);
      }

      // Submission history users
      const history = submission?.history ?? [];

      history.forEach(entry => {
        collectUserId(entry.updatedBy);
      });
    }

    // --------------------------------------------------
    // Step 6: Fetch All Users in Bulk
    // --------------------------------------------------

    const users = userIds.size
      ? await usersCollection
          .find({
            _id: {
              $in: [...userIds].map(id => new ObjectId(id)),
            },
          })
          .project({
            email: 1,
            firstName: 1,
            lastName: 1,
          })
          .toArray()
      : [];

    const userById = new Map(
      users.map(user => [idStr(user._id), user]),
    );

    // Resolve user email.
    const emailOf = userId => {
      if (!userId) return '';

      const user = userById.get(idStr(userId));

      return user?.email ?? '';
    };

    console.log(`👤 Users resolved: ${users.length}`);

    // --------------------------------------------------
    // Step 7: Build Excel Rows
    // --------------------------------------------------

    const rows = selectedRecords.map(
      ({ question, answer, submission }, index) => {
        const details = question.details ?? {};

        const authorId = answer?.authorId ?? null;
        const approvedBy = answer?.approvedBy ?? null;

        const history = submission?.history ?? [];

        // Extract submission history emails by index.
        const historyAuthor = emailOf(history[0]?.updatedBy);
        const level1 = emailOf(history[1]?.updatedBy);
        const level2 = emailOf(history[2]?.updatedBy);
        const level3 = emailOf(history[3]?.updatedBy);

        return {
          'Sl No': index + 1,

          Question: question.question ?? '',

          Status: question.status ?? '',

          Priority: displayValue(question.priority),

          State: details.state ?? '',

          District: details.district ?? '',

          Crop: displayValue(details.crop),

          Season: details.season ?? '',

          Domain: displayValue(details.domain),

          'Normalized Crop': details.normalised_crop ?? '',

          'Question Source': question.source ?? '',

          'Closed At (IST)': asIST(question.closedAt),

          'Created At (IST)': asIST(question.createdAt),

          Answer: answer?.answer ?? '',

          'Answer Sources': displayValue(answer?.sources),

          'Closed By': emailOf(approvedBy),

          'Author ID': idStr(authorId),

          'Author Email': emailOf(authorId),

          'Submission Author': historyAuthor,

          'Level 1': level1,

          'Level 2': level2,

          'Level 3': level3,
        };
      },
    );

    // --------------------------------------------------
    // Step 8: Create Excel Workbook
    // --------------------------------------------------

    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'RDQA Q&A Pairs Export';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('RDQA Q&A Pairs');

    const headers = Object.keys(rows[0]);

    worksheet.columns = headers.map(header => ({
      header,
      key: header,

      width:
        header === 'Question'
          ? 60
          : header === 'Answer'
            ? 80
            : header === 'Answer Sources'
              ? 60
              : header === 'Priority'
                ? 25
                : header.includes('At (IST)')
                  ? 22
                  : Math.min(Math.max(header.length + 4, 15), 35),
    }));

    // Add data rows.
    rows.forEach(row => {
      worksheet.addRow(row);
    });

    // --------------------------------------------------
    // Step 9: Excel Formatting
    // --------------------------------------------------

    const headerRow = worksheet.getRow(1);

    headerRow.font = {
      bold: true,
    };

    headerRow.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: 'FFE4F6EA',
        },
      };

      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
    });

    // Wrap long question and answer text.
    rows.forEach((_, index) => {
      const row = worksheet.getRow(index + 2);

      ['Question', 'Answer', 'Answer Sources'].forEach(column => {
        row.getCell(column).alignment = {
          vertical: 'top',
          wrapText: true,
        };
      });
    });

    // Format timestamps as IST.
    const dateColumns = [
      'Closed At (IST)',
      'Created At (IST)',
    ];

    dateColumns.forEach(column => {
      const columnNumber = headers.indexOf(column) + 1;

      for (let row = 2; row <= worksheet.rowCount; row++) {
        worksheet.getRow(row).getCell(columnNumber).numFmt =
          'yyyy-mm-dd hh:mm:ss';
      }
    });

    // Freeze header and enable filters.
    worksheet.views = [
      {
        state: 'frozen',
        ySplit: 1,
      },
    ];

    worksheet.autoFilter = {
      from: {
        row: 1,
        column: 1,
      },
      to: {
        row: 1,
        column: headers.length,
      },
    };

    // --------------------------------------------------
    // Step 10: Write Excel File
    // --------------------------------------------------

    const outPath = path.resolve(OUT);

    await workbook.xlsx.writeFile(outPath);

    // --------------------------------------------------
    // Step 11: Summary
    // --------------------------------------------------

    const questionsWithAnswers = selectedRecords.filter(
      item => item.answer !== null,
    ).length;

    const questionsWithoutAnswers =
      questions.length - questionsWithAnswers;

    const finalAnswersCount = selectedRecords.filter(
      item => item.answer?.isFinalAnswer === true,
    ).length;

    const approvedAnswersCount = selectedRecords.filter(
      item => item.answer?.approvedBy,
    ).length;

    const historyCounts = {
      author: 0,
      level1: 0,
      level2: 0,
      level3: 0,
    };

    rows.forEach(row => {
      if (row['Submission Author']) historyCounts.author++;
      if (row['Level 1']) historyCounts.level1++;
      if (row['Level 2']) historyCounts.level2++;
      if (row['Level 3']) historyCounts.level3++;
    });

    console.log('\n======================================');
    console.log('       RDQA Q&A PAIRS REPORT');
    console.log('======================================');

    console.log(`📅 Date Range       : ${FROM_DATE} → ${TO_DATE}`);
    console.log(`📦 Total Questions  : ${questions.length}`);
    console.log(`📝 Questions with Answers: ${questionsWithAnswers}`);
    console.log(`⚠️ Questions without Answers: ${questionsWithoutAnswers}`);
    console.log(`✅ Final Answers    : ${finalAnswersCount}`);
    console.log(`👤 Approved By      : ${approvedAnswersCount}`);

    console.log('\n📋 Submission History');
    console.log(`   Author           : ${historyCounts.author}`);
    console.log(`   Level 1          : ${historyCounts.level1}`);
    console.log(`   Level 2          : ${historyCounts.level2}`);
    console.log(`   Level 3          : ${historyCounts.level3}`);

    console.log(`\n👥 Users Resolved   : ${users.length}`);
    console.log(`📄 Excel File       : ${outPath}`);

    console.log('\n✅ Export completed successfully!');
  }
} catch (error) {
  console.error('\n❌ Error exporting RDQA Q&A pairs:', error);
  process.exitCode = 1;
} finally {
  await client.close();
  console.log('\n🔒 MongoDB connection closed');
}
