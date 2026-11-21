/**
 * Script to generate AI initial answers for questions that don't have one.
 *
 * Reads question IDs from scripts/question_ids.json
 * For each question:
 *   - Finds the document by _id
 *   - Checks if aiInitialAnswer is null, empty, or undefined
 *   - If yes, calls the MiniMax API to generate an AI answer
 *   - Updates the question document with the generated aiInitialAnswer
 *
 * SAFETY: dry-run by default. It only writes when you pass --apply.
 *
 * Usage:
 *   node scripts/generate-ai-initial-answers.mjs          # dry run (counts only)
 *   node scripts/generate-ai-initial-answers.mjs --apply  # generates and saves answers
 *
 * Reads DB_URL / DB_NAME from the environment (.env is auto-loaded).
 * Requires MINIMAX_API_KEY environment variable.
 */

import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
const MINIMAX_API = process.env.MINIMAX_API || 'localhost';
const MINIMAX_PORT = process.env.MINIMAX_PORT || '8001';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;

if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}

if (!MINIMAX_API_KEY) {
  console.error('❌ MINIMAX_API_KEY is not set (put it in .env or pass it inline).');
  process.exit(1);
}

const MINIMAX_SERVER_URL = `http://${MINIMAX_API}:${MINIMAX_PORT}`;
const APPLY = process.argv.includes('--apply');

// Load question IDs from JSON file
const questionIdsPath = join(__dirname, 'question_ids.json');
let questionIds;

try {
  const fileContent = readFileSync(questionIdsPath, 'utf-8');
  questionIds = JSON.parse(fileContent);
  
  if (!Array.isArray(questionIds)) {
    throw new Error('question_ids.json must contain an array of question IDs');
  }
  
  // Convert string IDs to ObjectId instances for MongoDB queries
  questionIds = questionIds.map(id => {
    try {
      return new ObjectId(id);
    } catch (e) {
      throw new Error(`Invalid ObjectId format: ${id}`);
    }
  });
  
  console.log(`📋 Loaded ${questionIds.length} question IDs from question_ids.json`);
} catch (err) {
  console.error(`❌ Failed to load question_ids.json: ${err.message}`);
  process.exit(1);
}

// Connect to MongoDB
const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

console.log(`\n========== Generate AI Initial Answers ==========`);
console.log(`DB: ${DB_NAME}`);
console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes — pass --apply)'}`);
console.log(`MiniMax API: ${MINIMAX_SERVER_URL}`);
console.log('================================================');

/**
 * Generate AI answer using MiniMax API (same logic as AiService.getAnswerByQuestionDetails)
 */
async function generateAiAnswer(questionDoc) {
  const systemPrompt = `
    You are an expert agricultural advisor helping farmers.

    Your goal:
    - Provide accurate, practical, and easy-to-understand answers
    - Write in simple language suitable for farmers
    - Focus on real-world solutions

    Rules:
    - Avoid bullet points unless necessary
    - Write in clear, natural paragraphs
    - Do not use headings like "Cause", "Symptoms", etc.
    - Be concise but informative
  `;

  const userPrompt = `
    Farmer Question:
    "${questionDoc.question}"

    Context:
    - State: ${questionDoc.details?.state || "Unknown"}
    - District: ${questionDoc.details?.district || "Unknown"}
    - Crop: ${questionDoc.details?.crop || "Unknown"}
    - Season: ${questionDoc.details?.season || "Unknown"}
    - Domain: ${questionDoc.details?.domain || "General"}

    Instructions:
    Provide a clear and meaningful answer in paragraph form.

    The answer should:
    - Explain the likely issue
    - Describe what the farmer might observe
    - Suggest practical prevention and treatment steps
    - Be easy to understand and actionable

    Do not use structured sections or bullet formatting.
    Write as a natural explanation.
  `;

  const fullUrl = `${MINIMAX_SERVER_URL}/v1/chat/completions`;
  console.log(`   Calling: ${fullUrl}`);

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: "MiniMaxAI/MiniMax-M2.7",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 700,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();

  if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error("Invalid LLM response: missing choices");
  }

  const firstChoice = data.choices[0];

  if (!firstChoice?.message?.content) {
    throw new Error("Invalid LLM response: missing content");
  }

  let answer = firstChoice.message.content;

  // Clean up the answer
  answer = answer
    .replace(/```[\s\S]*?```/g, "")
    .replace(/```/g, "")
    .replace(/\*\*/g, "")
    .replace(/^\s+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!answer || answer.length < 10) {
    throw new Error("LLM returned insufficient content");
  }

  return answer;
}

/**
 * Check if aiInitialAnswer is empty/null/undefined
 */
function needsAiInitialAnswer(question) {
  return !question.aiInitialAnswer || question.aiInitialAnswer.trim() === '';
}

// Process questions
const questionsCollection = db.collection('questions');
const results = {
  processed: 0,
  needsAnswer: 0,
  alreadyHasAnswer: 0,
  errors: 0,
  generated: 0,
};

console.log(`\n🔄 Processing ${questionIds.length} questions...\n`);

for (const questionId of questionIds) {
  results.processed++;
  
  try {
    // Find the question document
    const question = await questionsCollection.findOne({ _id: questionId });
    
    if (!question) {
      console.log(`⚠️  [${results.processed}/${questionIds.length}] Question not found: ${questionId}`);
      continue;
    }
    
    console.log(`📝 [${results.processed}/${questionIds.length}] Question: ${question._id}`);
    console.log(`   Question text: ${question.question.substring(0, 80)}${question.question.length > 80 ? '...' : ''}`);
    console.log(`   Current aiInitialAnswer: ${question.aiInitialAnswer ? '"' + question.aiInitialAnswer.substring(0, 50) + '..."' : '(empty/null)'}`);
    
    if (!needsAiInitialAnswer(question)) {
      console.log(`   ✅ Already has aiInitialAnswer - skipping\n`);
      results.alreadyHasAnswer++;
      continue;
    }
    
    results.needsAnswer++;
    console.log(`   🔄 Generating AI answer...`);
    
    if (!APPLY) {
      console.log(`   📋 [DRY RUN] Would generate and save AI answer\n`);
      continue;
    }
    
    // Generate the AI answer
    const aiAnswer = await generateAiAnswer(question);
    console.log(`   ✅ Generated answer (${aiAnswer.length} chars)`);
    console.log(`   Answer preview: ${aiAnswer.substring(0, 100)}...`);
    
    // Update the question
    const updateResult = await questionsCollection.updateOne(
      { _id: questionId },
      {
        $set: {
          aiInitialAnswer: aiAnswer,
          updatedAt: new Date()
        }
      }
    );
    
    if (updateResult.modifiedCount > 0) {
      console.log(`   💾 Saved to database`);
      results.generated++;
    } else {
      console.log(`   ⚠️  No document was modified`);
    }
    
    console.log('');
    
    // Add a small delay between API calls to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
    
  } catch (error) {
    console.error(`   ❌ Error processing ${questionId}: ${error.message}\n`);
    results.errors++;
  }
}

// Summary
console.log('================================================');
console.log('📊 Summary');
console.log('================================================');
console.log(`Total processed  : ${results.processed}`);
console.log(`Already had answer: ${results.alreadyHasAnswer}`);
console.log(`Needed generation : ${results.needsAnswer}`);
console.log(`Successfully generated: ${results.generated}`);
console.log(`Errors: ${results.errors}`);
console.log('================================================');

if (!APPLY && results.needsAnswer > 0) {
  console.log(`\n💡 Run with --apply to generate AI answers for ${results.needsAnswer} question(s).`);
}

await client.close();
console.log('\n✅ Script completed.');