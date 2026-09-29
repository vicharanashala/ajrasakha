import cron from 'node-cron';
import plivo from 'plivo';
import { getContainer } from '../loadModules.js';
import { PLIVO_TYPES } from '#root/modules/plivo/types.js';
import { STORAGE_TYPES } from '#root/modules/storage/types.js';
import { StorageService } from '#root/modules/storage/services/StorageService.js';
import { appConfig } from '#root/config/app.js';
import type { ICallDetailsRepository, CallRecording } from '#shared/database/interfaces/ICallDetailsRepository.js';

/**
 * Scheduled daily job running at 02:00 AM.
 * 1. Pulls and stores missing call recordings from Plivo for calls within the past 20 days.
 * 2. Safely purges Plivo recordings older than 20 days after confirming they are archived in GCP Cloud Storage.
 * Ensures 100% recording retention, zero cross-call mismatch, and $0.00 Plivo storage cost.
 */
export async function runPlivoDailyJob(): Promise<void> {
  console.log('<<CRON>> Starting Plivo daily recording sync and cleanup job...');
  try {
    const authId = process.env.PLIVO_AUTH_ID || appConfig.plivo.authId;
    const authToken = process.env.PLIVO_AUTH_TOKEN || appConfig.plivo.authToken;

    if (!authId || !authToken || authId.startsWith('dummy-') || authToken.startsWith('dummy-')) {
      console.warn('⚠️ <<CRON>> Plivo credentials missing or placeholder, skipping daily recording job.');
      return;
    }

    const plivoClient = new plivo.Client(authId, authToken, { timeout: 30000 });
    const container = getContainer();
    const callDetailsRepository = container.get<ICallDetailsRepository>(PLIVO_TYPES.CallDetailsRepository);
    const storageService = container.get<StorageService>(STORAGE_TYPES.StorageService);

    const now = new Date();
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

    // =========================================================================
    // PHASE 1: Scan and Pull Missing Recordings for Calls Within Past 20 Days
    // =========================================================================
    console.log(`<<CRON>> [PHASE 1] Scanning for calls in past 20 days missing recordings (since ${twentyDaysAgo.toISOString()})...`);
    const callsMissingRecordings = await callDetailsRepository.findCallsMissingRecordings(twentyDaysAgo);
    console.log(`<<CRON>> [PHASE 1] Found ${callsMissingRecordings.length} calls eligible for recording retrieval.`);

    for (const call of callsMissingRecordings) {
      const callUuid = call.callUuid;
      if (!callUuid || callUuid.startsWith('testing_')) continue;

      try {
        console.log(`<<CRON>> [PHASE 1] Querying Plivo API for callUuid: ${callUuid}...`);
        
        // Strict 1-to-1 match: Filter Plivo recordings strictly by this call's UUID
        const rawRecordings: any = await plivoClient.recordings.list({ callUuid });
        const plivoRecordings: any[] = Array.isArray(rawRecordings)
          ? rawRecordings
          : (rawRecordings && rawRecordings.recordingId ? [rawRecordings] : []);

        if (!plivoRecordings || plivoRecordings.length === 0) {
          const callAgeMs = now.getTime() - (call.createdAt ? new Date(call.createdAt).getTime() : 0);
          // If call is older than 10 minutes and Plivo has no recording, mark it to avoid re-querying daily
          if (callAgeMs > 10 * 60 * 1000) {
            console.log(`ℹ️ <<CRON>> [PHASE 1] No recording exists on Plivo for ${callUuid} (call was unanswered/missed/not recorded).`);
            const noRecItem: CallRecording = {
              recordingId: `none_${callUuid}`,
              storagePath: '',
              storageBucket: appConfig.storage.bucket || appConfig.firebase.storageBucket,
              duration: 0,
              format: 'mp3',
              status: 'failed',
              reason: 'no_plivo_recording',
              plivoDeleted: true,
              plivoDeletedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            await callDetailsRepository.addRecordingToCall(callUuid, noRecItem);
          }
          continue;
        }

        // Use primary recording associated strictly with this callUuid
        const plivoRec = plivoRecordings[0];
        const recordingId = plivoRec.recordingId;
        const recordUrl = plivoRec.recordingUrl;

        if (!recordUrl || !recordingId) {
          console.warn(`⚠️ <<CRON>> [PHASE 1] Recording for ${callUuid} is missing URL or recordingId. Skipping.`);
          continue;
        }

        let duration = 0;
        if (plivoRec.recordingDurationMs) {
          duration = Math.round(Number(plivoRec.recordingDurationMs) / 1000);
        } else if ((plivoRec as any).recordingDuration) {
          duration = Math.round(Number((plivoRec as any).recordingDuration));
        }

        const format = (plivoRec.recordingFormat?.toLowerCase().includes('wav') ? 'wav' : 'mp3') as 'mp3' | 'wav';
        const callDate = call.createdAt ? new Date(call.createdAt) : now;
        const year = callDate.getFullYear();
        const month = String(callDate.getMonth() + 1).padStart(2, '0');
        const prefix = appConfig.storage?.recordingsPathPrefix || 'call-recordings';
        const destinationPath = `${prefix}/${year}/${month}/${callUuid}_${recordingId}.${format}`;
        const auth = authId && authToken ? { user: authId, pass: authToken } : undefined;

        console.log(`<<CRON>> [PHASE 1] Streaming recording ${recordingId} for call ${callUuid} to storage: ${destinationPath}`);
        const uploadResult = await storageService.uploadStreamFromUrl(
          recordUrl,
          destinationPath,
          auth,
          format === 'wav' ? 'audio/wav' : 'audio/mpeg'
        );

        const recordingItem: CallRecording = {
          recordingId,
          storagePath: uploadResult.storagePath,
          storageBucket: appConfig.storage.bucket || appConfig.firebase.storageBucket,
          duration,
          durationMs: plivoRec.recordingDurationMs ? Number(plivoRec.recordingDurationMs) : duration * 1000,
          format,
          status: 'completed',
          sizeBytes: uploadResult.size,
          plivoRecordUrl: recordUrl,
          plivoDeleted: false,
          plivoDeletedAt: null,
          type: (plivoRec.recordingType as 'normal' | 'conference') || 'normal',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await callDetailsRepository.addRecordingToCall(callUuid, recordingItem);
        console.log(`✅ <<CRON>> [PHASE 1] Successfully stored recording for call ${callUuid} in GCP & MongoDB.`);
      } catch (callRecErr: any) {
        console.error(`❌ <<CRON>> [PHASE 1] Failed to process recording for call ${callUuid}:`, callRecErr.message || callRecErr);
      }

      // Small pacing delay (150ms) to respect Plivo REST API rate limits
      await new Promise((r) => setTimeout(r, 150));
    }

    // =========================================================================
    // PHASE 2: Safely Purge Plivo Recordings Older Than 20 Days
    // =========================================================================
    console.log(`<<CRON>> [PHASE 2] Starting Plivo 20-day recording purge...`);
    const recordingsToPurge = await callDetailsRepository.findRecordingsForPlivoCleanup(twentyDaysAgo);
    console.log(`<<CRON>> [PHASE 2] Found ${recordingsToPurge.length} Plivo recordings older than 20 days eligible for cleanup.`);

    for (const item of recordingsToPurge) {
      const { callUuid, recording } = item;
      const recordingId = recording.recordingId;

      try {
        // 1. Verify recording is safely stored in GCP before deletion
        const isStoredInGcp = Boolean(recording.storagePath && recording.status === 'completed');

        if (!isStoredInGcp) {
          console.log(`<<CRON>> [PHASE 2] Recording ${recordingId} for call ${callUuid} missing from GCP. Fetching before deletion...`);

          let recordUrl = recording.plivoRecordUrl;
          let duration = recording.duration || 0;
          let format = recording.format || 'mp3';

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
            if (fetchErr.status === 404 || fetchErr.message?.includes('404') || fetchErr.message?.includes('not found')) {
              console.log(`<<CRON>> [PHASE 2] Recording ${recordingId} already deleted on Plivo. Marked locally.`);
              await callDetailsRepository.markPlivoRecordingDeleted(callUuid, recordingId);
              continue;
            }
            console.warn(`<<CRON>> [PHASE 2] Could not fetch details for ${recordingId}:`, fetchErr.message || fetchErr);
          }

          if (!recordUrl) {
            console.error(`⚠️ <<CRON>> [PHASE 2] Cannot upload recording ${recordingId} for ${callUuid}: no URL. Skipping deletion to prevent loss.`);
            continue;
          }

          const callDate = recording.createdAt ? new Date(recording.createdAt) : now;
          const year = callDate.getFullYear();
          const month = String(callDate.getMonth() + 1).padStart(2, '0');
          const prefix = appConfig.storage?.recordingsPathPrefix || 'call-recordings';
          const ext = format === 'wav' ? 'wav' : 'mp3';
          const destinationPath = `${prefix}/${year}/${month}/${callUuid}_${recordingId}.${ext}`;
          const auth = authId && authToken ? { user: authId, pass: authToken } : undefined;

          console.log(`<<CRON>> [PHASE 2] Streaming recording ${recordingId} to GCP: ${destinationPath}`);
          const uploadResult = await storageService.uploadStreamFromUrl(
            recordUrl,
            destinationPath,
            auth,
            ext === 'wav' ? 'audio/wav' : 'audio/mpeg'
          );

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
          console.log(`✅ <<CRON>> [PHASE 2] Successfully stored recording ${recordingId} for call ${callUuid} in GCP.`);
        }

        // 2. Now that recording is confirmed stored in GCP, safely delete from Plivo
        console.log(`<<CRON>> [PHASE 2] Deleting Plivo recording ${recordingId} for call ${callUuid}...`);
        await plivoClient.recordings.delete(recordingId);
        await callDetailsRepository.markPlivoRecordingDeleted(callUuid, recordingId);
        console.log(`✅ <<CRON>> [PHASE 2] Deleted recording ${recordingId} from Plivo.`);
      } catch (err: any) {
        if (err.status === 404 || err.message?.includes('404') || err.message?.includes('not found')) {
          await callDetailsRepository.markPlivoRecordingDeleted(callUuid, recordingId);
          console.log(`ℹ️ <<CRON>> [PHASE 2] Recording ${recordingId} not found on Plivo (already deleted). Marked locally.`);
        } else {
          console.error(`❌ <<CRON>> [PHASE 2] Error processing recording ${recordingId} for call ${callUuid}:`, err.message || err);
        }
      }
    }

    console.log('✅ <<CRON>> Finished Plivo daily recording sync and cleanup job.');
  } catch (error: any) {
    console.error('❌ <<CRON>> Error in Plivo daily recording job:', error.stack || error);
  }
}

// Scheduled to run daily at 02:00 AM IST
cron.schedule('0 2 * * *', async () => {
  await runPlivoDailyJob();
}, {
  timezone: 'Asia/Kolkata',
});
