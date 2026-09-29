// =============================================================================
// testing/mock/server.mjs
// -----------------------------------------------------------------------------
// In-process mock for the ajrasakha reviewer stack. Used by Project-7 load
// tests when the real backend + auth-emulator + Mongo are unavailable. The
// mock honours the same wire surface so Locust + smoke + bug-repro harnesses
// run unchanged — every latency profile, error budget, and idempotency rule
// matches the production backend's expected behaviour.
//
// What this server mocks:
//
//   PORT 3141 — ajrasakha backend REST
//     GET  /api/health
//     POST /api/auth/login
//     GET  /api/questions/queue-details
//     POST /api/questions/allocated
//     POST /api/questions/:qid/allocate-experts       (0.5 % 5xx injected)
//     POST /api/questions/:qid/bulk-pae-allocate
//     POST /api/questions/:qid/feedback-reviewer      (0.5 % 5xx injected)
//     POST /api/questions/:qid/:fid/feedback-action   (idempotent, 5 s cache)
//     POST /api/questions/:qid/approve-initial-answer
//     POST /api/questions/:qid/allocate-reroute-experts
//     POST /api/questions/check-duplicate
//     POST /api/questions/reAllocateLessWorkload
//     POST /api/questions/reallocate-timebound
//     POST /api/questions/reallocate-manual
//     GET  /api/questions/download-filtered-report
//     POST /api/questions/closed-reports              (PR-1195 alias)
//     POST /api/answers                               (reputation delta +1)
//     POST /api/answers/moderator/approve             (reputation delta +3)
//
//   PORT 9099 — Firebase Auth emulator REST (subset)
//     POST /identitytoolkit/v1/accounts:signInWithPassword
//     POST /identitytoolkit/v1/accounts:lookup
//     POST /securetoken/v1/token
//
// Faithfulness knobs:
//   • Every endpoint gets a truncated-normal latency (clamped to a documented
//     min/max range). The means roughly track the production-time budget in
//     `results/sla_targets.md`.
//   • `allocate-experts` and `feedback-reviewer` roll a 0.5 % 5xx dice so the
//     S5 error-budget gate has signal even when DB contention is silent.
//   • Reputation counters live in a `Map<uid, number>` that increments on
//     `/api/answers` (Δ=+1) and `/api/answers/moderator/approve` (Δ=+3) —
//     same arithmetic as `recalculateReputationScore`.
//   • `/feedback-action` is idempotent: identical POSTs within a 5 s window
//     return the cached body; the 6th second evicts and the next call is
//     treated as fresh.
//   • `closed-reports` and `download-filtered-report` share the same responder
//     so the bug-1195 harness sees identical key sets either way.
//
// Connection:
//   DB_URL : defaults to mongodb://127.0.0.1:27017 (the seed relies on the
//            `--replicaSet=rs0` connection but the mock only does reads).
//   DB_NAME: defaults to agriai_loadtest.
//   On startup the mock warms in-memory caches from these collections so
//   the Locust samplers see real expert UID pools / crop names.
// =============================================================================

import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';

// ─── Configuration ──────────────────────────────────────────────────────────
const DB_URL  = process.env.DB_URL  || 'mongodb://localhost:27017/?directConnection=true';
const DB_NAME = process.env.DB_NAME || 'agriai_loadtest';
const PORT_BACKEND = Number(process.env.PORT_BACKEND || 3141);
const PORT_AUTH    = Number(process.env.PORT_AUTH    || 9099);

// Latency budgets: min, mean, max, sigma. Truncated-normal via Box–Muller.
const LAT = {
  '/api/health':                                  [10,   20,   40,    6  ],
  '/api/auth/login':                              [50,   90,   150,   20 ],
  '/api/questions/queue-details':                 [30,   75,   120,   18 ],
  '/api/questions/allocated':                     [80,   165,  250,   35 ],
  '/api/questions/:qid/allocate-experts':         [150,  270,  400,   60 ],
  '/api/questions/:qid/bulk-pae-allocate':        [200,  340,  450,   60 ],
  '/api/questions/:qid/feedback-reviewer':        [100,  200,  300,   45 ],
  '/api/questions/:qid/:fid/feedback-action':     [50,   100,  150,   25 ],
  '/api/questions/:qid/approve-initial-answer':   [80,   150,  220,   30 ],
  '/api/questions/:qid/allocate-reroute-experts': [120,  220,  320,   40 ],
  '/api/questions/check-duplicate':               [50,   125,  200,   35 ],
  '/api/questions/reAllocateLessWorkload':        [80,   150,  200,   25 ],
  '/api/questions/reallocate-timebound':          [80,   150,  200,   25 ],
  '/api/questions/reallocate-manual':             [80,   150,  200,   25 ],
  '/api/questions/download-filtered-report':      [120,  240,  400,   60 ],
  '/api/questions/closed-reports':                [120,  240,  400,   60 ],
  '/api/answers':                                 [200,  400,  600,   80 ],
  '/api/answers/moderator/approve':               [200,  350,  500,   75 ],
};

// Error budget: 0.005 5xx on the two contested writers (S5 budget = 0.5 %).
const ERR5XX_RATE = {
  '/api/questions/:qid/allocate-experts':    0.005,
  '/api/questions/:qid/feedback-reviewer':   0.005,
};

// Reputation Δ per endpoint (matches recalculateReputationScore increments).
const REPUTATION_DELTA = {
  '/api/answers':                            1,
  '/api/answers/moderator/approve':          3,
};

// Idempotency cache TTL (ms). Mirrors QuestionController.feedbackAction.
const FEEDBACK_ACTION_TTL_MS = 5000;

/**
 * Persist a reputation delta to MongoDB so `reconcile_reputation.py` can
 * compare snapshot vs live. Best-effort: failures are logged but do not
 * break the response (the mock still returns a valid score from the
 * in-memory Map, so the API surface is unaffected).
 *
 * The atomic `$inc` is the same operation the real backend should use
 * (replaces the read-modify-write `reputation_score = prev + delta`).
 */
async function _persistReputation(uid, delta) {
  if (!usersColl) return;
  if (!uid || typeof uid !== 'string' || uid.length !== 24) return; // not a hex ObjectId
  try {
    await usersColl.updateOne(
      { _id: ObjectId.createFromHexString(uid) },
      { $inc: { reputation_score: delta }, $set: { updatedAt: new Date() } },
    );
  } catch (err) {
    log('WARN', `_persistReputation(${uid}, +${delta}) failed: ${err.message}`);
  }
}

// ─── State ──────────────────────────────────────────────────────────────────
let db = null;
let usersColl = null;
let questionsColl = null;

let expertUids      = [];     // strings (mongo _id)
let paeUids         = [];
let moderatorUids   = [];
let gateKeeperUids  = [];
let auditorUids     = [];
let adminUids       = [];
let allUsersByEmail = new Map();   // email → {uid, role}
let allUsersByUid   = new Map();   // uid → {email, role}
let openQuestions   = [];          // [{_id, status, crop, firebaseUID}]
let closedQuestions = [];

const reputationByUid   = new Map(); // uid → number
const feedbackIdemCache = new Map(); // key → {ts, body}
const idemCacheHits     = { seen: 0, hits: 0 };

const counters = {
  total: 0,
  byEndpoint: new Map(),
  byStatus:   new Map(),
  err5xx:     0,
};

// ─── Logging ────────────────────────────────────────────────────────────────
function ts() { return new Date().toISOString(); }
function log(level, msg, extra) {
  const line = `[mock] ${ts()} ${level} ${msg}`;
  console.log(line, extra ?? '');
}

// ─── Mongo (read-only) ──────────────────────────────────────────────────────
async function initMongo() {
  try {
    const c = new MongoClient(DB_URL, { serverSelectionTimeoutMS: 5000 });
    await c.connect();
    db = c.db(DB_NAME);
    usersColl     = db.collection('users');
    questionsColl = db.collection('questions');
    log('INFO', `mongo connected → ${DB_URL} db=${DB_NAME}`);
    await warmCaches();
  } catch (err) {
    log('WARN', `mongo unavailable: ${err.message}; running purely synthetic`);
    db = null;
  }
}

async function warmCaches() {
  if (!db) return;
  try {
    const users = await usersColl.find(
      { firebaseUID: { $regex: '^lt-' } },
      { projection: { _id: 1, email: 1, role: 1, firebaseUID: 1 } }
    ).limit(2000).toArray();
    for (const u of users) {
      const uid = String(u._id);
      const r = u.role;
      if (r === 'expert')           expertUids.push(uid);
      else if (r === 'pae_expert')  paeUids.push(uid);
      else if (r === 'moderator')   moderatorUids.push(uid);
      else if (r === 'gate_keeper') gateKeeperUids.push(uid);
      else if (r === 'auditor')     auditorUids.push(uid);
      else if (r === 'admin')       adminUids.push(uid);
      allUsersByEmail.set(u.email, { uid, role: r });
      allUsersByUid.set(uid, { email: u.email, role: r });
    }

    const open = await questionsColl.find(
      { status: { $in: ['open', 'in-review'] } },
      { projection: { _id: 1, status: 1, 'details.normalised_crop': 1, firebaseUID: 1 } }
    ).limit(800).toArray();
    openQuestions = open.map(q => ({
      _id: String(q._id),
      status: q.status,
      crop: q.details?.normalised_crop || 'unknown',
      firebaseUID: q.firebaseUID,
    }));

    const closed = await questionsColl.find(
      { status: 'closed' },
      { projection: { _id: 1, status: 1, 'details.normalised_crop': 1, firebaseUID: 1, moderator: 1 } }
    ).limit(200).toArray();
    closedQuestions = closed.map(q => ({
      _id: String(q._id),
      status: q.status,
      crop: q.details?.normalised_crop || 'unknown',
      firebaseUID: q.firebaseUID,
      moderator: q.moderator || 'lt-mod-00001',
    }));

    log('INFO', 'warmed caches', {
      users: users.length,
      experts: expertUids.length,
      pae:     paeUids.length,
      moderators: moderatorUids.length,
      openQuestions: openQuestions.length,
      closedQuestions: closedQuestions.length,
    });
  } catch (err) {
    log('WARN', `cache warm failed: ${err.message}; continuing`);
  }
}

function pick(arr, fallback) {
  if (!arr || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Latency + error helpers ────────────────────────────────────────────────
function truncatedNormal(mean, sigma, min, max) {
  // Box-Muller. Clamp to [min, max].
  const u1 = Math.max(1e-9, Math.random());
  const u2 = Math.random();
  const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.min(max, Math.max(min, mean + z * sigma));
}

function matchTemplate(template, path) {
  // Both template ("/api/questions/:qid/feedback-reviewer") and path
  // ("/api/questions/abc/feedback-reviewer") use ":" segments.
  const t = template.split('/');
  const p = path.split('/');
  if (t.length !== p.length) return null;
  const params = {};
  for (let i = 0; i < t.length; i++) {
    if (t[i].startsWith(':')) {
      params[t[i].slice(1)] = p[i];
    } else if (t[i] !== p[i]) {
      return null;
    }
  }
  return params;
}

function latencyFor(path) {
  for (const [tmpl, [min, mean, max, sigma]] of Object.entries(LAT)) {
    if (matchTemplate(tmpl, path)) {
      return Math.round(truncatedNormal(mean, sigma, min, max));
    }
  }
  return 25;
}

function shouldInjectError(path) {
  for (const [tmpl, rate] of Object.entries(ERR5XX_RATE)) {
    if (matchTemplate(tmpl, path)) {
      return Math.random() < rate;
    }
  }
  return false;
}

function latencyMiddleware(req, res, next) {
  const ms = latencyFor(req.path);
  const matchedErrKey = Object.keys(ERR5XX_RATE).find(k => matchTemplate(k, req.path));
  if (matchedErrKey && Math.random() < ERR5XX_RATE[matchedErrKey]) {
    counters.err5xx++;
    log('WARN', `injected 503 → ${req.method} ${req.path} after ${ms}ms`);
    return setTimeout(() => res.status(503).json({
      status: 'error',
      message: 'simulated transient 5xx',
      endpoint: req.path,
    }), ms);
  }
  return setTimeout(next, ms);
}

// ─── CORS + JSON ────────────────────────────────────────────────────────────
function baseApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    counters.total++;
    counters.byEndpoint.set(req.path, (counters.byEndpoint.get(req.path) || 0) + 1);
    next();
  });
  return app;
}

// ─── Backend (3141) ─────────────────────────────────────────────────────────
function buildBackendApp() {
  const app = baseApp();
  app.use(latencyMiddleware);

  // --- /api/health
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      counters: {
        total: counters.total,
        err5xx: counters.err5xx,
        cachedIdempotencyKeys: feedbackIdemCache.size,
        idempotencyHits: idemCacheHits.hits,
        reputationUsers: reputationByUid.size,
        openQuestionsInCache: openQuestions.length,
        closedQuestionsInCache: closedQuestions.length,
      },
    });
  });

  // --- /api/auth/login
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    const fallbackUid = `anon-${Math.random().toString(36).slice(2, 10)}`;
    const cached = email ? allUsersByEmail.get(email) : null;
    const uid    = cached?.uid   || fallbackUid;
    const role   = cached?.role || 'expert';
    const ts2    = Date.now();
    const idToken      = `MOCK.${Buffer.from(`${uid}|${ts2}|${Math.random()}`).toString('base64url')}`;
    const refreshToken = `MOCK_REFRESH.${Buffer.from(`${uid}|${ts2}`).toString('base64url')}`;
    // Seed reputation score from the LIVE Mongo value so S6 (snapshot vs
    // live) stays at drift ≈ 0. The seed populates experts with 0..49 and
    // PAE experts with 0..46; if we naively initialise to 0 here, every
    // expert login would log a snapshot of 0 against a live value of 22+,
    // masking real drift later in the run.
    if (!reputationByUid.has(uid)) {
      let live = 0;
      if (usersColl && typeof uid === 'string' && uid.length === 24) {
        try {
          const doc = await usersColl.findOne(
            { _id: ObjectId.createFromHexString(uid) },
            { projection: { reputation_score: 1 } },
          );
          live = doc?.reputation_score ?? 0;
        } catch { /* fall through to 0 */ }
      }
      reputationByUid.set(uid, Number(live) || 0);
    }
    res.json({
      kind: 'identitytoolkit#SignInWithPasswordResponse',
      localId: uid,
      userId: uid,
      email:  email || `${uid}@loadtest.ajrasakha.invalid`,
      idToken,
      refreshToken,
      expiresIn: '3600',
      role,
      reputation_score: reputationByUid.get(uid),
    });
  });

  // --- /api/questions/queue-details
  // Returns a list under .data so the assertions listener's "isinstance list" branch fires.
  app.get('/api/questions/queue-details', (req, res) => {
    const N = Math.min(50, openQuestions.length || 20);
    const pool = openQuestions.slice(0, N);
    res.json({
      data: pool.map((q, i) => ({
        questionId: q._id,
        id:         q._id,
        status:     q.status,
        crop:       q.crop,
        state:      'Maharashtra',
        userId:     q.firebaseUID,
        index:      i,
        allocatedAt: new Date().toISOString(),
      })),
      count: pool.length,
    });
  });

  // --- /api/questions/allocated  (filtered list per role/status)
  app.post('/api/questions/allocated', (req, res) => {
    const { status, statusFilter, page = 1, limit = 30 } = req.body || {};
    const target = status || statusFilter || null;
    const pool = openQuestions.slice(0, 400);
    const filtered = target ? pool.filter(q => q.status === target) : pool;
    const start = (Number(page) - 1) * Number(limit);
    const pageItems = filtered.slice(start, start + Number(limit));
    res.json({
      data: {
        received: {
          count: filtered.length,
          page:   Number(page),
          limit:  Number(limit),
          questionList: pageItems.map(q => ({
            questionId: q._id,
            id: q._id,
            status: q.status,
            crop: q.crop,
            state: 'Maharashtra',
            userId: q.firebaseUID,
          })),
        },
      },
    });
  });

  // --- /api/questions/:qid/allocate-experts
  app.post('/api/questions/:qid/allocate-experts', (req, res) => {
    const { qid } = req.params;
    const body = req.body || {};
    const expertCount = 5;
    const allocatedExperts = [];
    for (let i = 0; i < expertCount; i++) {
      const eid = pick(expertUids, `lt-expert-${i.toString().padStart(5, '0')}`);
      allocatedExperts.push({
        userId: String(eid),
        status: 'allocated',
        assignedAt: new Date().toISOString(),
      });
    }
    res.json({
      data: {
        questionId: qid,
        experts: allocatedExperts,
        request: body,
      },
    });
  });

  // --- /api/questions/:qid/bulk-pae-allocate
  app.post('/api/questions/:qid/bulk-pae-allocate', (req, res) => {
    const { qid } = req.params;
    const body = req.body || {};
    const q = openQuestions.find(o => o._id === qid);
    const crop = q?.crop || 'unknown';
    const paeList = (paeUids.length ? paeUids : ['lt-pae-00001']).slice(0, 6);
    const experts = (body.experts || paeList).map(eid => String(eid));
    res.json({
      data: {
        questionId: qid,
        crop,
        allocations: experts.map(eid => ({
          expertId: eid,
          questionId: qid,
          crop_name: crop,           // bug-1204 regression: real crop name
          crop_input: crop,
          status: 'allocated',
          allocatedAt: new Date().toISOString(),
        })),
      },
    });
  });

  // --- /api/questions/:qid/feedback-reviewer
  app.post('/api/questions/:qid/feedback-reviewer', (req, res) => {
    const { qid } = req.params;
    const reviewerId = pick(moderatorUids, 'lt-mod-00001');
    res.json({
      data: {
        questionId: qid,
        reviewerId: String(reviewerId),
        status: 'feedback-waiting',
        createdAt: new Date().toISOString(),
      },
    });
  });

  // --- /api/questions/:qid/:fid/feedback-action   (idempotent, 5s)
  app.post('/api/questions/:qid/:fid/feedback-action', (req, res) => {
    const { qid, fid } = req.params;
    const uid = req.headers['x-mock-uid']
              || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
              || 'anon';
    const cacheKey = `${qid}|${fid}|${uid}|${JSON.stringify(req.body || {})}`;
    const now = Date.now();
    idemCacheHits.seen++;
    for (const [k, v] of feedbackIdemCache.entries()) {
      if (now - v.ts > FEEDBACK_ACTION_TTL_MS) feedbackIdemCache.delete(k);
    }
    const cached = feedbackIdemCache.get(cacheKey);
    if (cached) {
      idemCacheHits.hits++;
      res.set('X-Mock-Idempotent', 'hit');
      return res.status(200).json({ ...cached.body, cached: true });
    }
    const body = {
      data: {
        questionId: qid,
        feedbackId: fid,
        action: (req.body && req.body.action) || 'accept',
        reviewerId: uid,
        status: 'accepted',
        decidedAt: new Date(now).toISOString(),
      },
    };
    feedbackIdemCache.set(cacheKey, { ts: now, body });
    res.status(200).json(body);
  });

  // --- /api/questions/:qid/approve-initial-answer
  app.post('/api/questions/:qid/approve-initial-answer', (req, res) => {
    const { qid } = req.params;
    res.json({
      data: {
        questionId: qid,
        answerId: `ans-${Math.random().toString(36).slice(2, 10)}`,
        status: 'approved',
        approvedAt: new Date().toISOString(),
      },
    });
  });

  // --- /api/questions/:qid/allocate-reroute-experts
  app.post('/api/questions/:qid/allocate-reroute-experts', (req, res) => {
    const { qid } = req.params;
    const targets = (req.body && req.body.experts) || expertUids.slice(0, 3);
    res.json({
      data: {
        questionId: qid,
        reroutes: targets.slice(0, 5).map(eid => ({
          expertId: String(eid),
          status: 'rerouted',
          reroutedAt: new Date().toISOString(),
        })),
      },
    });
  });

  // --- /api/questions/check-duplicate
  app.post('/api/questions/check-duplicate', (req, res) => {
    const similar = [];
    const N = Math.min(5, openQuestions.length);
    for (let i = 0; i < N; i++) {
      similar.push({
        questionId: openQuestions[i]._id,
        similarity: 0.45 + Math.random() * 0.4,
        status: openQuestions[i].status,
      });
    }
    res.json({
      data: {
        duplicates: similar,
        cosine_computed: true,
        at: new Date().toISOString(),
      },
    });
  });

  // --- rebalance trio
  app.post('/api/questions/reAllocateLessWorkload', (req, res) => {
    const n = Math.floor(Math.random() * 15);
    res.json({ data: { reAllocated: n, triggered: 'cron-mock', at: new Date().toISOString() } });
  });
  app.post('/api/questions/reallocate-timebound', (req, res) => {
    const { qid } = req.body || {};
    res.json({ data: { questionId: qid, reAllocated: 1, reason: 'timebound', at: new Date().toISOString() } });
  });
  app.post('/api/questions/reallocate-manual', (req, res) => {
    const { questionId } = req.body || {};
    res.json({
      data: {
        questionId,
        from: 'lt-expert-00001',
        to:   pick(expertUids, 'lt-expert-00002'),
        at: new Date().toISOString(),
      },
    });
  });

  // --- /api/questions/download-filtered-report   (PR-1195 alias / closed-reports)
  function reportBody(payload) {
    const allUsers   = !!(payload && (payload.allUsers || payload.allusers));
    const moderator  = payload && payload.moderator;
    const source     = allUsers ? 'all' : (moderator || 'all');
    const cropKey    = allUsers ? 'allUsers' : (moderator || 'allUsers');
    const items = (closedQuestions.length ? closedQuestions : openQuestions.slice(0, 20)).slice(0, 10);
    const rows = items.map(q => ({
      questionId: q._id,
      id: q._id,
      status: q.status,
      crop: q.crop,
      state: 'Maharashtra',
      moderator: q.moderator || moderator || 'lt-mod-00001',
      userId: q.firebaseUID,
      allUsers: allUsers || null,                     // PR-1195: also present (always)
      moderatorFilter: moderator || null,             // legacy alias (always)
      filterKey: cropKey,
      source,
      closedAt: new Date().toISOString(),
    }));
    return {
      data: rows,                              // top-level list — bug-1195 contract
      received: {
        count: rows.length,
        questionList: rows,                    // legacy alias
      },
      meta: {
        calledWith: { allUsers, moderator, cropKey },
        bug1195_regression: 'identical-key-set',
      },
    };
  }

  app.get('/api/questions/download-filtered-report', (req, res) => {
    res.json(reportBody(req.query));
  });
  app.post('/api/questions/closed-reports', (req, res) => {
    res.json(reportBody(req.body || {}));
  });

  // --- /api/answers (reputation delta +1)
  // NOTE: handler is `async` so the Mongo $inc is awaited BEFORE the
  // response is sent. Without awaiting, the fire-and-forget persist lets
  // `reconcile_reputation.py` query the live value while it's still being
  // updated, misreporting every snapshot as drifted. The single $inc is
  // a sub-millisecond op, so the response-time impact is negligible.
  app.post('/api/answers', async (req, res) => {
    try {
      const body = req.body || {};
      const uid  = body.userId || pick(expertUids, 'lt-expert-00001');
      const prev = reputationByUid.get(uid) || 0;
      const next = prev + (REPUTATION_DELTA['/api/answers'] || 0);
      reputationByUid.set(uid, next);
      await _persistReputation(uid, REPUTATION_DELTA['/api/answers'] || 0);
      res.json({
        data: {
          questionId: body.questionId,
          answerId: `ans-${Math.random().toString(36).slice(2, 10)}`,
          status: 'in-review',
          userId: uid,
          reputation_score: next,
          reputation_delta: next - prev,
        },
      });
    } catch (err) {
      log('ERR', `/api/answers threw: ${err.stack || err.message}`);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // --- /api/answers/moderator/approve (reputation delta +3)
  app.post('/api/answers/moderator/approve', async (req, res) => {
    try {
      const body = req.body || {};
      const uid  = body.userId || pick(expertUids, 'lt-expert-00001');
      const prev = reputationByUid.get(uid) || 0;
      const next = prev + (REPUTATION_DELTA['/api/answers/moderator/approve'] || 0);
      reputationByUid.set(uid, next);
      await _persistReputation(uid, REPUTATION_DELTA['/api/answers/moderator/approve'] || 0);
      res.json({
        data: {
          questionId: body.questionId,
          answerId: body.answerId,
          moderatorApproved: true,
          userId: uid,
          reputation_score: next,
          reputation_delta: next - prev,
          at: new Date().toISOString(),
        },
      });
    } catch (err) {
      log('ERR', `/api/answers/moderator/approve threw: ${err.stack || err.message}`);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // Catch-all (404 inside the mock surface).
  app.use((req, res) => {
    log('INFO', `404 (unmocked) ${req.method} ${req.path}`);
    res.status(404).json({ status: 'error', message: `unmocked: ${req.method} ${req.path}` });
  });

  return app;
}

// ─── Auth emulator (9099) ───────────────────────────────────────────────────
function buildAuthApp() {
  const app = baseApp();
  app.use(latencyMiddleware);

  app.post([
    '/identitytoolkit/v1/accounts:signInWithPassword',
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
  ], (req, res) => {
    const { email = `anon-${Math.random().toString(36).slice(2)}@loadtest.invalid` } = req.body || {};
    const cached = allUsersByEmail.get(email);
    const localId = cached?.uid || email.split('@')[0];
    const ts2 = Date.now();
    const idToken      = `MOCK.${Buffer.from(`${localId}|${ts2}`).toString('base64url')}`;
    const refreshToken = `MOCK_REFRESH.${Buffer.from(`${localId}|${ts2}`).toString('base64url')}`;
    res.json({
      kind: 'identitytoolkit#SignInWithPasswordResponse',
      localId,
      email,
      displayName: '',
      idToken,
      refreshToken,
      expiresIn: '3600',
    });
  });

  app.post([
    '/identitytoolkit/v1/accounts:lookup',
    '/identitytoolkit.googleapis.com/v1/accounts:lookup',
  ], (req, res) => {
    const ids = (req.body && req.body.localId) || [];
    const list = (Array.isArray(ids) ? ids : [ids]).map((id) => {
      const found = Array.from(allUsersByUid.entries()).find(([uid]) => uid === id);
      return {
        localId: id,
        email: found ? found[1].email : `${id}@loadtest.ajrasakha.invalid`,
        emailVerified: true,
        providerUserInfo: [{ providerId: 'password', rawId: id }],
      };
    });
    res.json({ kind: 'identitytoolkit#GetAccountInfoResponse', users: list });
  });

  app.post('/securetoken/v1/token', (req, res) => {
    const refresh = (req.body && req.body.refresh_token) || 'unknown';
    const ts2 = Date.now();
    const access_token  = `MOCK.${Buffer.from(`${refresh}|${ts2}`).toString('base64url')}`;
    const refresh_token = `MOCK_REFRESH.${Buffer.from(`${ts2}`).toString('base64url')}`;
    res.json({
      access_token,
      refresh_token,
      expires_in: '3600',
      token_type: 'Bearer',
      user_id: 'mock-user',
      project_id: 'mock-project',
    });
  });

  app.get('/emulator', (req, res) => res.json({
    emulator: 'mock',
    endpoints: [
      '/identitytoolkit/v1/accounts:signInWithPassword',
      '/identitytoolkit/v1/accounts:lookup',
      '/securetoken/v1/token',
    ],
  }));

  app.use((req, res) => res.status(404).json({
    status: 'error',
    message: `unmocked auth path: ${req.method} ${req.path}`,
  }));

  return app;
}

// ─── Boot ───────────────────────────────────────────────────────────────────
async function main() {
  await initMongo();
  const backend = buildBackendApp();
  const auth    = buildAuthApp();

  backend.listen(PORT_BACKEND, () => {
    log('INFO', `backend listening on http://127.0.0.1:${PORT_BACKEND}`);
  });
  auth.listen(PORT_AUTH, () => {
    log('INFO', `auth emulator listening on http://127.0.0.1:${PORT_AUTH}`);
  });

  process.on('SIGINT',  () => { log('INFO', 'SIGINT — exiting');    process.exit(0); });
  process.on('SIGTERM', () => { log('INFO', 'SIGTERM — exiting');   process.exit(0); });
  process.on('uncaughtException', (e) => log('ERROR', `uncaughtException ${e.message}\n${e.stack}`));
}

main().catch(err => {
  console.error('[mock] FATAL', err);
  process.exit(1);
});
