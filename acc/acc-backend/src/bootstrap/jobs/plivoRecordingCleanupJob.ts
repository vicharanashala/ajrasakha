import cron from 'node-cron';
import plivo from 'plivo';
import { getContainer } from '../loadModules.js';
import { PLIVO_TYPES } from '#root/modules/plivo/types.js';
import type { ICallDetailsRepository } from '#shared/database/interfaces/ICallDetailsRepository.js';

/**
 * Scheduled job to purge Plivo recordings older than 30 days.
 * Keeps Plivo storage cost at $0.00 while recordings are safely preserved in GCS.
 * Runs daily at 02:00 AM.
 */
cron.schedule('0 2 * * *', async () => {
  console.log('⏰ <<CRON>> Starting Plivo 30-day recording cleanup job...');
  try {
    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;

    if (!authId || !authToken) {
      console.warn('⚠️ <<CRON>> Plivo credentials missing, skipping recording cleanup job.');
      return;
    }

    const plivoClient = new plivo.Client(authId, authToken, { timeout: 30000 });
    const container = getContainer();
    const callDetailsRepository = container.get<ICallDetailsRepository>(PLIVO_TYPES.CallDetailsRepository);

    // 30 days threshold
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recordingsToPurge = await callDetailsRepository.findRecordingsForPlivoCleanup(thirtyDaysAgo);

    console.log(`<<CRON>> Found ${recordingsToPurge.length} Plivo recordings older than 30 days to purge.`);

    for (const rec of recordingsToPurge) {
      try {
        console.log(`<<CRON>> Deleting Plivo recording ${rec.recordingId} for call ${rec.callUuid}...`);
        await plivoClient.recordings.delete(rec.recordingId);
        await callDetailsRepository.markPlivoRecordingDeleted(rec.callUuid, rec.recordingId);
        console.log(`✅ <<CRON>> Deleted recording ${rec.recordingId} from Plivo.`);
      } catch (err: any) {
        // If recording was already deleted on Plivo (404), still mark it deleted locally
        if (err.status === 404 || err.message?.includes('404') || err.message?.includes('not found')) {
          await callDetailsRepository.markPlivoRecordingDeleted(rec.callUuid, rec.recordingId);
          console.log(`ℹ️ <<CRON>> Recording ${rec.recordingId} not found on Plivo (already deleted). Marked locally.`);
        } else {
          console.error(`❌ <<CRON>> Failed to delete recording ${rec.recordingId} from Plivo:`, err.message || err);
        }
      }
    }
    console.log('✅ <<CRON>> Finished Plivo recording cleanup job.');
  } catch (error: any) {
    console.error('❌ <<CRON>> Error in Plivo recording cleanup job:', error.stack || error);
  }
});
