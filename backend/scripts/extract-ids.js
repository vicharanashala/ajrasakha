import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolves directory where this script file lives (scripts/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// If "Anara Analysis.xlsx" is inside the "scripts/" folder:
const INPUT_EXCEL_PATH = path.resolve(__dirname, 'Anara Analysis.xlsx');
const OUTPUT_JSON_PATH = path.resolve(__dirname, 'question_ids.json');

// NOTE: If the excel is actually in the project root (backend/), use:
// const INPUT_EXCEL_PATH = path.resolve(__dirname, '../Anara Analysis.xlsx');

export async function extractQuestionIds() {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(INPUT_EXCEL_PATH);

    const worksheet = workbook.getWorksheet('Sheet2') || workbook.worksheets[0];

    let qidColIdx = -1;
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      const headerText = cell.value ? cell.value.toString().trim() : '';
      if (headerText === 'QID') {
        qidColIdx = colNumber;
      }
    });

    if (qidColIdx === -1) {
      throw new Error("Could not find a column named 'QID' in row 1.");
    }

    const questionIds = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const rawVal = row.getCell(qidColIdx).value;
      if (rawVal !== null && rawVal !== undefined) {
        const id = rawVal.toString().trim();
        if (id) {
          questionIds.push(id);
        }
      }
    });

    console.log(`Successfully extracted ${questionIds.length} question IDs:`);
    console.log(questionIds);

    await fs.writeFile(OUTPUT_JSON_PATH, JSON.stringify(questionIds, null, 2));
    console.log(`Saved question IDs array to ${OUTPUT_JSON_PATH}`);

    return questionIds;
  } catch (error) {
    console.error('Error extracting question IDs:', error);
  }
}

await extractQuestionIds();