import 'dotenv/config';
import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================
// CONFIGURATION
// ============================================================

const MONGO_URI = process.env.DB_URL || '';
const DB_NAME = process.env.DB_NAME || 'agriai';

const QUESTIONS_COLLECTION = 'questions';

const BATCH_SIZE = 500;


// ============================================================
// STANDARDIZED DOMAINS
// ============================================================

const STANDARDIZED_DOMAINS = [
  'Soil Health and Nutrient Management',
  'Irrigation and Water Management',
  'Insect - Pest Management',
  'Disease Management',
  'Seed and Variety Selection',
  'Cultural and Crop Management Practices',
  'Organic and Natural Farming',
  'Weed Management',
  'Climate, Weather & Stress Management',
  'Farm Tools & Mechanisation',
  'Post-Harvest Management & Storage',
  'Market Prices, MSP & Marketing',
  'Agricultural Schemes & Subsidies',
  'Credit, Loan & Insurance',
  'Capacity Building, Extension and Communication',
  'Rural Infrastructure',
  'Animal Husbandry & Livestock',
  'Fisheries & Aquaculture',
  'Allied Agricultural Activities',
  'Non-Agricultural / Invalid'
];


// ============================================================
// OUTPUT FILE
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE_PATH = path.join(
  __dirname,
  '..',
  'nonstandard-domain-questions.xlsx'
);


// ============================================================
// VALIDATION
// ============================================================

if (!MONGO_URI) {
  throw new Error(
    '❌ DB_URL is not defined in the environment.'
  );
}

const standardizedDomainSet =
  new Set(STANDARDIZED_DOMAINS);


// ============================================================
// EXPORT QUESTIONS
// ============================================================

async function exportNonstandardDomainQuestions() {
  const client = new MongoClient(MONGO_URI);

  try {
    // --------------------------------------------------------
    // Connect to MongoDB
    // --------------------------------------------------------

    console.log(
      '🚀 Connecting to MongoDB...'
    );

    await client.connect();

    console.log(
      '✅ Connected to MongoDB successfully.\n'
    );

    const db = client.db(DB_NAME);

    const questionsCollection =
      db.collection(
        QUESTIONS_COLLECTION
      );


    // --------------------------------------------------------
    // Count questions
    // --------------------------------------------------------

    const totalQuestions =
      await questionsCollection.countDocuments({
        'details.domain': {
          $type: 'array',
        },
      });

    console.log(
      `🔍 Total questions to check: ${totalQuestions}`
    );

    console.log(
      `📦 Batch size: ${BATCH_SIZE}\n`
    );


    // --------------------------------------------------------
    // Results
    // --------------------------------------------------------

    const excelRows = [];

    let processedQuestions = 0;
    let matchedQuestions = 0;

    let lastId = null;


    // ========================================================
    // PROCESS QUESTIONS IN BATCHES
    // ========================================================

    while (true) {
      // ------------------------------------------------------
      // Build query
      // ------------------------------------------------------

      const query = {
        'details.domain': {
          $type: 'array',
        },
      };


      // ------------------------------------------------------
      // Cursor pagination
      // ------------------------------------------------------

      if (lastId) {
        query._id = {
          $gt: lastId,
        };
      }


      // ------------------------------------------------------
      // Fetch batch
      // ------------------------------------------------------

      const questions =
        await questionsCollection
          .find(
            query,
            {
              projection: {
                _id: 1,
                question: 1,
                details: 1,
              },
            }
          )
          .sort({
            _id: 1,
          })
          .limit(BATCH_SIZE)
          .toArray();


      // ------------------------------------------------------
      // No more questions
      // ------------------------------------------------------

      if (questions.length === 0) {
        break;
      }


      // ======================================================
      // CHECK EACH QUESTION
      // ======================================================

      for (const question of questions) {
        const domains =
          question?.details?.domain;


        if (!Array.isArray(domains)) {
          continue;
        }


        // ----------------------------------------------------
        // Find domains that are NOT exactly in the
        // standardized domain list
        // ----------------------------------------------------

        const nonstandardDomains =
          domains.filter(domain => {
            return !standardizedDomainSet.has(
              domain
            );
          });


        // ----------------------------------------------------
        // All domains are standardized
        // ----------------------------------------------------

        if (
          nonstandardDomains.length === 0
        ) {
          continue;
        }


        matchedQuestions++;


        // ----------------------------------------------------
        // Question details
        // ----------------------------------------------------

        const details =
          question.details || {};


        // ----------------------------------------------------
        // Add row to Excel
        // ----------------------------------------------------

        excelRows.push({
          'Question ID':
            String(question._id),

          'Question':
            question.question || '',

          'Non-Standard Domains':
            nonstandardDomains.join(', '),

          'All Domains':
            domains.join(', '),

          'State':
            details.state || '',

          'District':
            details.district || '',

          'Crop':
            typeof details.crop === 'object'
              ? JSON.stringify(details.crop)
              : details.crop || '',

          'Season':
            details.season || '',

          'Details':
            JSON.stringify(
              details,
              null,
              2
            ),
        });
      }


      // ------------------------------------------------------
      // Update cursor
      // ------------------------------------------------------

      processedQuestions +=
        questions.length;

      lastId =
        questions[
          questions.length - 1
        ]._id;


      // ------------------------------------------------------
      // Progress
      // ------------------------------------------------------

      const percentage =
        totalQuestions === 0
          ? 100
          : (
              (processedQuestions /
                totalQuestions) *
              100
            ).toFixed(2);

      console.log(
        `📊 Progress: ${processedQuestions}/${totalQuestions} (${percentage}%) | Non-standard questions: ${matchedQuestions}`
      );
    }


    // ========================================================
    // NO RESULTS
    // ========================================================

    if (excelRows.length === 0) {
      console.log(
        '\n✅ All questions contain only the exact standardized domains.'
      );

      return;
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
        wch: 28,
      },
      {
        wch: 80,
      },
      {
        wch: 45,
      },
      {
        wch: 60,
      },
      {
        wch: 20,
      },
      {
        wch: 25,
      },
      {
        wch: 30,
      },
      {
        wch: 25,
      },
      {
        wch: 80,
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
      'Non-Standard Domains'
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
      '       NON-STANDARD DOMAIN REPORT'
    );

    console.log(
      '=================================================='
    );

    console.log(
      `Questions checked : ${processedQuestions}`
    );

    console.log(
      `Questions found   : ${matchedQuestions}`
    );

    console.log(
      `Excel rows        : ${excelRows.length}`
    );

    console.log(
      `Allowed domains   : ${STANDARDIZED_DOMAINS.length}`
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
      '\n🔴 Error generating non-standard domain report:',
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

exportNonstandardDomainQuestions();