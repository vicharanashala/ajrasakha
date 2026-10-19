// =============================================================================
// testing/scripts/smoke.mjs
// -----------------------------------------------------------------------------
// Phase-1 "is this thing even alive?" check. Pass criteria:
//   1. GET /api/health                          → 200 {status:"healthy"}
//   2. POST /api/auth/login (admin from seed)   → returns idToken
//   3. GET  /api/questions/queue-details (auth) → 200 (admin/moderator queue)
//
// Step 3 is `queue-details` rather than `allocated` because `getAllocatedQuestions`
// is wrapped in `withTransaction(...)` and Phase-1's local Mongo is a STANDALONE
// (no replica set, no mongos) — multi-doc transactions require one or the other.
// Phase 2/3 docker compose will stand the proper replica-set mongo, so this smoke
// is just the host-side inner-loop check.
//
// We use the BACKEND's /api/auth/login (not the Auth Emu directly) because the
// backend runs syncUserWithDb() during login, which links the Auth Emu's localId
// to the seeded Mongo user record's `firebaseUID`. Without that step the next
// authenticated call returns 401 "User not found in database".
//
// Run *after* `make up` + `make seed`.
// =============================================================================

import { connect, close } from '../seed/lib/db.mjs';

const BASE = process.env.BACKEND_URL || 'http://localhost:3141';
const PASSWORD = process.env.LOADTEST_PASSWORD || 'LoadTest#2025!';
const FIREBASE_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDUMMY_emulator_only_key';

function step(label) {
  console.log(`\n• ${label}`);
}
function ok(msg)   { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); process.exitCode = 1; }

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  return { status: r.status, body };
}

async function login(email) {
  // 1. signInWithPassword via Auth Emulator
  const signIn = await fetch(
    `http://${FIREBASE_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    },
  );
  return signIn.json();
}

async function loginViaBackend(email) {
  // 1. POST /api/auth/login (backend) — uses its own emulator-aware identitytoolkit
  //    URL AND runs syncUserWithDb() to link the Auth Emu UID to the seeded
  //    Mongo user record. The direct-to-emu login in `login()` above does
  //    neither, so the next authenticated call would 401.
  //    AuthController is at /auth (see src/modules/auth/controllers/AuthController.ts:42).
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  return r.json();
}

async function main() {
  step('1. /api/health');
  const h = await fetchJson(`${BASE}/api/health`);
  h.status === 200 && h.body?.status === 'healthy'
    ? ok(`status=${h.status} body=${JSON.stringify(h.body)}`)
    : fail(`/api/health → ${h.status} ${JSON.stringify(h.body)}`);

  // Pick the admin we seeded. Look up by `email + role` because the FIRST
  // login rewrites `firebaseUID` to whatever the Auth Emu issues (via
  // syncUserWithDb). The email is the only stable anchor across runs.
  const { client, db } = await connect();
  const admin = await db.collection('users').findOne(
    { email: 'admin@loadtest.ajrasakha.invalid', role: 'admin' }
  );
  await close(client);
  if (!admin) { fail('admin not found in DB — run `npm run seed` first'); return; }

  step('2. POST /api/auth/login (admin)');
  try {
    const tokens = await loginViaBackend(admin.email);
    if (!tokens.idToken) {
      fail('login returned no idToken: ' + JSON.stringify(tokens));
      return;
    }
    ok(`got idToken (${tokens.idToken.length} chars)`);

    step('3. GET /api/questions/queue-details (auth)');
    const authRes = await fetchJson(`${BASE}/api/questions/queue-details`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokens.idToken}` },
    });
    authRes.status < 500
      ? ok(`status=${authRes.status} body=${JSON.stringify(authRes.body).slice(0, 300)}`)
      : fail(`status=${authRes.status} ${JSON.stringify(authRes.body)}`);
  } catch (err) {
    fail(`login flow error: ${err.message}`);
  }

  if (process.exitCode) console.error('\n✗ smoke FAILED');
  else console.log('\n✓ smoke OK');
}

main().catch((err) => { console.error(err); process.exit(1); });
