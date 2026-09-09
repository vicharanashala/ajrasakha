// =============================================================================
// testing/seed/ensure_indexes.mjs
// -----------------------------------------------------------------------------
// Creates the indexes required for the load test on the active DB.
//
// Run from the testing/ directory:
//   DB_URL=… DB_NAME=agriai_loadtest node seed/ensure_indexes.mjs
//
// The same set is also declared in docker/mongo-init/01-loadtest-indexes.js
// (which only fires on a brand-new Mongo container).
// =============================================================================

import { connect, close, ensureIndexes } from './lib/db.mjs';

async function main() {
  const { client, db } = await connect();
  console.log('[indexes] creating indexes on', process.env.DB_NAME);
  await ensureIndexes(db);
  console.log('[indexes] done');
  await close(client);
}

main().catch((err) => { console.error(err); process.exit(1); });