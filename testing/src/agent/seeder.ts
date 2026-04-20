import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Try loading testing/.env first, then fallback to backend/.env
dotenv.config();

let dbUrl = process.env.DB_URL;
if (!dbUrl) {
  const backendEnvPath = path.resolve(__dirname, '../../../backend/.env');
  if (fs.existsSync(backendEnvPath)) {
    const backendEnv = dotenv.parse(fs.readFileSync(backendEnvPath));
    dbUrl = backendEnv.DB_URL;
  }
}

const DB_NAME = "agriai-staging";

export async function seedQuestion(expertEmail: string) {
  if (!dbUrl) {
    throw new Error("DB_URL is missing. Cannot seed question.");
  }
  
  const client = new MongoClient(dbUrl);

  try {
    console.log(`[Seeder] Connecting to database to insert test question...`);
    await client.connect();
    const db = client.db(DB_NAME);

    // 1. Find the expert 
    const user = await db.collection("users").findOne({ email: expertEmail });
    if (!user) {
      throw new Error(`[Seeder] Expert ${expertEmail} not found in DB`);
    }

    // 1.5 PURGE old test questions to prevent duplicate pile-up
    await db.collection("questions").deleteMany({ question: /TEST_E2E:/ });

    // 2. Insert a pending question with EXACT schema mapping to real questions
    const questionDoc = {
      userId: user._id,
      contextId: null,
      source: "AGRI_EXPERT",
      question: "TEST_E2E: My test tomatoes have spots on the leaves, what pesticide should I use?",
      priority: "high",
      status: "open",
      totalAnswersCount: 0,
      details: {
        state: "Maharashtra",
        district: "Pune",
        crop: "Tomato",
        season: "Kharif",
        domain: "Pest Management",
        normalised_crop: "tomato"
      },
      isAutoAllocate: true,
      embedding: [],
      metrics: null,
      text: "Question: TEST_E2E: My test tomatoes have spots on the leaves, what pesticide should I use?",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection("questions").insertOne(questionDoc);
    const newQuestionId = result.insertedId;

    // 3. Create the submission record so it appears in the expert's "Allocated Questions"
    const submissionDoc = {
      questionId: newQuestionId,
      queue: [user._id],
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await db.collection("question_submissions").insertOne(submissionDoc);

    console.log(`[Seeder] ✅ Successfully injected Question for Expert ${expertEmail}! (ID: ${newQuestionId})`);
    
  } catch (err) {
    console.error(`[Seeder] ❌ Failed to seed question:`, err);
    throw err;
  } finally {
    await client.close();
  }
}

export async function escalateQuestionToModerator() {
  if (!dbUrl) throw new Error("DB_URL is missing. Cannot escalate question.");
  const client = new MongoClient(dbUrl);

  try {
    console.log(`[Database Backdoor] Escalating 'TEST_AGENT' Answer to Moderator Queue...`);
    await client.connect();
    const db = client.db(DB_NAME);

    // 1. Find the test question
    const testQuestion = await db.collection("questions").findOne({ question: /TEST_E2E:/ });
    if (!testQuestion) throw new Error("Test question not found.");

    // 2. Continually poll for the answer submitted by the expert to this question
    let answerResult = null;
    let attempts = 0;
    while (!answerResult && attempts < 5) {
      answerResult = await db.collection("answers").findOneAndUpdate(
        { questionId: testQuestion._id },
        { $set: { status: "pending-with-moderator", approvalCount: 3 } },
        { returnDocument: 'after' }
      );
      if (!answerResult) {
        console.log(`[Database Backdoor] Answer not found yet, polling DB again in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
      }
    }

    // 3. Ensure we flip the actual question's status conceptually if required, though 'pending-with-moderator' on the answer is the key.
    if (answerResult) {
      await db.collection("questions").updateOne(
        { _id: testQuestion._id },
        { $set: { status: "in-review" } }
      );
      console.log(`[Database Backdoor] ✅ Bypassed peer review! Answer is now 'pending-with-moderator' and Question is 'in-review'!`);
    } else {
      console.error(`[Database Backdoor] ❌ Answer was completely missing from the database after 5 seconds of polling!`);
    }

  } catch (err) {
    console.error(`[Database Backdoor] ❌ Failed to escalate answer:`, err);
  } finally {
    await client.close();
  }
}
