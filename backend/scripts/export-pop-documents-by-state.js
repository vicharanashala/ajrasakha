
/**
 * Export POP documents for a specific state into an Excel sheet.
 *
 * Collections:
 * 1. pop_documents
 * 2. pop_unique_documents
 *
 * Matching:
 * pop_documents.state_id = ObjectId(STATE_ID)
 * pop_documents.unique_document_id = pop_unique_documents._id
 *
 * Excluded fields:
 * sha256, display_id, representative_row_id
 *
 * Usage:
 * node scripts/export-pop-documents-by-state.js
 *
 * Optional output:
 * node scripts/export-pop-documents-by-state.js --out=scripts/output/punjab-pop.xlsx
 */

import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import ExcelJS from 'exceljs';
import path from 'node:path';

/* ─── Configuration ─── */

const DB_URL = '';
const DB_NAME = '';

const STATE_ID = '';

const args = process.argv.slice(2);

const outputArg = args.find(arg => arg.startsWith('--out='));

const OUTPUT_FILE =
  outputArg?.slice('--out='.length) ||
  `pop-documents-state-${new Date().toISOString().slice(0, 10)}.xlsx`;

const EXCLUDED_FIELDS = new Set([
  'sha256',
  'display_id',
  'representative_row_id',
]);

/* ─── Helpers ─── */

const idToString = value => {
  if (value === null || value === undefined) return '';
  return value.toString();
};

const toExcelValue = value => {
  if (value === null || value === undefined) return '';

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value?._bsontype === 'ObjectId') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value, (_, nestedValue) => {
      if (nestedValue?._bsontype === 'ObjectId') {
        return nestedValue.toString();
      }

      if (nestedValue instanceof Date) {
        return nestedValue.toISOString();
      }

      return nestedValue;
    });
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, (_, nestedValue) => {
      if (nestedValue?._bsontype === 'ObjectId') {
        return nestedValue.toString();
      }

      if (nestedValue instanceof Date) {
        return nestedValue.toISOString();
      }

      return nestedValue;
    });
  }

  return value;
};

const addDocumentFields = (target, document, prefix) => {
  if (!document) return;

  for (const [field, value] of Object.entries(document)) {
    if (EXCLUDED_FIELDS.has(field)) continue;

    // Already included as the first three Excel columns.
    if (
      prefix === 'pop_document_' &&
      (field === 'state_raw' || field === 'crop_raw')
    ) {
      continue;
    }

    target[`${prefix}${field}`] = toExcelValue(value);
  }
};

/* ─── Validation ─── */

if (!DB_URL) {
  console.error('❌ DB_URL is missing.');
  process.exit(1);
}

if (
  !ObjectId.isValid(STATE_ID) ||
  STATE_ID === 'PASTE_STATE_OBJECT_ID_HERE'
) {
  console.error('❌ Please provide a valid STATE_ID.');
  process.exit(1);
}

/* ─── MongoDB Connection ─── */

const client = new MongoClient(DB_URL);

try {
  await client.connect();

  const db = client.db(DB_NAME);

  const popDocumentsCollection = db.collection('pop_documents');

  const popUniqueDocumentsCollection = db.collection(
    'pop_unique_documents'
  );

  const stateObjectId = new ObjectId(STATE_ID);

  console.log(`Connected to database: ${DB_NAME}`);
  console.log(`Fetching documents for state: ${STATE_ID}`);

  /* ─── Step 1: Fetch POP documents ─── */

  const popDocuments = await popDocumentsCollection
    .find({
      state_id: stateObjectId,
    })
    .sort({ _id: 1 })
    .toArray();

  console.log(`Found ${popDocuments.length} POP documents.`);

  /* ─── Step 2: Collect unique document IDs ─── */

  const uniqueDocumentIds = [
    ...new Map(
      popDocuments
        .filter(document => document.unique_document_id)
        .map(document => [
          idToString(document.unique_document_id),
          document.unique_document_id,
        ])
    ).values(),
  ];

  /* ─── Step 3: Fetch unique documents ─── */

  const uniqueDocuments = uniqueDocumentIds.length
    ? await popUniqueDocumentsCollection
        .find({
          _id: {
            $in: uniqueDocumentIds,
          },
        })
        .toArray()
    : [];

  console.log(
    `Found ${uniqueDocuments.length} matching unique documents.`
  );

  const uniqueDocumentById = new Map(
    uniqueDocuments.map(document => [
      idToString(document._id),
      document,
    ])
  );

  /* ─── Step 4: Prepare Excel rows ─── */

  const rows = popDocuments.map((popDocument, index) => {
    const uniqueDocument = popDocument.unique_document_id
      ? uniqueDocumentById.get(
          idToString(popDocument.unique_document_id)
        )
      : null;

    const row = {
      'Sl No': index + 1,
      state_raw: toExcelValue(popDocument.state_raw),
      crop_raw: toExcelValue(popDocument.crop_raw),
    };

    // Add remaining fields from pop_documents.
    addDocumentFields(
      row,
      popDocument,
      'pop_document_'
    );

    // Add remaining fields from pop_unique_documents.
    addDocumentFields(
      row,
      uniqueDocument,
      'unique_document_'
    );

    return row;
  });

  /* ─── Step 5: Create Excel workbook ─── */

  const preferredHeaders = [
    'Sl No',
    'state_raw',
    'crop_raw',
  ];

  const allHeaders = new Set(preferredHeaders);

  rows.forEach(row => {
    Object.keys(row).forEach(header => {
      allHeaders.add(header);
    });
  });

  const headers = [
    ...preferredHeaders,
    ...[...allHeaders]
      .filter(header => !preferredHeaders.includes(header))
      .sort(),
  ];

  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'POP State Export';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('POP Documents');

  worksheet.columns = headers.map(header => ({
    header,
    key: header,
    width:
      header === 'state_raw' || header === 'crop_raw'
        ? 22
        : header.toLowerCase().includes('name') ||
            header.toLowerCase().includes('link')
          ? 38
          : Math.min(Math.max(header.length + 3, 16), 30),
  }));

  /* ─── Header styling ─── */

  const headerRow = worksheet.getRow(1);

  headerRow.font = {
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };

  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };

  headerRow.alignment = {
    vertical: 'middle',
    wrapText: true,
  };

  /* ─── Insert rows ─── */

  rows.forEach(row => {
    worksheet.addRow(row);
  });

  // Freeze header.
  worksheet.views = [
    {
      state: 'frozen',
      ySplit: 1,
    },
  ];

  // Enable filters.
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  /* ─── Step 6: Export Excel ─── */

  const outputPath = path.resolve(OUTPUT_FILE);

  await workbook.xlsx.writeFile(outputPath);

  /* ─── Summary ─── */

  const missingUniqueDocumentCount = popDocuments.filter(
    document =>
      document.unique_document_id &&
      !uniqueDocumentById.has(
        idToString(document.unique_document_id)
      )
  ).length;

  console.log('\n========== POP State Export ==========');

  console.log(`Database                 : ${DB_NAME}`);
  console.log(`State ID                 : ${STATE_ID}`);
  console.log(`POP documents            : ${popDocuments.length}`);
  console.log(`Unique documents matched : ${uniqueDocuments.length}`);
  console.log(`Missing unique documents : ${missingUniqueDocumentCount}`);

  console.log(
    `Excluded fields          : ${[...EXCLUDED_FIELDS].join(', ')}`
  );

  console.log(`\n✅ Excel created: ${outputPath}`);

} catch (error) {
  console.error('❌ Export failed:', error);
  process.exitCode = 1;

} finally {
  await client.close();
}
