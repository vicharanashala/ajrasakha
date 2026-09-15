import cron from 'node-cron';
import plivo from 'plivo';
import { getContainer } from '../loadModules.js';
import { PLIVO_TYPES } from '#root/modules/plivo/types.js';
import { STORAGE_TYPES } from '#root/modules/storage/types.js';
import { StorageService } from '#root/modules/storage/services/StorageService.js';
import { appConfig } from '#root/config/app.js';
import type { ICallDetailsRepository, CallRecording } from '#shared/database/interfaces/ICallDetailsRepository.js';

/**
 * Scheduled job to purge Plivo recordings older than 20 days.
 * Ensures recordings are safely preserved in GCP Cloud Storage before deletion from Plivo.
 * Keeps Plivo storage cost at $0.00 while ensuring zero audio loss.
 * Runs daily at 02:00 AM.
 */
cron.schedule('0 2 * * *', async () => {
  console.log('<<CRON>> Starting Plivo 20-day recording cleanup job...');
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
    const storageService = container.get<StorageService>(STORAGE_TYPES.StorageService);

    // 20 days retention threshold
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const recordingsToPurge = await callDetailsRepository.findRecordingsForPlivoCleanup(twentyDaysAgo);

    console.log(`<<CRON>> Found ${recordingsToPurge.length} Plivo recordings older than 20 days eligible for cleanup.`);

    for (const item of recordingsToPurge) {
      const { callUuid, recording } = item;
      const recordingId = recording.recordingId;

      try {
        // 1. Check if recording is already safely stored in GCP
        const isStoredInGcp = Boolean(recording.storagePath && recording.status === 'completed');

        if (!isStoredInGcp) {
          console.log(`<<CRON>> Recording ${recordingId} for call ${callUuid} is missing from GCP. Fetching from Plivo to store before deletion...`);

          let recordUrl = recording.plivoRecordUrl;
          let duration = recording.duration || 0;
          let format = recording.format || 'mp3';

          // Attempt to retrieve latest recording info from Plivo API
          try {
            const plivoRec = await plivoClient.recordings.get(recordingId);
            if (plivoRec?.recordingUrl) {
              recordUrl = plivoRec.recordingUrl;
            }
            if (plivoRec?.recordingDurationMs) {
              duration = Math.round(Number(plivoRec.recordingDurationMs) / 1000);
            } else if ((plivoRec as any)?.recordingDuration) {
              duration = Math.round(Number((plivoRec as any).recordingDuration));
            }
            if (plivoRec?.recordingFormat) {
              format = (plivoRec.recordingFormat.toLowerCase().includes('wav') ? 'wav' : 'mp3') as 'mp3' | 'wav';
            }
          } catch (fetchErr: any) {
            // If recording was already deleted on Plivo (404), mark it locally and continue
            if (fetchErr.status === 404 || fetchErr.message?.includes('404') || fetchErr.message?.includes('not found')) {
              console.log(`<<CRON>> Recording ${recordingId} not found on Plivo (already deleted). Marked locally.`);
              await callDetailsRepository.markPlivoRecordingDeleted(callUuid, recordingId);
              continue;
            }
            console.warn(`<<CRON>> Could not fetch recording details from Plivo API for ${recordingId}:`, fetchErr.message || fetchErr);
          }

          if (!recordUrl) {
            console.error(` <<CRON>> Cannot upload recording ${recordingId} for call ${callUuid}: no URL available. Skipping deletion to prevent loss.`);
            continue;
          }

          // Construct GCP storage destination path
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const prefix = appConfig.storage?.recordingsPathPrefix || 'call-recordings';
          const ext = format === 'wav' ? 'wav' : 'mp3';
          const destinationPath = `${prefix}/${year}/${month}/${callUuid}_${recordingId}.${ext}`;
          const auth = authId && authToken ? { user: authId, pass: authToken } : undefined;

          console.log(`<<CRON>> Streaming recording ${recordingId} to GCP: ${destinationPath}`);
          const uploadResult = await storageService.uploadStreamFromUrl(
            recordUrl,
            destinationPath,
            auth,
            ext === 'wav' ? 'audio/wav' : 'audio/mpeg'
          );

          // Update MongoDB with completed GCP storage metadata
          const updatedRecording: CallRecording = {
            ...recording,
            storagePath: uploadResult.storagePath,
            storageBucket: appConfig.storage.bucket || appConfig.firebase.storageBucket,
            duration,
            format: ext,
            status: 'completed',
            sizeBytes: uploadResult.size,
            plivoRecordUrl: recordUrl,
            plivoDeleted: false,
            plivoDeletedAt: null,
            updatedAt: new Date(),
          };

          await callDetailsRepository.addRecordingToCall(callUuid, updatedRecording);
          console.log(`✅ <<CRON>> Successfully stored recording ${recordingId} for call ${callUuid} in GCP.`);
        }

        // 2. Now that the recording is confirmed stored in GCP, safely delete from Plivo
        console.log(`<<CRON>> Deleting Plivo recording ${recordingId} for call ${callUuid}...`);
        await plivoClient.recordings.delete(recordingId);
        await callDetailsRepository.markPlivoRecordingDeleted(callUuid, recordingId);
        console.log(`✅ <<CRON>> Deleted recording ${recordingId} from Plivo.`);
      } catch (err: any) {
        // If recording was already deleted on Plivo (404), mark it deleted locally
        if (err.status === 404 || err.message?.includes('404') || err.message?.includes('not found')) {
          await callDetailsRepository.markPlivoRecordingDeleted(callUuid, recordingId);
          console.log(`ℹ️ <<CRON>> Recording ${recordingId} not found on Plivo (already deleted). Marked locally.`);
        } else {
          console.error(`❌ <<CRON>> Error processing recording ${recordingId} for call ${callUuid}:`, err.message || err);
          // Do NOT delete from Plivo if GCP upload or verification failed - guarantees zero audio loss
        }
      }
    }
    console.log('✅ <<CRON>> Finished Plivo recording cleanup job.');
  } catch (error: any) {
    console.error('❌ <<CRON>> Error in Plivo recording cleanup job:', error.stack || error);
  }
});
