import { parentPort, workerData } from 'worker_threads';
import 'reflect-metadata';
import { Container } from 'inversify';
import { MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { ObjectId } from 'mongodb';
import { AuditAction, AuditCategory, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';

interface AssignmentJob {
  submissionId: string;
  expertId: string;
  appendExpert?: boolean;
  /** When true the previous expert is NOT reputation-penalised — only freed from the
   *  question (queue replacement still decrements their workload). */
  skipPenalty?: boolean;
}

interface WorkerData {
  assignments: AssignmentJob[];
  mongoUri: string;
  dbName: string;
  inactiveExpertIds: string[]; // Added this
}

const { assignments, mongoUri, dbName, inactiveExpertIds } = workerData as WorkerData;

if (!parentPort) process.exit(1);

/* ---------------- IOC ---------------- */
const container = new Container({ defaultScope: 'Singleton' });

container.bind<string>(GLOBAL_TYPES.uri).toConstantValue(mongoUri);
container.bind<string>(GLOBAL_TYPES.dbName).toConstantValue(dbName);
container.bind<MongoDatabase>(GLOBAL_TYPES.Database).to(MongoDatabase).inSingletonScope();

const database = container.get<MongoDatabase>(GLOBAL_TYPES.Database);
await database.init();

/* ---------------- REPOS ---------------- */
const { UserRepository } = await import('#root/shared/database/providers/mongo/repositories/UserRepository.js');
const { QuestionSubmissionRepository } = await import('#root/shared/database/providers/mongo/repositories/SubmissionRepository.js');
const { QuestionRepository } = await import('#root/shared/database/providers/mongo/repositories/QuestionRepository.js');
const { NotificationRepository } = await import('#root/shared/database/providers/mongo/repositories/NotificationRepository.js');
const { NotificationService } = await import('#root/modules/notification/services/NotificationService.js');

const userRepo = new UserRepository(database);
await (userRepo as any).init();

const submissionRepo = new QuestionSubmissionRepository(database);
await (submissionRepo as any).init();

const questionRepo = new QuestionRepository(database);
await (questionRepo as any).init();

const notificationRepo = new NotificationRepository(database);
await (notificationRepo as any).init();

const notificationService = new NotificationService(notificationRepo, database);

const { AuditTrailsRepository } = await import('#root/modules/auditTrails/repositories/provider/mongodb/AuditTrailRepository.js');
const auditRepo = new AuditTrailsRepository(database);
const { AuditTrailsService } = await import('#root/modules/auditTrails/services/AuditTrailsService.js');
const auditService = new AuditTrailsService(auditRepo as any, database);

async function getExpertDisplayName(expertId?: string | null): Promise<string> {
  if (!expertId) return 'Unknown';
  try {
    const user = await userRepo.findById(expertId);
    if (!user) return 'Unknown';
    const first = (user as any).firstName?.toString().trim() || '';
    const last = (user as any).lastName?.toString().trim() || '';
    const full = `${first} ${last}`.trim();
    return full || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

/* ---------------- WORK ---------------- */
(async () => {
  let processed = 0;
  const affectedExpertIds = new Set<string>();
  const targetExperts = new Set(inactiveExpertIds || []);

  for (const job of assignments) {
    try {
      const submission = await (submissionRepo as any).findById(job.submissionId);
      if (!submission) continue;

      const questionId = submission.questionId.toString();
      const question = await (questionRepo as any).getById(questionId);

      const queue = submission.queue || [];
      const history = submission.history || [];
      const now = new Date();
      const newExpertId = job.expertId;

      // Identify who is CURRENTLY working
      // If history ends in 'in-review', the stuck person is at index (history.length - 1)
      // Otherwise, the next person to work is at index history.length
      let currentExpertIndex;
      if (history.length > 0 && history[history.length - 1].status === 'in-review') {
        currentExpertIndex = history.length - 1;
      } else {
        currentExpertIndex = history.length;
      }

      const currentExpertId = queue[currentExpertIndex]?.toString();

      // Unhold question if it is on hold
      if (question && question.isOnHold) {
        const prevAccum = question.accumulatedHoldMs ?? 0;
        let segmentMs = 0;
        if (question.holdAt) {
          segmentMs = Math.max(0, Date.now() - new Date(question.holdAt).getTime());
        }
        await (questionRepo as any).updateQuestion(questionId, {
          isOnHold: false,
          status: 'open',
          accumulatedHoldMs: prevAccum + segmentMs,
          holdAt: null,
        });
      }



      // Deep Replacement (Purge Inactive): replace inactive experts in the queue
      // ENSURE UNIQUENESS: Only replace the FIRST occurrence encountered at or after currentExpertIndex
      let modified = false;
      let replacementUsed = false;
      const newQueue = queue.map((q, idx) => {
        const qStr = q.toString();

        // Check if this expert is in the target list (inactive/blocked)
        if (targetExperts.has(qStr)) {
          // Only replace if it's the current/future turn and we haven't used our replacement expert yet
          if (idx >= currentExpertIndex && !replacementUsed) {
            modified = true;
            replacementUsed = true; // Prevents duplication
            affectedExpertIds.add(qStr);
            return new ObjectId(newExpertId);
          }
        }
        return q;
      });

      // Special Case: Default reallocation (not type=inactive)
      // If the current expert is active but being replaced due to delay
      if (!modified && currentExpertId) {
        newQueue[currentExpertIndex] = new ObjectId(newExpertId);
        affectedExpertIds.add(currentExpertId);
        modified = true;
      }

      /* 
      // 🔵 ORIGINAL LOGIC FROM MAIN (Commented out in favor of Shift-Aware Deep Replacement)
      // REASONS FOR REPLACEMENT:
      // 1. Multiple Replacements: Main logic only replaces the single stuck expert. 
      //    New logic can replace multiple inactive/blocked experts in the queue at once.
      // 2. Shift Awareness: Main uses findIndex(), which is less precise. 
      //    New logic uses currentExpertIndex to ensure the correct sequence position is reallocated.
      // 3. Absorbed Features: Reputation penalization and Unhold logic from main 
      //    have been fully integrated into the active Shift-Aware block below.
      else {
        const lastHistory = history[history.length - 1];
        if (lastHistory?.status === 'in-review' || lastHistory?.status === 'reviewed') {
          const stuckExpertId = lastHistory.updatedBy?.toString();
          const stuckIndex = queue.findIndex(q => q.toString() === stuckExpertId);
          
          let tempQueue = [...queue];
          if (stuckIndex > -1) {
            tempQueue[stuckIndex] = new ObjectId(newExpertId);
          } else {
            tempQueue.push(new ObjectId(newExpertId));
          }

          const tempHistory = [...history];
          tempHistory[tempHistory.length - 1] = {
            ...lastHistory,
            updatedBy: new ObjectId(newExpertId),
            status: 'in-review',
            createdAt: now,
            updatedAt: now,
          };
          // ... (main branch update logic)
        }
      }
      */

      // No current expert to replace (queue fully consumed and the tail isn't
      // in-review, so currentExpertIndex points past the end of the queue). There's no
      // slot to swap, so fall back to appending the new expert — otherwise this job
      // would silently no-op while the main process has already spent the expert's slot.
      const appendNewExpert = job.appendExpert || (!modified && !currentExpertId);

      if (appendNewExpert) {
        // ── PUSH MODE (time-bound reallocation) ──────────────────────────────
        // Append the new expert instead of replacing the stuck one so the full
        // allocation history is preserved.

        // Penalize the stuck expert — skipped for no-penalty (opened-but-idle) jobs.
        if (!job.skipPenalty) {
          if (history.length === 0) {
            // No history yet — penalize queue[0] who was allocated but never answered
            const firstExpert = queue[0]?.toString();
            if (firstExpert) {
              await userRepo.updateReputationScore(firstExpert, false);
              affectedExpertIds.add(firstExpert);
            }
          } else {
            const lastHistory = history[history.length - 1];
            if (lastHistory?.status === 'in-review') {
              const stuckExpertId = lastHistory.updatedBy?.toString();
              if (stuckExpertId) {
                await userRepo.updateReputationScore(stuckExpertId, false);
                affectedExpertIds.add(stuckExpertId);
              }
            }
          }
        }

        // Push new expert into queue and add a fresh in-review history entry
        const pushQueue = [...queue, new ObjectId(newExpertId)];
        const pushHistory = [
          ...history,
          {
            updatedBy: new ObjectId(newExpertId),
            status: 'in-review',
            createdAt: now,
            updatedAt: now,
          },
        ];

        await submissionRepo.updateById(job.submissionId, {
          $set: {
            queue: pushQueue,
            history: pushHistory,
            updatedAt: now,
            reviewDelayNotificationSent: false,
            currentExpertAllocatedAt: now,
            currentExpertOpenedAt: null,
          },
        });

        affectedExpertIds.add(newExpertId);
        // Best-effort notifications: failures must not fail a reallocation whose
        // queue/history writes have already been persisted above.
        try {
          await notificationService.saveTheNotifications(
            'You have been replaced from the Allocated question. The question has been reassigned to another expert.',
            'Allocation Removed',
            submission.questionId.toString(),
            currentExpertId,
            'allocation_removal',
          );
          await notificationService.saveTheNotifications(
            'A time-bound question has been reassigned to you',
            'Question Reassigned',
            submission.questionId.toString(),
            newExpertId,
            'answer_creation',
          );
        } catch (notifyErr: any) {
          console.error(`⚠️ [Worker] Reallocated submission ${job.submissionId} but notification failed:`, notifyErr?.message);
        }
      } else if (modified) {
        // ── REPLACE MODE (default workload balancing) ─────────────────────────
        const updatedHistory = [...history];

        // 1. If the expert currently in-review was replaced, update the history entry to the new expert
        if (currentExpertIndex === history.length - 1 && history.length > 0) {
          const lastHistory = history[history.length - 1];
          if (lastHistory?.status === 'in-review') {
            updatedHistory[updatedHistory.length - 1] = {
              ...lastHistory,
              updatedBy: new ObjectId(newExpertId),
              createdAt: now,
              updatedAt: now,
            };
          }
        }

        // 2. Penalize the expert who was stuck — unless this is a no-penalty
        //    reallocation (opened-but-idle), where we only free them from the question.
        if (!job.skipPenalty) {
          if (history.length > 0) {
            // Reviewer case: penalize only 'in-review' experts — 'reviewed' experts already completed their work
            const lastHistory = history[history.length - 1];
            if (lastHistory?.status === 'in-review') {
              const stuckExpertId = lastHistory.updatedBy?.toString();
              if (stuckExpertId) await userRepo.updateReputationScore(stuckExpertId, false);
            }
          } else {
            // Author case: penalize author who never answered
            if (currentExpertId) await userRepo.updateReputationScore(currentExpertId, false);
          }
        }

        // 3. Save updates to Submission
        // Reset time-bound tracking: start the 45-min clock for the new expert
        await submissionRepo.updateById(job.submissionId, {
          $set: {
            queue: newQueue,
            history: updatedHistory,
            updatedAt: now,
            reviewDelayNotificationSent: false,
            currentExpertAllocatedAt: now,
            currentExpertOpenedAt: null,
          },
        });

        // 4. Notify new expert (role-aware notification for time-bound questions)
        const isAuthorPosition = currentExpertIndex === 0 && history.length === 0;
        affectedExpertIds.add(newExpertId);
        // Best-effort notifications: failures must not fail a reallocation whose
        // queue/history writes have already been persisted above.
        try {
          await notificationService.saveTheNotifications(
            isAuthorPosition
              ? 'A time-bound question has been assigned to you for answering'
              : 'A time-bound question has been reassigned to you for review',
            isAuthorPosition ? 'Answer Creation Assigned' : 'Review Reassigned',
            submission.questionId.toString(),
            newExpertId,
            isAuthorPosition ? 'answer_creation' : 'peer_review',
          );

          // 4.1 Notify the old expert that they have been removed from the allocation.
          if (currentExpertId) {
            await notificationService.saveTheNotifications(
              'You have been replaced from the Allocated question. The question has been reassigned to another expert.',
              'Allocation Removed',
              submission.questionId.toString(),
              currentExpertId,
              'allocation_removal',
            );
          }
        } catch (notifyErr: any) {
          console.error(`⚠️ [Worker] Reallocated submission ${job.submissionId} but notification failed:`, notifyErr?.message);
        }

        // 4.2 Audit trail — replaces the moderator/admin broadcast. Records that this
        // question was reallocated from one expert to another, and how long it sat with
        // the previous expert. (Both experts are still notified above at steps 4 / 4.1.)
        try {
          const [oldExpertName, newExpertName] = await Promise.all([
            getExpertDisplayName(currentExpertId),
            getExpertDisplayName(newExpertId),
          ]);
          const rawQuestionText = (question as any)?.question?.toString().trim() || '';
          const truncatedQuestion = rawQuestionText.length > 120
            ? `${rawQuestionText.slice(0, 120)}...`
            : rawQuestionText;
          // "Waited" = how long it sat with the previous expert before being moved.
          const allocatedAt = submission.currentExpertAllocatedAt
            ? new Date(submission.currentExpertAllocatedAt)
            : null;
          const waitedMs = allocatedAt ? Math.max(0, now.getTime() - allocatedAt.getTime()) : null;
          const waitedMinutes = waitedMs != null ? Math.round(waitedMs / 60000) : null;

          await auditService.createAuditTrail({
            category: AuditCategory.QUESTION,
            action: AuditAction.REALLOCATE_QUESTIONS,
            actor: { name: 'System (auto-reallocation)', role: 'system', source: 'time-bound-reallocation' },
            context: {
              questionId: submission.questionId.toString(),
              questionText: truncatedQuestion,
              waitedMs,
              waitedMinutes,
            },
            changes: {
              before: { expertId: currentExpertId, expertName: oldExpertName },
              after: { expertId: newExpertId, expertName: newExpertName },
            },
            outcome: { status: OutComeStatus.SUCCESS },
            createdAt: now,
          });
          console.log(`🧾 [Worker] Audit: question reallocated ${oldExpertName} → ${newExpertName} (waited ${waitedMinutes ?? '?'} min)`);
        } catch (auditErr: any) {
          console.error(`⚠️ [Worker] Failed to write reallocation audit trail for submission ${job.submissionId}:`, auditErr?.message);
        }
      }

      processed++;
      parentPort?.postMessage({ processed: 1 });
    } catch (err: any) {
      console.error(`❌ Failed for submission ${job.submissionId}`, err?.message);
    }
  }

  // --- FINAL RESYNC ---
  console.log(`🔄 Worker: Resyncing workload counters for ${affectedExpertIds.size} experts...`);
  for (const id of affectedExpertIds) {
    try {
      await userRepo.recalculateReputationScore(id);
    } catch (err) {
      console.error(`❌ Failed to resync expert ${id}`);
    }
  }

  parentPort?.postMessage({ success: true, processed });
  process.exit(0);
})();
