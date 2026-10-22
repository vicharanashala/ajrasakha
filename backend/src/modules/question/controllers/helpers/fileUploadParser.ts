import * as XLSX from 'xlsx';
import { BadRequestError } from 'routing-controllers';
import { normalizeKeysToLower } from '#root/utils/normalizeKeysToLower.js';

/**
 * Parses uploaded JSON, CSV, or Excel (xls/xlsx) file into an array of question records.
 * Performs pre-validation to ensure the file contains valid question entries before background processing.
 */
export function parseQuestionUploadFile(file: Express.Multer.File): any[] {
  let rawPayload: any[] = [];
  const mimetype = (file.mimetype || '').toLowerCase();
  const filename = (file.originalname || '').toLowerCase();

  if (mimetype === 'application/json' || filename.endsWith('.json')) {
    try {
      const fileContent = file.buffer
        .toString('utf-8')
        .trim()
        .replace(/^\uFEFF/, '');
      rawPayload = JSON.parse(fileContent);
    } catch (parseErr: any) {
      throw new BadRequestError(`Invalid JSON file format: ${parseErr?.message || parseErr}`);
    }
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimetype === 'application/vnd.ms-excel' ||
    mimetype === 'text/csv' ||
    mimetype === 'application/csv' ||
    mimetype === 'text/plain' ||
    filename.endsWith('.xls') ||
    filename.endsWith('.xlsx') ||
    filename.endsWith('.csv')
  ) {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new BadRequestError('The spreadsheet contains no sheets.');
      }
      const worksheet = workbook.Sheets[sheetName];
      rawPayload = XLSX.utils.sheet_to_json(worksheet, { defval: '', blankrows: false });
    } catch (sheetErr: any) {
      if (sheetErr instanceof BadRequestError) throw sheetErr;
      throw new BadRequestError(`Failed to parse spreadsheet/CSV file: ${sheetErr?.message || sheetErr}`);
    }
  } else {
    throw new BadRequestError(
      'Unsupported file type. Please upload a CSV, Excel (.xlsx/.xls), or JSON file.',
    );
  }

  if (!Array.isArray(rawPayload)) {
    throw new BadRequestError('File content must be an array or list of question rows');
  }

  // Filter out completely empty objects/rows
  const filteredPayload = rawPayload.filter((row: any) => {
    if (!row || typeof row !== 'object') return false;
    return Object.values(row).some(
      (val) => val !== null && val !== undefined && String(val).trim() !== '',
    );
  });

  if (filteredPayload.length === 0) {
    throw new BadRequestError('The uploaded file is empty or contains no readable rows.');
  }

  // Pre-validate that at least one row has a non-empty "question" field
  const hasValidQuestion = filteredPayload.some((row: any) => {
    const normalized = normalizeKeysToLower(row);
    const qText = (normalized.question ?? '').toString().trim();
    return qText.length > 0;
  });

  if (!hasValidQuestion) {
    const sampleKeys = Object.keys(filteredPayload[0] || {}).join(', ');
    throw new BadRequestError(
      `No valid question text found in the file. Detected columns: [${sampleKeys}]. Please ensure there is a "Question" column header with non-empty text.`,
    );
  }

  return filteredPayload;
}

