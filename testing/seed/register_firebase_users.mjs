// =============================================================================
// testing/seed/register_firebase_users.mjs
// -----------------------------------------------------------------------------
// Creates matching Firebase Auth users in the Auth Emulator so /api/login
// succeeds end-to-end against the seeded users (firebaseUID + email must exist
// in both Mongo and Firebase Auth).
//
// Endpoint:
//   POST http://<host>:<port>/identitytoolkit.googleapis.com/v1/accounts:signUp
//   ?key=<any>  { "email": "...", "password": "...", "returnSecureToken": true }
//
// Configured via env:
//   FIREBASE_EMULATOR_HOST   (default: localhost:9099)
//   FIREBASE_API_KEY         (default: arbitrary, emulator doesn't validate)
//
// Usage:
//   node testing/seed/register_firebase_users.mjs
//   node testing/seed/register_firebase_users.mjs           # uses defaults
// =============================================================================

import { connect, close } from './lib/db.mjs';

const EMULATOR_HOST = process.env.FIREBASE_EMULATOR_HOST || 'localhost:9099';
const API_KEY       = process.env.FIREBASE_API_KEY       || 'AIzaSyDUMMY_emulator_only_key';
const PASSWORD      = process.env.LOADTEST_PASSWORD      || 'LoadTest#2025!';

async function signUp(email, password) {
  const url = `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    // 400 with EMAIL_EXISTS is fine — the user is already there.
    if (res.status === 400 && /EMAIL_EXISTS/.test(text)) return { exists: true };
    throw new Error(`signUp ${email} → HTTP ${res.status} ${text}`);
  }
  return res.json();
}

// Mark the freshly-registered emulator user as `emailVerified: true` so the
// AuthController's emailVerified gate at /api/auth/login doesn't try to send
// a real email (NODE_ENV != development → SMTP fails) and reject the login
// with 401. Real Auth Emu users default to `emailVerified: false`.
//
// We re-issue the signup to get an idToken, then immediately POST to
// accounts:update with that idToken to flip the flag. accounts:update keys off
// the bearer idToken so we don't need to look up localId first.
async function signUpAndVerify(email, password) {
  const created = await signUp(email, password);
  if (created && created.exists) return { exists: true };

  const updateUrl = `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=${API_KEY}`;
  const u = await fetch(updateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: created.idToken, emailVerified: true, returnSecureToken: true }),
  });
  if (!u.ok) {
    const text = await u.text();
    throw new Error(`verify ${email} → HTTP ${u.status} ${text}`);
  }
  return { exists: false };
}

async function main() {
  const { client, db } = await connect();
  const users = db.collection('users');

  const cursor = users.find(
    { firebaseUID: { $regex: '^lt-' } },
    { projection: { email: 1, firebaseUID: 1, _id: 0 } },
  );

  let ok = 0, exists = 0, fail = 0;
  console.log(`[fb_register] emulator = ${EMULATOR_HOST}`);
  let processed = 0;
  for await (const u of cursor) {
    try {
      const r = await signUpAndVerify(u.email, PASSWORD);
      if (r && r.exists) exists += 1;
      else ok += 1;
    } catch (err) {
      fail += 1;
      console.error(`[fb_register] ✗ ${u.email}: ${err.message}`);
    }
    processed += 1;
    if (processed % 50 === 0) {
      process.stdout.write(`\r[fb_register]   ${processed} processed (ok=${ok} exists=${exists} fail=${fail})`);
    }
  }
  process.stdout.write('\n');
  console.log(`[fb_register] done: ok=${ok}, existed=${exists}, fail=${fail}`);

  await close(client);
}

main().catch((err) => {
  console.error('[fb_register] fatal:', err);
  process.exit(1);
});
