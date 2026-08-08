import './questionStatus.js';
import './notificationDelete.js'
import './backupDB.js'
import './dailyReport.js'
// import './absentCron.js'//previously commented
import './reAllocateCron.js'
import './timeBoundReAllocateCron.js'
import './moderatorQueueCron.js'
import './agentStatusCleanupJob.js';
import './gateKeeperAuditorQueueCron.js'
import './feedbackAllocationCron.js'
//import './embeddingBackfill.js'//previously commented
export const initJobs = () => {
  console.log('[CRON] Jobs initialized.');
};
