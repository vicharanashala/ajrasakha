import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

// ============================================================
// CONFIGURATION
// ============================================================

const BATCH_SIZE = 500;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input Excel file path
const INPUT_FILE_PATH = path.join(__dirname, '..', 'Untitled spreadsheet (1).xlsx');

// Directory where batch JSON files will be exported
const OUTPUT_DIR = path.join(__dirname, '..', 'batches');

// ============================================================
// EXTRACT & BATCH PROCESS
// ============================================================

async function generateScalarBatches() {
  try {
    // --------------------------------------------------------
    // Read Excel File
    // --------------------------------------------------------
    console.log('📖 Reading Excel file...');
    console.log(`📍 Path: ${INPUT_FILE_PATH}\n`);

    if (!fs.existsSync(INPUT_FILE_PATH)) {
      throw new Error(`File not found at: ${INPUT_FILE_PATH}`);
    }

    const workbook = XLSX.readFile(INPUT_FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    console.log(`✅ Loaded sheet "${sheetName}" with ${rawRows.length} total rows.\n`);

    // --------------------------------------------------------
    // Map & Clean Rows
    // --------------------------------------------------------
    const formattedRecords = rawRows
      .filter(row => row['Question ID'] && row['Standardized Domain'])
      .map(row => ({
        'Question ID': String(row['Question ID']).trim(),
        'Standardized Domain': String(row['Standardized Domain']).trim()
      }));

    const totalRecords = formattedRecords.length;
    const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);

    console.log(`🔍 Valid records to process: ${totalRecords}`);
    console.log(`📦 Batch size: ${BATCH_SIZE}`);
    console.log(`📁 Total batches to generate: ${totalBatches}\n`);

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // --------------------------------------------------------
    // Slice & Write Batches
    // --------------------------------------------------------
    for (let i = 0; i < totalBatches; i++) {
      const startIndex = i * BATCH_SIZE;
      const endIndex = Math.min(startIndex + BATCH_SIZE, totalRecords);
      const batchData = formattedRecords.slice(startIndex, endIndex);

      const batchNumber = i + 1;
      const batchFileName = `batch_${batchNumber}.json`;
      const batchFilePath = path.join(OUTPUT_DIR, batchFileName);

      fs.writeFileSync(batchFilePath, JSON.stringify(batchData, null, 2), 'utf-8');

      console.log(
        `✅ Generated Batch ${batchNumber}/${totalBatches}: ${batchData.length} records -> ${batchFileName}`
      );
    }

    // --------------------------------------------------------
    // Summary
    // --------------------------------------------------------
    console.log('\n==================================================');
    console.log('           BATCH GENERATION REPORT');
    console.log('==================================================');
    console.log(`Total rows extracted : ${totalRecords}`);
    console.log(`Total batches created : ${totalBatches}`);
    console.log(`Output folder        : ${OUTPUT_DIR}`);
    console.log('==================================================\n');
  } catch (error) {
    console.error('\n🔴 Error generating batch files:', error.message);
  }
}

// ============================================================
// RUN
// ============================================================

generateScalarBatches();