/**
 * Cloud Run Job entrypoint for the gate-keeper / auditor queue assignment.
 *
 * Triggered by Cloud Scheduler every 1 minute (Asia/Kolkata).
 * Single-allocation: one question per gate keeper / auditor at a time.
 *
 * Replaces the in-process node-cron in bootstrap/jobs/gateKeeperAuditorQueueCron.ts.
 */
import { getContainer, loadAppModules } from '../../bootstrap/loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';
import { dbConfig } from '../../config/db.js';

async function main(): Promise<void> {
  // [DIAG] Verbose env var diagnostics BEFORE any module loads
  console.log('========== [DIAG] ENV VAR CHECK ==========');
  console.log(`[DIAG] process.env.DB_URL = ${JSON.stringify(process.env.DB_URL)}`);
  console.log(`[DIAG] process.env.DB_URL type = ${typeof process.env.DB_URL}`);
  console.log(`[DIAG] process.env.DB_URL length = ${process.env.DB_URL?.length ?? 'undefined'}`);
  console.log(`[DIAG] process.env.DB_NAME = ${JSON.stringify(process.env.DB_NAME)}`);
  console.log(`[DIAG] process.env.APP_PORT = ${JSON.stringify(process.env.APP_PORT)}`);
  console.log(`[DIAG] process.env.NODE_ENV = ${JSON.stringify(process.env.NODE_ENV)}`);
  console.log(`[DIAG] All DB_* env vars = ${JSON.stringify(Object.keys(process.env).filter(k => k.startsWith('DB_')))}`);
  console.log(`[DIAG] dbConfig.url = ${JSON.stringify(dbConfig.url)}`);
  console.log(`[DIAG] dbConfig.dbName = ${JSON.stringify(dbConfig.dbName)}`);
  console.log('===========================================');

  // [DIAG] Diagnostic logs to verify new code is running
  console.log('[gk-auditor-job] before loadAppModules');
  await loadAppModules('all');
  console.log('[gk-auditor-job] after loadAppModules - container initialized');

  const container = getContainer();
  const questionService = container.get<QuestionService>(
    CORE_TYPES.QuestionService,
  );
  const result = await questionService.runGateKeeperAuditorQueueCron();
  console.log(
    `[gk-auditor-job] done: gateKeeperAssigned=${result.gateKeeperAssigned}, auditorAssigned=${result.auditorAssigned}`,
  );
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[gk-auditor-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });