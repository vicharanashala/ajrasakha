import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';
import fs from 'fs';
import 'dotenv/config';
// ============================================================
// CONFIGURATION
// ============================================================

const MONGO_URI = process.env.DB_URL || '';
const DB_NAME = process.env.DB_NAME ||   '';
console.log("process env ",process.env.DB_URL, process.env.DB_NAME);
console.log("🚀 Connecting to MongoDB at:", MONGO_URI);
const QUESTIONS_COLLECTION = 'questions';

// Excel file containing:
// - Standardized Domain
// - Mapped Fragmented Domains
const EXCEL_FILE_PATH = './scripts/Standardized Domain.xlsx';

// ============================================================
// HELPERS
// ============================================================

/**
 * Normalize a domain for comparison.
 *
 * Example:
 * "  Insect Management "
 * "insect management"
 *
 * Both become:
 * "insect management"
 */
function normalizeDomain(domain) {
  return String(domain || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}


// ============================================================
// READ DOMAIN MAPPINGS FROM EXCEL
// ============================================================

function loadDomainMappings() {
  console.log('📖 Reading domain mappings from Excel...');

  const workbook = XLSX.readFile(EXCEL_FILE_PATH);

  // Domain sheet
  const worksheet = workbook.Sheets['Domain'];

  if (!worksheet) {
    throw new Error('❌ "Domain" sheet not found in Excel file.');
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
  });

  const standardizedDomains = new Map();

  // normalized fragmented domain
  // =>
  // {
  //   original: "Insect Management",
  //   standardizedDomains: Set(["Insect - Pest Management"])
  // }
  const fragmentedDomains = new Map();

  for (const row of rows) {
    const standardizedDomain = String(
      row['Standardized Domain'] || ''
    ).trim();

    const mappedFragmentedDomains = String(
      row['Mapped Fragmented Domains'] || ''
    ).trim();

    // Skip completely empty rows
    if (!standardizedDomain) {
      continue;
    }

    const normalizedStandardized = normalizeDomain(
      standardizedDomain
    );

    standardizedDomains.set(
      normalizedStandardized,
      standardizedDomain
    );

    if (!mappedFragmentedDomains) {
      continue;
    }

    // Mapped Fragmented Domains are comma-separated
    const fragmentedList = mappedFragmentedDomains
      .split(',')
      .map(domain => domain.trim())
      .filter(Boolean);

    for (const fragmentedDomain of fragmentedList) {
      const normalizedFragmented = normalizeDomain(
        fragmentedDomain
      );

      if (!fragmentedDomains.has(normalizedFragmented)) {
        fragmentedDomains.set(normalizedFragmented, {
          original: fragmentedDomain,
          standardizedDomains: new Set(),
        });
      }

      fragmentedDomains
        .get(normalizedFragmented)
        .standardizedDomains
        .add(standardizedDomain);
    }
  }

  console.log(
    `✅ Loaded ${standardizedDomains.size} standardized domains.`
  );

  console.log(
    `✅ Loaded ${fragmentedDomains.size} fragmented domain mappings.\n`
  );

  return {
    standardizedDomains,
    fragmentedDomains,
  };
}


// ============================================================
// CHECK QUESTIONS
// ============================================================

async function checkQuestionDomains() {
  const client = new MongoClient(MONGO_URI);

  try {
    // --------------------------------------------------------
    // Connect
    // --------------------------------------------------------

    await client.connect();

    console.log('🚀 Connected to MongoDB successfully.\n');

    const db = client.db(DB_NAME);
    const questionsCollection = db.collection(
      QUESTIONS_COLLECTION
    );

    // --------------------------------------------------------
    // Load Excel mappings
    // --------------------------------------------------------

    const {
      standardizedDomains,
      fragmentedDomains,
    } = loadDomainMappings();

    // --------------------------------------------------------
    // Fetch questions
    // --------------------------------------------------------

    console.log('🔍 Fetching questions...');

    const questions = await questionsCollection
      .find(
        {
          'details.domain': {
            $exists: true,
            $type: 'array',
          },
        },
        {
          projection: {
            _id: 1,
            'details.domain': 1,
          },
        }
      )
      .toArray();

    console.log(
      `✅ Found ${questions.length} questions with domain arrays.\n`
    );

    // --------------------------------------------------------
    // Result containers
    // --------------------------------------------------------

    const mappedDomains = [];

    const unmappedDomains = [];

    const alreadyStandardized = [];

    // Keep track of ambiguous mappings
    const ambiguousMappings = [];

    // Prevent duplicate report entries
    const mappedPairSet = new Set();

    // Prevent duplicate unmapped domains
    const unmappedSet = new Set();


    // ========================================================
    // PROCESS QUESTIONS
    // ========================================================

    for (const question of questions) {
      const domains = question?.details?.domain;

      if (!Array.isArray(domains)) {
        continue;
      }

      for (const questionDomain of domains) {
        if (!questionDomain) {
          continue;
        }

        const originalDomain = String(questionDomain).trim();

        if (!originalDomain) {
          continue;
        }

        const normalizedDomain =
          normalizeDomain(originalDomain);


        // ----------------------------------------------------
        // 1. Already a standardized domain
        // ----------------------------------------------------

        if (
          standardizedDomains.has(normalizedDomain)
        ) {
          alreadyStandardized.push({
            questionId: question._id,
            domain: originalDomain,
            standardizedDomain:
              standardizedDomains.get(normalizedDomain),
          });

          continue;
        }


        // ----------------------------------------------------
        // 2. Check mapped fragmented domains
        // ----------------------------------------------------

        const fragmentedMapping =
          fragmentedDomains.get(normalizedDomain);

        if (fragmentedMapping) {
          const standardizedList = [
            ...fragmentedMapping.standardizedDomains,
          ];


          // --------------------------------------------------
          // Ambiguous mapping
          //
          // Same fragmented domain is mapped to more than
          // one standardized domain.
          // --------------------------------------------------

          if (standardizedList.length > 1) {
            ambiguousMappings.push({
              questionId: question._id,
              originalDomain,
              standardizedDomains:
                standardizedList,
            });

            continue;
          }


          // --------------------------------------------------
          // Normal mapping
          // --------------------------------------------------

          const standardizedDomain =
            standardizedList[0];

          const pairKey =
            `${normalizeDomain(originalDomain)}|||${normalizeDomain(
              standardizedDomain
            )}`;

          // Add each pair only once to the report
          if (!mappedPairSet.has(pairKey)) {
            mappedPairSet.add(pairKey);

            mappedDomains.push({
              originalDomain,
              standardizedDomain,
            });
          }

          continue;
        }


        // ----------------------------------------------------
        // 3. Not found anywhere
        // ----------------------------------------------------

        const unmappedKey =
          normalizeDomain(originalDomain);

        if (!unmappedSet.has(unmappedKey)) {
          unmappedSet.add(unmappedKey);

          unmappedDomains.push({
            domain: originalDomain,
          });
        }
      }
    }


    // ========================================================
    // REPORT
    // ========================================================

    console.log('\n');
    console.log('==================================================');
    console.log('              DOMAIN CHECK RESULT');
    console.log('==================================================');

    console.log(
      `\nQuestions checked          : ${questions.length}`
    );

    console.log(
      `Already standardized      : ${alreadyStandardized.length}`
    );

    console.log(
      `Mapped fragmented domains : ${mappedDomains.length}`
    );

    console.log(
      `Unmapped domains           : ${unmappedDomains.length}`
    );

    console.log(
      `Ambiguous mappings         : ${ambiguousMappings.length}`
    );


    // ========================================================
    // MAPPED DOMAINS
    // ========================================================

    console.log('\n');
    console.log('==================================================');
    console.log('          MAPPED FRAGMENTED DOMAINS');
    console.log('==================================================');

    for (const item of mappedDomains) {
      console.log(
        `${item.originalDomain} -> ${item.standardizedDomain}`
      );
    }


    // ========================================================
    // UNMAPPED DOMAINS
    // ========================================================

    console.log('\n');
    console.log('==================================================');
    console.log('              UNMAPPED DOMAINS');
    console.log('==================================================');

    for (const item of unmappedDomains) {
      console.log(item.domain);
    }


    // ========================================================
    // AMBIGUOUS DOMAINS
    // ========================================================

    if (ambiguousMappings.length > 0) {
      console.log('\n');
      console.log('==================================================');
      console.log('            AMBIGUOUS MAPPINGS');
      console.log('==================================================');

      for (const item of ambiguousMappings) {
        console.log(
          `${item.originalDomain} -> ${item.standardizedDomains.join(
            ' | '
          )}`
        );
      }
    }


    // ========================================================
    // SAVE REPORT
    // ========================================================

    const report = {
      summary: {
        questionsChecked: questions.length,
        alreadyStandardized: alreadyStandardized.length,
        mappedFragmentedDomains: mappedDomains.length,
        unmappedDomains: unmappedDomains.length,
        ambiguousMappings: ambiguousMappings.length,
      },

      mappedDomains,

      unmappedDomains,

      ambiguousMappings,

      // Useful if you want to inspect which questions
      // already contain standardized domains.
      alreadyStandardized,
    };

    fs.writeFileSync(
      './domain-diff-report.json',
      JSON.stringify(report, null, 2)
    );

    console.log(
      '\n📄 Report saved to: domain-diff-report.json'
    );

    console.log('\n✅ Domain comparison completed.');
  } catch (error) {
    console.error(
      '🔴 Error checking question domains:',
      error
    );
  } finally {
    await client.close();

    console.log('\n🔌 Disconnected from MongoDB.');
  }
}


// ============================================================
// RUN
// ============================================================

checkQuestionDomains();