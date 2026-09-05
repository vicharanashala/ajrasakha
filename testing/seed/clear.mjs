// =============================================================================
// testing/seed/clear.mjs
// -----------------------------------------------------------------------------
// Drops every loadtest-tagged document so a run starts from a clean slate.
//
// Targets:
//   • users                       where firebaseUID matches /^lt-/
//   • questions, question_submissions where created/updated in this DB within
//     the last hour (i.e. seeded by the loadtest — keeps prod docs intact)
//   • reroutes                    similarly bounded
//
// Safer than a full DB.dropDatabase() and survives a partial-seed crash.
// =============================================================================

import { connect, close } from './lib/db.mjs';

async function main() {
  const { client, db } = await connect();
  console.log(`[clear] db=${process.env.DB_NAME} on ${process.env.DB_URL}`);

  const u = await db.collection('users').deleteMany({ firebaseUID: { $regex: '^lt-' } });
  const q = await db.collection('questions').deleteMany({ source: { $exists: true } });
  const sids = (await db.collection('questions').find({ source: { $exists: true } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id);
  const s = await db.collection('question_submissions').deleteMany({ questionId: { $in: sids } });
  const r = await db.collection('reroutes').deleteMany({});

  console.log(`[clear] users -${u.deletedCount}`);
  console.log(`[clear] questions -${q.deletedCount}`);
  console.log(`[clear] question_submissions -${s.deletedCount}`);
  console.log(`[clear] reroutes -${r.deletedCount}`);

  await close(client);
  console.log('[clear] done');
}

main().catch((err) => {
  console.error('[clear] fatal:', err);
  process.exit(1);
});
