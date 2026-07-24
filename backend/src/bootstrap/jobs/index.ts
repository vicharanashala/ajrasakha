import './questionStatus.js';
import './notificationDelete.js'
import './backupDB.js'
import './dailyReport.js'
// import './absentCron.js'
import './reAllocateCron.js'
import './timeBoundReAllocateCron.js'
import './moderatorQueueCron.js'
import './gateKeeperAuditorQueueCron.js'
import './agentStatusCleanupJob.js';
import './agentStatusCleanupJob.js';
import './gateKeeperAuditorQueueCron.js'
//import './embeddingBackfill.js'
export const initJobs = () => {
  console.log('[CRON] Jobs initialized.');
};