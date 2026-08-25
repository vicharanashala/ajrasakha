import * as XLSX from 'xlsx';
import { BadRequestError } from 'routing-controllers';

/**
 * Parses uploaded JSON or Excel (xls/xlsx) file into an array of question records.
 */
export function parseQuestionUploadFile(file: Express.Multer.File): any[] {
  let payload: any[] = [];
  const mimetype = file.mimetype;
  const filename = file.originalname.toLowerCase();

  if (mimetype === 'application/json' || filename.endsWith('.json')) {
    const fileContent = file.buffer
      .toString('utf-8')
      .trim()
      .replace(/^\uFEFF/, '');
    payload = JSON.parse(fileContent);
  } else if (
    mimetype ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimetype === 'application/vnd.ms-excel' ||
    filename.endsWith('.xls') ||
    filename.endsWith('.xlsx')
  ) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    payload = XLSX.utils.sheet_to_json(worksheet);
  } else {
    throw new BadRequestError(
      'Unsupported file type. Please upload a JSON or Excel file.',
    );
  }

  if (!Array.isArray(payload)) {
    throw new BadRequestError('File content must be an array of questions');
  }

  return payload;
}
