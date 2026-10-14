#!/usr/bin/env node
// Seed the isolated LOCAL E2E environment with the three approved test users
// plus the deterministic question data the expert project needs.
//
// Creates/updates each user in the Firebase Auth Emulator (emailVerified=true,
// password synced to e2e/.env) and upserts the matching document in the local
// MongoDB `users` collection plus a `user_role_history` entry (mirroring
// UserRepository.create()). It also seeds two questions into the local
// MongoDB — one open question allocated to the E2E expert (first-response
// state, with an AI initial answer) and one closed question with a final
// answer — which the data-dependent expert tests (EXP-03..09) require.
// This must NEVER point at staging or production.
//
// Usage (emulator + mongo must already be running):
//   node scripts/seed-local.mjs   (from e2e/)
import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";

// Always load e2e/.env regardless of cwd (npm run seed:local runs from repo root).
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
import { getAuth } from "firebase-admin/auth";
import { MongoClient, ObjectId } from "mongodb";
import { generateKeyPairSync } from "node:crypto";

// Local-only throwaway key: the Auth Emulator never validates it cryptographically,
// but firebase-admin requires a parseable PEM. Never used outside the emulator.
const throwawayKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" });

const EMULATOR_HOST = process.env.E2E_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.FIREBASE_AUTH_EMULATOR_HOST = EMULATOR_HOST;
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "local-emulator";

const DB_URL = process.env.E2E_DB_URL || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.E2E_DB_NAME || "agriai";

const PROJECT_ID = process.env.E2E_FIREBASE_PROJECT_ID || "local-emulator";

const ROLES = [
  { key: "E2E_ADMIN", role: "admin", firstName: "Local", lastName: "Admin" },
  {
    key: "E2E_MODERATOR",
    role: "moderator",
    firstName: "Local",
    lastName: "Moderator",
  },
  { key: "E2E_EXPERT", role: "expert", firstName: "Local", lastName: "Expert" },
];

function cred(key) {
  const email = process.env[`${key}_EMAIL`];
  const password = process.env[`${key}_PASSWORD`];
  if (!email || !password) {
    throw new Error(
      `Missing ${key}_EMAIL / ${key}_PASSWORD in e2e/.env — refusing to seed.`,
    );
  }
  return { email, password };
}

/** Return the existing user record, or null when absent; fail loudly if the
 *  emulator is unreachable (any error other than user-not-found). */
async function findEmulatorUser(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code === "auth/user-not-found") return null;
    throw new Error(
      `Auth Emulator unreachable at http://${EMULATOR_HOST} (${err.message}). ` +
        `Start it first: pnpm exec firebase emulators:start --only auth (from backend/).`,
    );
  }
}

async function main() {
  initializeApp({
    credential: cert({
      projectId: PROJECT_ID,
      clientEmail: `local@${PROJECT_ID}.iam.gserviceaccount.com`,
      privateKey: throwawayKey,
    }),
  });
  const auth = getAuth();

  // 1) Auth Emulator users
  const seeded = [];
  for (const role of ROLES) {
    const { email, password } = cred(role.key);
    let uid;
    try {
      const existing = await findEmulatorUser(auth, email);
      if (existing) {
        uid = existing.uid;
        await auth.updateUser(uid, { password, emailVerified: true, disabled: false });
      } else {
        const rec = await auth.createUser({
          email,
          password,
          emailVerified: true,
          disabled: false,
          displayName: `${role.firstName} ${role.lastName}`,
        });
        uid = rec.uid;
      }
    } catch (err) {
      throw new Error(`Failed to seed ${email}: ${err.message}`);
    }
    seeded.push({ ...role, uid, email });
  }

  // 2) Local MongoDB users + role history
  const client = new MongoClient(DB_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  const users = db.collection("users");
  const history = db.collection("user_role_history");
  const now = new Date();

  for (const entry of seeded) {
    const doc = {
      firebaseUID: entry.uid,
      email: entry.email,
      firstName: entry.firstName,
      lastName: entry.lastName,
      role: entry.role,
      status: "active",
      isBlocked: false,
      isVerified: true,
      reputation_score: 0,
      incentive: 0,
      penalty: 0,
      notificationRetention: "never",
      special_task_force: false,
      isTrainingUser: false,
      agent: "not_available",
      preference: { crop: "all", domain: "all", state: "all", district: "" },
      createdAt: now,
      updatedAt: now,
    };
    // Upsert by email (not firebaseUID) so re-seeding after an Auth Emulator
    // reset (which regenerates UIDs) updates the same document instead of
    // leaving stale email duplicates behind, then drop any legacy duplicates.
    await users.updateOne({ email: entry.email }, { $set: doc }, { upsert: true });
    const userDoc = await users.findOne({ email: entry.email });
    await users.deleteMany({ email: entry.email, _id: { $ne: userDoc._id } });
    await history.deleteMany({ userId: userDoc._id });
    await history.insertOne({
      userId: userDoc._id,
      role: entry.role,
      from: now,
      to: null,
      isVerified: true,
      status: "active",
      isBlocked: false,
      special_task_force: false,
      isTrainingUser: false,
    });
  }

  await seedQuestions(db, users, cred);

  await client.close();

  console.log("[seed-local] Seeded local E2E users into Auth Emulator + MongoDB:");
  for (const entry of seeded) {
    console.log(
      `  - ${entry.email} (${entry.role}) uid=${entry.uid} passwordLength=${cred(entry.key).password.length}`,
    );
  }
}

// Deterministic question data for the data-dependent expert tests.
//   - EXP-03/04/05/08 need a first-response question (open, empty submission
//     history) allocated to the E2E expert so it auto-selects in My Queue.
//   - EXP-07 additionally needs `aiInitialAnswer` on that question.
//   - EXP-09 needs a closed question with a final answer. The `/questions/:id/full`
//     payload spreads the question doc, so `finalAnswer`/`isFinalAnswer` are
//     stored directly on the doc to satisfy the test's precondition check; the
//     matching `answers` row keeps the backend's final-answer lookup working.
// Deterministic _ids make the seed idempotent (re-running upserts in place).
//
// Moderator-project data (MOD/DATA):
//   - crop_master / states / districts reference collections. The backend blocks
//     answer approval until the question's crop/state/district resolve against
//     them (QuestionService.ensureNormalisedCrop / ensureNormalisedLocation), so
//     every approveable seed uses Paddy/Punjab/Ludhiana, which are seeded here.
//   - MOD-07 needs a `duplicate` AJRASAKHA question assigned to the E2E moderator
//     (`moderatorId`) with no aiInitialAnswer, not allocated to any expert, and a
//     `messages` doc matching its `messageId` so the detail view's chatbot fetch
//     (GET /questions/:id/chatbot) resolves.
//   - DATA-01/MOD-08 need a `closed` AJRASAKHA question with a finalised answer.
async function seedQuestions(db, users, cred) {
  const questions = db.collection("questions");
  const submissions = db.collection("question_submissions");
  const answers = db.collection("answers");
  const crops = db.collection("crop_master");
  const states = db.collection("states");
  const districts = db.collection("districts");
  const messages = db.collection("messages");

  const adminDoc = await users.findOne({ email: cred("E2E_ADMIN").email });
  const modDoc = await users.findOne({ email: cred("E2E_MODERATOR").email });
  const expertDoc = await users.findOne({ email: cred("E2E_EXPERT").email });
  if (!adminDoc || !modDoc || !expertDoc) {
    throw new Error(
      "Seeded users not found in local MongoDB — run user seeding first (same script).",
    );
  }
  const adminId = new ObjectId(String(adminDoc._id));
  const modId = new ObjectId(String(modDoc._id));
  const expertId = new ObjectId(String(expertDoc._id));

  const now = new Date();
  const hex = (n) => n.toString(16).padStart(24, "0");
  const firstResponseId = new ObjectId(hex(1));
  const firstResponseSubId = new ObjectId(hex(2));
  const closedQuestionId = new ObjectId(hex(3));
  const closedAnswerId = new ObjectId(hex(4));
  const duplicateId = new ObjectId(hex(6));
  const duplicateSubId = new ObjectId(hex(7));
  const closedAjraId = new ObjectId(hex(8));
  const closedAjraAnswerId = new ObjectId(hex(9));
  const closedAjraSubId = new ObjectId(hex(10));
  const inReviewId = new ObjectId(hex(15));
  const inReviewAnswerId = new ObjectId(hex(16));
  const inReviewSubId = new ObjectId(hex(17));

  const baseDetails = {
    state: "Punjab",
    district: "Ludhiana",
    crop: "Paddy",
    season: "KHARIF",
    domain: ["Agronomy"],
  };
  const approveableDetails = {
    ...baseDetails,
    normalised_crop: "Paddy",
  };

  // ── Reference collections the approval flow validates against ──────────────
  const cropPaddy = {
    _id: new ObjectId(hex(11)),
    name: "Paddy",
    type: "crop",
    aliases: [
      { english_representation: "paddy", native_representation: "धान" },
    ],
    createdAt: now,
    updatedAt: now,
  };
  const cropWheat = {
    _id: new ObjectId(hex(12)),
    name: "Wheat",
    type: "crop",
    aliases: [
      { english_representation: "wheat", native_representation: "गेहूँ" },
    ],
    createdAt: now,
    updatedAt: now,
  };
  const statePunjab = {
    _id: new ObjectId(hex(13)),
    stateNameEnglish: "Punjab",
    stateCode: 3,
    aliases: ["pb", "punjab"],
    createdAt: now,
    updatedAt: now,
  };
  const districtLudhiana = {
    _id: new ObjectId(hex(14)),
    districtNameEnglish: "Ludhiana",
    districtCode: 36,
    stateCode: 3,
    aliases: ["ludhiana"],
    createdAt: now,
    updatedAt: now,
  };
  await crops.updateOne({ name: "Paddy" }, { $set: cropPaddy }, { upsert: true });
  await crops.updateOne({ name: "Wheat" }, { $set: cropWheat }, { upsert: true });
  await states.updateOne(
    { stateNameEnglish: "Punjab" },
    { $set: statePunjab },
    { upsert: true },
  );
  await districts.updateOne(
    { districtNameEnglish: "Ludhiana" },
    { $set: districtLudhiana },
    { upsert: true },
  );

  const firstResponseQuestion = {
    _id: firstResponseId,
    userId: adminId,
    question: "What is the recommended spacing for transplanting paddy?",
    text: "What is the recommended spacing for transplanting paddy?",
    status: "open",
    totalAnswersCount: 0,
    priority: "medium",
    details: baseDetails,
    isAutoAllocate: false,
    autoAllocateModerator: false,
    autoAllocateGateKeeper: false,
    autoAllocateAuditor: false,
    source: "AGRI_EXPERT",
    embedding: [],
    aiInitialAnswer:
      "Transplant paddy seedlings at a spacing of 20 cm x 15 cm after puddling to ensure uniform growth.",
    metrics: null,
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };

  const firstResponseSubmission = {
    _id: firstResponseSubId,
    questionId: firstResponseId,
    lastRespondedBy: null,
    queue: [expertId],
    history: [],
    currentExpertAllocatedAt: now,
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };

  const closedQuestion = {
    _id: closedQuestionId,
    userId: adminId,
    question: "What is the recommended dose of DAP for wheat?",
    text: "What is the recommended dose of DAP for wheat?",
    status: "closed",
    closedAt: now,
    totalAnswersCount: 1,
    priority: "medium",
    details: { ...baseDetails, crop: "Wheat", season: "RABI" },
    isAutoAllocate: false,
    autoAllocateModerator: false,
    autoAllocateGateKeeper: false,
    autoAllocateAuditor: false,
    source: "AGRI_EXPERT",
    embedding: [],
    finalAnswer: "Apply DAP at 50 kg per acre at the time of sowing wheat.",
    isFinalAnswer: true,
    metrics: null,
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };

  const closedAnswer = {
    _id: closedAnswerId,
    questionId: closedQuestionId,
    authorId: expertId,
    answerIteration: 1,
    approvalCount: 1,
    isFinalAnswer: true,
    approvedBy: modId,
    answer: "Apply DAP at 50 kg per acre at the time of sowing wheat.",
    sources: [{ source: "https://kvk.example.com/dap-wheat", page: "4" }],
    status: "approved",
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };

  // The closed question also needs a submission doc: `getQuestionById` throws
  // without one, and an empty history renders the first-response editor card
  // where the final-answer confirmation banner lives. The expert keeps their
  // queue entry so the question stays reachable from "My Queue".
  const closedSubmission = {
    _id: new ObjectId(hex(5)),
    questionId: closedQuestionId,
    lastRespondedBy: null,
    queue: [expertId],
    history: [],
    currentExpertAllocatedAt: now,
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };

  // ── Moderator-project seeds ────────────────────────────────────────────────
  // Duplicate AJRASAKHA question for MOD-07 (GDB push). Assigned to the E2E
  // moderator so `isAssignedModerator` is true, no aiInitialAnswer (the
  // Pass/Accept/Push-to-GDB block requires its absence), and an empty
  // submission so the question is not "allocated to an expert".
  const duplicateAjraQuestion = {
    _id: duplicateId,
    userId: adminId,
    moderatorId: modId,
    question: "What is the right spacing for transplanting paddy seedlings?",
    text: "What is the right spacing for transplanting paddy seedlings?",
    status: "duplicate",
    priority: "high",
    details: approveableDetails,
    isAutoAllocate: false,
    autoAllocateModerator: false,
    autoAllocateGateKeeper: false,
    autoAllocateAuditor: false,
    source: "AJRASAKHA",
    embedding: [],
    messageId: "e2e-duplicate-message-1",
    metrics: null,
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };
  const duplicateAjraSubmission = {
    _id: duplicateSubId,
    questionId: duplicateId,
    lastRespondedBy: null,
    queue: [],
    history: [],
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };

  // Closed AJRASAKHA question for DATA-01 / MOD-08 closed-state invariants.
  const closedAjraQuestion = {
    _id: closedAjraId,
    userId: adminId,
    moderatorId: modId,
    question: "What is the best time to sow mustard in Punjab?",
    text: "What is the best time to sow mustard in Punjab?",
    status: "closed",
    closedAt: now,
    priority: "high",
    details: approveableDetails,
    isAutoAllocate: false,
    autoAllocateModerator: false,
    autoAllocateGateKeeper: false,
    autoAllocateAuditor: false,
    source: "AJRASAKHA",
    embedding: [],
    messageId: "e2e-closed-message-1",
    finalAnswer:
      "Sow mustard between mid-October and mid-November after the paddy harvest.",
    isFinalAnswer: true,
    metrics: null,
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };
  const closedAjraAnswer = {
    _id: closedAjraAnswerId,
    questionId: closedAjraId,
    authorId: modId,
    answerIteration: 1,
    approvalCount: 1,
    isFinalAnswer: true,
    approvedBy: modId,
    answer:
      "Sow mustard between mid-October and mid-November after the paddy harvest.",
    sources: [{ source: "https://kvk.example.com/mustard-sowing", page: "2" }],
    status: "approved",
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };
  const closedAjraSubmission = {
    _id: closedAjraSubId,
    questionId: closedAjraId,
    lastRespondedBy: null,
    queue: [],
    history: [],
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };

  // In-review AGRI_EXPERT question for MOD-17 (moderator final approval closes
  // the question via PUT /answers, which requires status 'in-review' + a
  // submission doc). `queue` is empty so it never appears in the expert's
  // "My Queue", leaving the first-response seeds untouched. createdAt is fixed
  // in the past so the default `{ createdAt: -1, _id: -1 }` list sort keeps it
  // at the bottom and MOD-05's openFirstRow() still opens the first-response seed.
  const inReviewQuestion = {
    _id: inReviewId,
    userId: adminId,
    moderatorId: modId,
    question: "What is the right amount of nitrogen for paddy at tillering?",
    text: "Question: What is the right amount of nitrogen for paddy at tillering?",
    priority: "medium",
    source: "AGRI_EXPERT",
    status: "in-review",
    details: approveableDetails,
    isAutoAllocate: false,
    autoAllocateModerator: false,
    autoAllocateGateKeeper: false,
    autoAllocateAuditor: false,
    embedding: [],
    totalAnswersCount: 1,
    metrics: null,
    createdAt: new Date("2025-01-15T00:00:00.000Z"),
    updatedAt: new Date("2025-01-15T00:00:00.000Z"),
    _e2eSeed: true,
  };
  const inReviewAnswer = {
    _id: inReviewAnswerId,
    questionId: inReviewId,
    authorId: expertId,
    answerIteration: 1,
    approvalCount: 0,
    isFinalAnswer: false,
    answer:
      "Apply 20 kg of nitrogen per acre to paddy at the tillering stage for healthy growth.",
    sources: [{ source: "https://kvk.example.com/paddy-nitrogen", page: "7" }],
    status: "in-review",
    reviews: [],
    remarks: "E2E seeded in-review answer",
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };
  const inReviewSubmission = {
    _id: inReviewSubId,
    questionId: inReviewId,
    lastRespondedBy: null,
    queue: [],
    history: [
      {
        updatedBy: {
          _id: expertId,
          name: "Local Expert",
          email: cred("E2E_EXPERT").email,
          avatar: null,
        },
        // Stored as an ObjectId reference (matches how reviewAnswer persists it);
        // `/full` resolves it into the embedded answer object for the response.
        answer: inReviewAnswerId,
        status: "in-review",
        assignedAt: now,
        completedAt: now,
        isCompleted: true,
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    _e2eSeed: true,
  };

  // Chatbot "messages" docs for the AJRASAKHA seeds. The detail view fetches
  // GET /questions/:id/chatbot, which matches the question's `messageId`
  // against this collection (ChatbotRepository.findFromSecondDb).
  const duplicateMessage = {
    messageId: "e2e-duplicate-message-1",
    user: String(adminId),
    createdAt: now,
    updatedAt: now,
    content: [
      {
        type: "human",
        text: "What is the right spacing for transplanting paddy seedlings?",
      },
      {
        type: "ai",
        text: "Transplant paddy seedlings at a spacing of 20 cm x 15 cm after puddling to ensure uniform growth.",
      },
    ],
    _e2eSeed: true,
  };
  const closedMessage = {
    messageId: "e2e-closed-message-1",
    user: String(adminId),
    createdAt: now,
    updatedAt: now,
    content: [
      {
        type: "human",
        text: "What is the best time to sow mustard in Punjab?",
      },
      {
        type: "ai",
        text: "Sow mustard between mid-October and mid-November after the paddy harvest.",
      },
    ],
    _e2eSeed: true,
  };

  await questions.updateOne(
    { _id: firstResponseId },
    { $set: firstResponseQuestion },
    { upsert: true },
  );
  await submissions.updateOne(
    { _id: firstResponseSubId },
    { $set: firstResponseSubmission },
    { upsert: true },
  );
  await questions.updateOne(
    { _id: closedQuestionId },
    { $set: closedQuestion },
    { upsert: true },
  );
  await submissions.updateOne(
    { _id: closedSubmission._id },
    { $set: closedSubmission },
    { upsert: true },
  );
  await answers.updateOne(
    { _id: closedAnswerId },
    { $set: closedAnswer },
    { upsert: true },
  );
  await questions.updateOne(
    { _id: duplicateId },
    { $set: duplicateAjraQuestion },
    { upsert: true },
  );
  await submissions.updateOne(
    { _id: duplicateSubId },
    { $set: duplicateAjraSubmission },
    { upsert: true },
  );
  await questions.updateOne(
    { _id: closedAjraId },
    { $set: closedAjraQuestion },
    { upsert: true },
  );
  await answers.updateOne(
    { _id: closedAjraAnswerId },
    { $set: closedAjraAnswer },
    { upsert: true },
  );
  await submissions.updateOne(
    { _id: closedAjraSubId },
    { $set: closedAjraSubmission },
    { upsert: true },
  );
  await questions.updateOne(
    { _id: inReviewId },
    { $set: inReviewQuestion },
    { upsert: true },
  );
  await answers.updateOne(
    { _id: inReviewAnswerId },
    { $set: inReviewAnswer },
    { upsert: true },
  );
  await submissions.updateOne(
    { _id: inReviewSubId },
    { $set: inReviewSubmission },
    { upsert: true },
  );
  await messages.updateOne(
    { messageId: duplicateMessage.messageId },
    { $set: duplicateMessage },
    { upsert: true },
  );
  await messages.updateOne(
    { messageId: closedMessage.messageId },
    { $set: closedMessage },
    { upsert: true },
  );

  console.log("[seed-local] Seeded deterministic E2E question data:");
  console.log(
    `  - first-response question ${firstResponseId} (open, queue=[expert], history=[])`,
  );
  console.log(
    `  - closed question ${closedQuestionId} (closed, final answer set, submission history=[])`,
  );
  console.log(
    `  - duplicate AJRASAKHA question ${duplicateId} (duplicate, moderatorId=${modId}, messageId=e2e-duplicate-message-1)`,
  );
  console.log(
    `  - closed AJRASAKHA question ${closedAjraId} (closed, final answer set, moderatorId=${modId})`,
  );
  console.log(
    `  - in-review question ${inReviewId} (in-review, expert answer in submission history, queue=[])`,
  );
  console.log(
    `  - reference collections: crop_master(Paddy/Wheat), states(Punjab), districts(Ludhiana), messages(2)`,
  );
}

main().catch((err) => {
  console.error("[seed-local] FAILED:", err.message || err);
  process.exit(1);
});
