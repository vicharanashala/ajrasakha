// =============================================================================
// testing/seed/seed_users.mjs
// -----------------------------------------------------------------------------
// Seeds the `users` collection with:
//   • 200 experts / pae_experts
//   • 50 moderators / 20 auditors / 20 gate_keepers
//   • 1 admin
// Schema sources: backend/src/modules/auth/classes/transformers/User.ts
// =============================================================================

import { connect, close } from './lib/db.mjs';
import {
  STATES,
  CROPS,
  ROLES,
  rng,
  pick,
} from './lib/fixtures.mjs';
import { faker } from '@faker-js/faker';

const COUNTS = {
  EXPERT: Number(process.env.EXPERTS) || 200,
  PAE_EXPERT: Number(process.env.PAE_EXPERTS) || 0,
  MODERATOR: Number(process.env.MODERATORS) || 50,
  GATE_KEEPER: Number(process.env.GATE_KEEPERS) || 20,
  AUDITOR: Number(process.env.AUDITORS) || 20,
  ADMIN: 1,
};

function buildExpert(rand, idx) {
  const state = pick(rand, STATES);
  const crop = pick(rand, CROPS);
  const now = new Date();
  return {
    firebaseUID: `lt-expert-${String(idx).padStart(5, '0')}`,
    email: `expert.${String(idx).padStart(5, '0')}@loadtest.ajrasakha.invalid`,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    role: ROLES.EXPERT,
    status: 'active',
    isBlocked: false,
    isVerified: true,
    reputation_score: Math.floor(rand() * 50), // 0..49
    preference: { crop, state, district: 'all', domain: 'all' },
    mobile: faker.phone.number({ style: 'national' }),
    notificationRetention: '30',
    isCallAgentActive: false,
    agent: 'not_available',
    isBusy: false,
    currentCallUuid: null,
    isTrainingUser: false,
    Call_centre_manager: false,
    createdAt: now,
    updatedAt: now,
  };
}

function buildPaeExpert(rand, idx) {
  const u = buildExpert(rand, idx);
  u.role = ROLES.PAE_EXPERT;
  u.firebaseUID = `lt-pae-${String(idx).padStart(5, '0')}`;
  u.email = `pae.${String(idx).padStart(5, '0')}@loadtest.ajrasakha.invalid`;
  return u;
}

function buildModerator(rand, idx) {
  const now = new Date();
  return {
    firebaseUID: `lt-mod-${String(idx).padStart(5, '0')}`,
    email: `mod.${String(idx).padStart(5, '0')}@loadtest.ajrasakha.invalid`,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    role: ROLES.MODERATOR,
    status: 'active',
    isBlocked: false,
    isVerified: true,
    reputation_score: 0,
    preference: { crop: 'all', state: 'all', district: '', domain: 'all' },
    mobile: faker.phone.number({ style: 'national' }),
    notificationRetention: '30',
    isCallAgentActive: false,
    agent: 'not_available',
    isBusy: false,
    currentCallUuid: null,
    isTrainingUser: false,
    Call_centre_manager: false,
    feedbacksAssigned: null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildGateKeeper(rand, idx) {
  const u = buildModerator(rand, idx);
  u.role = ROLES.GATE_KEEPER;
  u.firebaseUID = `lt-gk-${String(idx).padStart(5, '0')}`;
  u.email = `gk.${String(idx).padStart(5, '0')}@loadtest.ajrasakha.invalid`;
  return u;
}

function buildAuditor(rand, idx) {
  const u = buildModerator(rand, idx);
  u.role = ROLES.AUDITOR;
  u.firebaseUID = `lt-aud-${String(idx).padStart(5, '0')}`;
  u.email = `aud.${String(idx).padStart(5, '0')}@loadtest.ajrasakha.invalid`;
  return u;
}

function buildAdmin() {
  const now = new Date();
  return {
    firebaseUID: 'lt-admin-00001',
    email: 'admin@loadtest.ajrasakha.invalid',
    firstName: 'LoadTest', lastName: 'Admin',
    role: ROLES.ADMIN, status: 'active', isBlocked: false, isVerified: true,
    reputation_score: 0,
    preference: { crop: 'all', state: 'all', district: '', domain: 'all' },
    mobile: '0000000000', notificationRetention: '30',
    isCallAgentActive: false, agent: 'not_available', isBusy: false,
    createdAt: now, updatedAt: now,
  };
}

async function main() {
  const rand = rng(1337);
  const { client, db } = await connect();
  const users = db.collection('users');

  console.log(`[seed_users] connecting → ${process.env.DB_URL} db=${process.env.DB_NAME}`);

  const wipeResult = await users.deleteMany({ firebaseUID: { $regex: '^lt-' } });
  console.log(`[seed_users] wiped ${wipeResult.deletedCount} prior loadtest users`);

  const docs = [];
  for (let i = 0; i < COUNTS.EXPERT; i++) docs.push(buildExpert(rand, i));
  for (let i = 0; i < COUNTS.PAE_EXPERT; i++) docs.push(buildPaeExpert(rand, i));
  for (let i = 0; i < COUNTS.MODERATOR; i++) docs.push(buildModerator(rand, i));
  for (let i = 0; i < COUNTS.GATE_KEEPER; i++) docs.push(buildGateKeeper(rand, i));
  for (let i = 0; i < COUNTS.AUDITOR; i++) docs.push(buildAuditor(rand, i));
  docs.push(buildAdmin());

  console.log(`[seed_users] inserting ${docs.length} users (1k batches)…`);
  const BATCH = 1000;
  for (let i = 0; i < docs.length; i += BATCH) {
    await users.insertMany(docs.slice(i, i + BATCH), { ordered: false });
    process.stdout.write(`\r[seed_users]   ${Math.min(i + BATCH, docs.length)}/${docs.length}`);
  }
  process.stdout.write('\n');

  const grouped = await users
    .aggregate([{ $match: { firebaseUID: { $regex: '^lt-' } } }, { $group: { _id: '$role', n: { $sum: 1 } } }])
    .toArray();
  console.log('[seed_users] by role:');
  for (const g of grouped) console.log(`  ${g._id.padEnd(14)} ${g.n}`);

  await close(client);
  console.log('[seed_users] done');
}

main().catch(async (err) => {
  console.error('[seed_users] failed:', err);
  process.exit(1);
});
