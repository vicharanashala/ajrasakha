// =============================================================================
// testing/seed/seed_questions.mjs
// -----------------------------------------------------------------------------
// Seeds `questions` AND matching `question_submissions` so the moderator-queue
// cron (runModeratorQueueCron) and feedback allocation cron
// (allocateFeedbackQuestions) actually have work to do under load.
//
// Schema sources:
//   • backend/src/modules/question/classes/transformers/Question.ts
//   • backend/src/shared/interfaces/models.ts (IQuestion, IQuestionSubmission)
//
// Usage:
//   node testing/seed/seed_questions.mjs                          # default 5000
//   QUESTIONS=20000 STATUS_MIX=open:0.4,in-review:0.4,closed:0.2 node ...
// =============================================================================

import { connect, close } from './lib/db.mjs';
import {
  STATES, CROPS, SEASONS, SOURCES, PRIORITIES,
  QUESTION_STATUSES, QUESTION_TEMPLATES, DUPLICATE_PAIRS, rng, pick,
} from './lib/fixtures.mjs';

const TOTAL = Number(process.env.QUESTIONS) || 5000;
const DUPLICATE_FRACTION = Number(process.env.DUPLICATE_FRACTION) || 0.1;

function parseStatusMix(env) {
  if (!env) return { open: 0.6, 'in-review': 0.3, closed: 0.05, delayed: 0.05 };
  const map = {};
  for (const part of env.split(',')) {
    const [s, p] = part.split(':');
    map[s.trim()] = parseFloat(p);
  }
  const sum = Object.values(map).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(map)) map[k] /= sum;
  return map;
}

function pickStatus(rand, mix) {
  const r = rand();
  let acc = 0;
  for (const [s, p] of Object.entries(mix)) { acc += p; if (r < acc) return s; }
  return Object.keys(mix)[0];
}

function fakeEmbedding(rand) {
  const v = new Array(1024);
  for (let i = 0; i < 1024; i++) v[i] = (rand() - 0.5) * 0.02;
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

function nearDuplicateEmbedding(base) {
  return base.map((x) => x + (Math.random() - 0.5) * 0.001);
}

function buildRandomQuestion(rand, idx, statusMix) {
  const template = pick(rand, QUESTION_TEMPLATES);
  const crop = pick(rand, CROPS);
  const state = pick(rand, STATES);
  const season = pick(rand, SEASONS);
  const status = pickStatus(rand, statusMix);
  const createdAt = new Date(Date.now() - Math.floor(rand() * 14 * 86400_000));

  const doc = {
    question: template.replace('{crop}', crop).replace('{state}', state).replace('{season}', season),
    status, priority: pick(rand, PRIORITIES), totalAnswersCount: 0,
    isAutoAllocate: status === 'open' || status === 'in-review' || status === 'pae_submitted',
    autoAllocateModerator: status === 'open' || status === 'in-review' || status === 'pae_submitted',
    source: pick(rand, SOURCES), embedding: fakeEmbedding(rand), metrics: null,
    details: { state, district: 'all', crop, season, domain: ['agronomy'], normalised_crop: crop },
    createdAt, updatedAt: createdAt,
  };
  if (status === 'closed') {
    doc.closedAt = new Date(createdAt.getTime() + Math.floor(rand() * 3 * 86400_000));
    doc.isClosed = true;
    doc.closedBy = 'system';
  }
  return doc;
}

function buildDuplicatePair(rand) {
  const pair = pick(rand, DUPLICATE_PAIRS);
  const state = pick(rand, STATES);
  const crop = 'wheat';
  const emb = fakeEmbedding(rand);
  const createdAt = new Date(Date.now() - 86400_000);
  return [
    { question: pair[0], originalQuestion: pair[1], status: 'queue_duplicate', priority: 'medium',
      totalAnswersCount: 0, isAutoAllocate: false, autoAllocateModerator: true,
      source: 'AJRASAKHA', embedding: emb,
      details: { state, district: 'all', crop, season: 'kharif', domain: ['agronomy'], normalised_crop: crop },
      metrics: { mean_similarity: 0.92, std_similarity: 0.001 },
      similarityScore: 92, isDuplicateChecked: true, createdAt, updatedAt: createdAt },
    { question: pair[1], status: 'queue_duplicate', priority: 'medium',
      totalAnswersCount: 0, isAutoAllocate: false, autoAllocateModerator: true,
      source: 'AJRASAKHA', embedding: nearDuplicateEmbedding(emb),
      details: { state, district: 'all', crop, season: 'kharif', domain: ['agronomy'], normalised_crop: crop },
      metrics: { mean_similarity: 0.92, std_similarity: 0.001 },
      similarityScore: 91, isDuplicateChecked: true, createdAt, updatedAt: createdAt },
  ];
}

async function main() {
  const rand = rng(1337);
  const statusMix = parseStatusMix(process.env.STATUS_MIX);
  const { client, db } = await connect();
  const questions = db.collection('questions');
  const submissions = db.collection('question_submissions');

  console.log(`[seed_questions] connecting → ${process.env.DB_URL} db=${process.env.DB_NAME}`);
  console.log(`[seed_questions] target ${TOTAL} questions; status mix:`, statusMix);

  // ── Wipe prior loadtest questions + their submissions ─────────────────────
  const priorIds = (await questions.find({ source: { $exists: true } }).project({ _id: 1 }).toArray()).map((q) => q._id);
  if (priorIds.length) {
    await submissions.deleteMany({ questionId: { $in: priorIds } });
    await questions.deleteMany({ _id: { $in: priorIds } });
  }
  console.log(`[seed_questions] cleared ${priorIds.length} prior loadtest questions`);

  // ── 1. Pre-allocate the curated DUPLICATE_PAIRS first ─────────────────────
  const dupDocs = [];
  for (let i = 0; i < DUPLICATE_PAIRS.length; i++) dupDocs.push(...buildDuplicatePair(rand));
  if (dupDocs.length) await questions.insertMany(dupDocs, { ordered: false });
  console.log(`[seed_questions] inserted ${dupDocs.length} curated duplicate-pair questions`);

  // ── 2. Bulk-insert the synthetic loadtest questions ──────────────────────
  console.log(`[seed_questions] generating ${TOTAL} random questions…`);
  const docs = [];
  for (let i = 0; i < TOTAL; i++) docs.push(buildRandomQuestion(rand, i, statusMix));
  const BATCH = 1000;
  for (let i = 0; i < docs.length; i += BATCH) {
    await questions.insertMany(docs.slice(i, i + BATCH), { ordered: false });
    process.stdout.write(`\r[seed_questions]   ${Math.min(i + BATCH, docs.length)}/${docs.length}`);
  }
  process.stdout.write('\n');

  // ── 3. Build matching question_submissions for every open question ────────
  const openIds = (await questions.find({ autoAllocateModerator: true }, { projection: { _id: 1 } }).toArray())
    .map((q) => q._id);
  const submissionDocs = openIds.map((qid) => ({
    questionId: qid,
    queue: [],          // empty ⇒ eligible for moderator allocation by the cron
    history: [],        // empty ⇒ never reviewed yet
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  console.log(`[seed_questions] creating ${submissionDocs.length} empty submissions…`);
  for (let i = 0; i < submissionDocs.length; i += BATCH) {
    await submissions.insertMany(submissionDocs.slice(i, i + BATCH), { ordered: false });
    process.stdout.write(`\r[seed_questions]   submissions ${Math.min(i + BATCH, submissionDocs.length)}/${submissionDocs.length}`);
  }
  process.stdout.write('\n');

  await close(client);
  console.log('[seed_questions] done');
}

main().catch(async (err) => {
  console.error('[seed_questions] failed:', err);
  process.exit(1);
});
