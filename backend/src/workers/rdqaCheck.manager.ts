import { getContainer } from '#root/bootstrap/loadModules.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { MongoDatabase } from '#root/shared/database/index.js';
import type { IAnswer, IQuestion, IGdbCleaningCheck, IRdqaCheck } from '#root/shared/interfaces/models.js';
import { ObjectId } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RdqaCheckJobResult {
  questionId: string;
  answerId?: string;
  passed: boolean;
  flags: string[];
  notEvaluated: string[];
  error?: string;
}

export interface RdqaCheckJobStatus {
  id: string;
  total: number;
  processed: number;
  passed: number;
  flagged: number;
  failed: number;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  finishedAt?: Date;
  logs: string[];
  errors: any[];
  results: RdqaCheckJobResult[];
}

const rdqaCheckJobs: Record<string, RdqaCheckJobStatus> = {};

function cleanupOldJobs() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
  for (const [id, job] of Object.entries(rdqaCheckJobs)) {
    if (job.startedAt && job.startedAt.getTime() < cutoff) {
      delete rdqaCheckJobs[id];
    }
  }
}

function getAnswerCheckBaseUrl(): string {
  const raw = process.env.ANSWER_CHECK_SERVER_URL || 'http://localhost:8012';
  return raw.replace('0.0.0.0', '127.0.0.1').replace(/\/+$/, '');
}

/**
 * Load banned chemicals list from data directory if available.
 */
let cachedBannedChemicals: string[] | null = null;
function getBannedChemicals(): string[] {
  if (cachedBannedChemicals) return cachedBannedChemicals;
  try {
    const candidates = [
      path.resolve(__dirname, '../../../apis/answer-check/data/quality_banned_chemicals.json'),
      path.resolve(__dirname, '../../../../apis/answer-check/data/quality_banned_chemicals.json'),
      path.resolve(process.cwd(), 'apis/answer-check/data/quality_banned_chemicals.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        cachedBannedChemicals = parsed.map((item: any) => item.name).filter(Boolean);
        return cachedBannedChemicals!;
      }
    }
  } catch {
    // ignore
  }
  cachedBannedChemicals = [
    'Alachlor', 'Aldicarb', 'Aldrin', 'Benzene Hexachloride', 'Benomyl',
    'Calcium Cyanide', 'Carbaryl', 'Carbosulfan', 'Chlorbenzilate', 'Chlordane',
    'Chlorofenvinphos', 'Diazinon', 'Dieldrin', 'Endosulfan', 'Endrin',
    'Lindane', 'Linuron', 'Methyl Parathion', 'Paraquat Dimethyl Sulphate',
    'Phorate', 'Phosphamidon', 'Sodium Cyanide', 'Triazophos', 'Tridemorph',
  ];
  return cachedBannedChemicals!;
}

/**
 * Fallback rule-based check when the external Python Answer Check API is unavailable.
 */
function evaluateRulesLocally(
  questionText: string,
  answerText: string,
  sources: any[],
): { checks: IGdbCleaningCheck[]; flags: string[]; notEvaluated: string[] } {
  const checks: IGdbCleaningCheck[] = [];
  const lowerAnswer = (answerText || '').toLowerCase();

  // 1. Banned Chemical Check
  const banned = getBannedChemicals();
  const foundBanned = banned.filter((chem) =>
    new RegExp(`\\b${chem.toLowerCase()}\\b`, 'i').test(lowerAnswer)
  );
  if (foundBanned.length > 0) {
    checks.push({
      parameter: 'banned_chemical',
      category: 'chemical',
      result: 'FAIL',
      reason: `Found banned chemical(s): ${foundBanned.join(', ')}`,
      highlight: foundBanned,
    });
  } else {
    checks.push({
      parameter: 'banned_chemical',
      category: 'chemical',
      result: 'PASS',
      reason: 'No banned chemicals found in answer',
    });
  }

  // 2. Source Present Check
  if (!sources || sources.length === 0) {
    checks.push({
      parameter: 'source_present',
      category: 'source',
      result: 'FAIL',
      reason: 'No source attached to answer',
    });
  } else {
    checks.push({
      parameter: 'source_present',
      category: 'source',
      result: 'PASS',
      reason: `${sources.length} source(s) attached`,
    });
  }

  // 3. Page Number Present Check
  if (sources && sources.length > 0) {
    const hasPage = sources.some((s) => s.page && String(s.page).trim() !== '');
    if (!hasPage) {
      checks.push({
        parameter: 'page_number_present',
        category: 'source',
        result: 'FAIL',
        reason: 'None of the attached sources include a page number',
      });
    } else {
      checks.push({
        parameter: 'page_number_present',
        category: 'source',
        result: 'PASS',
        reason: 'Page numbers present on attached sources',
      });
    }
  } else {
    checks.push({
      parameter: 'page_number_present',
      category: 'source',
      result: 'FAIL',
      reason: 'No sources attached',
    });
  }

  // 4. Officer Name Check
  const officerMatches = lowerAnswer.match(/\b(dr\.|prof\.|mr\.|mrs\.|officer|director|scientist)\s+[a-z]+/gi);
  if (officerMatches && officerMatches.length > 0) {
    checks.push({
      parameter: 'officer_name',
      category: 'terminology',
      result: 'FAIL',
      reason: `Potential officer/personal name found: ${officerMatches.join(', ')}`,
      highlight: officerMatches,
    });
  } else {
    checks.push({
      parameter: 'officer_name',
      category: 'terminology',
      result: 'PASS',
      reason: 'No officer names detected',
    });
  }

  // 5. Answer Structure Check
  if (!answerText || answerText.trim().length < 30) {
    checks.push({
      parameter: 'answer_structure',
      category: 'answer_quality',
      result: 'FAIL',
      reason: 'Answer is too short or missing key details',
    });
  } else {
    checks.push({
      parameter: 'answer_structure',
      category: 'answer_quality',
      result: 'PASS',
      reason: 'Answer length and basic structure are adequate',
    });
  }

  // Remaining checks that require LLM / external API are marked NOT_EVALUATED
  const externalChecks = [
    { parameter: 'restricted_chemical', category: 'chemical' },
    { parameter: 'uniformity_of_dose', category: 'chemical' },
    { parameter: 'source_fidelity', category: 'chemical' },
    { parameter: 'query_properly_answered', category: 'answer_quality' },
    { parameter: 'sequence', category: 'answer_quality' },
    { parameter: 'contextuality', category: 'answer_quality' },
    { parameter: 'private_product_name', category: 'terminology' },
    { parameter: 'local_name_mismatch', category: 'terminology' },
  ];

  for (const item of externalChecks) {
    checks.push({
      parameter: item.parameter,
      category: item.category,
      result: 'NOT_EVALUATED',
      reason: 'External answer check model offline; heuristic check applied',
    });
  }

  const flags = checks.filter((c) => c.result === 'FAIL').map((c) => c.parameter);
  const notEvaluated = checks.filter((c) => c.result === 'NOT_EVALUATED').map((c) => c.parameter);
  return { checks, flags, notEvaluated };
}

/**
 * Call the Answer Check API (POST /check and poll GET /check/{job_id}).
 */
async function callAnswerCheckApi(payload: {
  question: string;
  answer: string;
  crop?: string;
  state?: string;
  sources: any[];
  answerId?: string;
}): Promise<{ checks: IGdbCleaningCheck[]; flags: string[]; notEvaluated: string[] }> {
  const baseUrl = getAnswerCheckBaseUrl();

  const submitRes = await fetch(`${baseUrl}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: payload.question,
      answer: payload.answer,
      crop: payload.crop || 'Unknown',
      state: payload.state || 'Unknown',
      sources: payload.sources.map((s) => ({
        sourceName: s.sourceName || '',
        source: s.source || '',
        page: s.page ? String(s.page) : '',
        sourceType: s.sourceType,
      })),
      answerId: payload.answerId,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!submitRes.ok) {
    const errorText = await submitRes.text();
    throw new Error(`Submit check returned ${submitRes.status}: ${errorText.slice(0, 150)}`);
  }

  const summary = (await submitRes.json()) as { job_id: string; status: string };
  const externalJobId = summary.job_id;

  // Poll external job until completed (up to 90s)
  const pollStart = Date.now();
  while (Date.now() - pollStart < 90000) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const statusRes = await fetch(`${baseUrl}/check/${encodeURIComponent(externalJobId)}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!statusRes.ok) continue;

    const data = (await statusRes.json()) as any;
    if (data.status === 'completed') {
      const rawChecks: any[] = data.checks || [];
      const checks: IGdbCleaningCheck[] = rawChecks.map((c: any) => ({
        parameter: c.parameter,
        category: c.category,
        result:
          c.status === 'FLAG' || c.result === 'FAIL'
            ? 'FAIL'
            : c.status === 'PASS' || c.result === 'PASS'
            ? 'PASS'
            : c.status === 'NOT_EVALUATED' || c.result === 'NOT_EVALUATED'
            ? 'NOT_EVALUATED'
            : 'NOT_APPLICABLE',
        reason: c.reason || '',
        highlight: c.highlight || undefined,
      }));

      const flags = checks.filter((c) => c.result === 'FAIL').map((c) => c.parameter);
      const notEvaluated = checks.filter((c) => c.result === 'NOT_EVALUATED').map((c) => c.parameter);
      return { checks, flags, notEvaluated };
    }

    if (data.status === 'failed') {
      throw new Error(`External check job failed: ${data.error || 'Unknown error'}`);
    }
  }

  throw new Error('External answer check timed out after 90 seconds');
}

/**
 * Process a single question: fetch finalized answer, run checks, and persist to MongoDB.
 */
let rdqaIndexesEnsured = false;

async function processQuestionCheck(
  questionId: string,
  db: MongoDatabase,
  userId?: string,
): Promise<RdqaCheckJobResult> {
  const answerCol = await db.getCollection<IAnswer>('answers');
  const questionCol = await db.getCollection<IQuestion>('questions');
  const rdqaChecksCol = await db.getCollection<IRdqaCheck>('rdqa_checks');

  if (!rdqaIndexesEnsured) {
    rdqaIndexesEnsured = true;
    rdqaChecksCol.createIndex({ questionId: 1, checkedAt: -1 }).catch(() => {});
    rdqaChecksCol.createIndex({ answerId: 1, checkedAt: -1 }).catch(() => {});
  }

  const qObjectId = new ObjectId(questionId);
  const question = await questionCol.findOne({ _id: qObjectId });
  if (!question) {
    return {
      questionId,
      passed: false,
      flags: [],
      notEvaluated: [],
      error: 'Question not found',
    };
  }

  // Find finalized answer first, fallback to latest answer
  let answer = await answerCol.findOne({ questionId: qObjectId, isFinalAnswer: true });
  if (!answer) {
    answer = await answerCol.findOne({ questionId: qObjectId }, { sort: { createdAt: -1 } });
  }

  if (!answer) {
    return {
      questionId,
      passed: false,
      flags: [],
      notEvaluated: [],
      error: 'No answer found for question',
    };
  }

  const questionText = (question as any).question || (question as any).text || '';
  const answerText = answer.answer || '';
  const crop =
    typeof question.details?.crop === 'string'
      ? question.details.crop
      : (question.details?.crop as any)?.name || '';
  const state = question.details?.state || '';
  const sources = answer.sources || [];

  let evaluation: { checks: IGdbCleaningCheck[]; flags: string[]; notEvaluated: string[] };

  try {
    evaluation = await callAnswerCheckApi({
      question: questionText,
      answer: answerText,
      crop,
      state,
      sources,
      answerId: answer._id?.toString(),
    });
  } catch (apiErr: any) {
    // Graceful fallback to rule-based evaluation if Answer Check server is offline or fails
    console.warn(`[RdqaCheck] Answer Check API offline/error for ${questionId} (${apiErr?.message}), using local heuristics`);
    evaluation = evaluateRulesLocally(questionText, answerText, sources);
  }

  const { checks, flags, notEvaluated } = evaluation;
  const checkedAt = new Date();
  const passed = flags.length === 0;

  // Insert full check result into the dedicated rdqa_checks collection (audit trail)
  const checkDoc: IRdqaCheck = {
    questionId: qObjectId,
    answerId: answer._id as ObjectId,
    checkedAt,
    checkedBy: userId,
    passed,
    flags,
    notEvaluated,
    checks,
    answerSnapshot: answerText,
    sourcesSnapshot: sources as any,
    trigger: 'rdqa_batch',
    createdAt: checkedAt,
  };
  const insertResult = await rdqaChecksCol.insertOne(checkDoc as any);
  const checkId = insertResult.insertedId;

  // Update answer in MongoDB with lightweight summary reference
  await answerCol.updateOne(
    { _id: answer._id as ObjectId },
    {
      $set: {
        lastCheckId: checkId,
        flags,
        notEvaluated,
        checkedAt,
        rdqaChecked: true,
      } as any,
      $unset: {
        checks: '',
      } as any,
    }
  );

  // Update question in MongoDB (timestamp only, cleaning up redundant arrays)
  await questionCol.updateOne(
    { _id: qObjectId },
    {
      $set: {
        rdqaCheckedAt: checkedAt,
      } as any,
      $unset: {
        checks: '',
        flags: '',
        notEvaluated: '',
      } as any,
    }
  );

  return {
    questionId,
    answerId: answer._id?.toString(),
    passed,
    flags,
    notEvaluated,
  };
}

/**
 * Worker runner task for an RDQA check job.
 */
async function runRdqaCheckTask(jobId: string, questionIds: string[], userId: string) {
  const job = rdqaCheckJobs[jobId];
  if (!job) return;

  try {
    const db = getContainer().get<MongoDatabase>(GLOBAL_TYPES.Database);

    for (let i = 0; i < questionIds.length; i++) {
      const qId = questionIds[i];
      try {
        job.logs.push(`🔍 [${i + 1}/${questionIds.length}] Checking question ${qId}...`);
        const result = await processQuestionCheck(qId, db, userId);
        job.results.push(result);
        job.processed += 1;

        if (result.error) {
          job.failed += 1;
          job.errors.push({ questionId: qId, error: result.error });
          job.logs.push(`⚠️ Question ${qId}: ${result.error}`);
        } else if (result.passed) {
          job.passed += 1;
          job.logs.push(`✅ Question ${qId}: Passed (0 flags)`);
        } else {
          job.flagged += 1;
          job.logs.push(`🚩 Question ${qId}: ${result.flags.length} flag(s) [${result.flags.join(', ')}]`);
        }
      } catch (err: any) {
        job.processed += 1;
        job.failed += 1;
        const msg = err?.message || 'Check failed';
        job.errors.push({ questionId: qId, error: msg });
        job.logs.push(`❌ Question ${qId} crashed: ${msg}`);
      }
    }

    job.status = job.failed === job.total && job.total > 0 ? 'failed' : 'completed';
    job.finishedAt = new Date();
    job.logs.push(
      `🏁 RDQA Check finished: ${job.passed} passed, ${job.flagged} flagged, ${job.failed} failed out of ${job.total}`
    );
  } catch (jobErr: any) {
    job.status = 'failed';
    job.finishedAt = new Date();
    job.logs.push(`❌ Job fatal error: ${jobErr?.message || 'Unknown error'}`);
  }
}

/**
 * Start an RDQA quality check job for the given question IDs.
 */
export const startRdqaCheckJob = (questionIds: string[], userId: string): string => {
  cleanupOldJobs();

  const jobId = `rdqa_check_${Date.now()}`;
  const total = questionIds.length;

  const job: RdqaCheckJobStatus = {
    id: jobId,
    total,
    processed: 0,
    passed: 0,
    flagged: 0,
    failed: 0,
    status: 'running',
    startedAt: new Date(),
    logs: [`🚀 RDQA Quality Check Job ${jobId} started for ${total} question(s)`],
    errors: [],
    results: [],
  };

  rdqaCheckJobs[jobId] = job;

  // Run in background without blocking response
  runRdqaCheckTask(jobId, questionIds, userId).catch((err) => {
    console.error(`[RdqaCheck] Background task ${jobId} failed:`, err);
  });

  return jobId;
};

export const getRdqaCheckJobs = () =>
  Object.values(rdqaCheckJobs).map(({ logs, ...rest }) => ({
    ...rest,
    logs: logs.slice(-10),
  }));

export const getRdqaCheckJobById = (jobId: string): RdqaCheckJobStatus | undefined =>
  rdqaCheckJobs[jobId];
