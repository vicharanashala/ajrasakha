import { parentPort, workerData } from 'worker_threads';
import 'reflect-metadata';
import { Container } from 'inversify';
import { MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { ObjectId } from 'mongodb';

interface AssignmentJob {
  submissionId: string;
  expertId: string;
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
const { NotificationRepository } = await import('#root/shared/database/providers/mongo/repositories/NotificationRepository.js');
const { NotificationService } = await import('#root/modules/notification/services/NotificationService.js');

const userRepo = new UserRepository(database);
await (userRepo as any).init();

const submissionRepo = new QuestionSubmissionRepository(database);
await (submissionRepo as any).init();

const notificationRepo = new NotificationRepository(database);
await (notificationRepo as any).init();

const notificationService = new NotificationService(notificationRepo, database);

/* ---------------- WORK ---------------- */
(async () => {
  let processed = 0;
  const affectedExpertIds = new Set<string>();
  const targetExperts = new Set(inactiveExpertIds || []);

  for (const job of assignments) {
    try {
      const submission = await (submissionRepo as any).findById(job.submissionId);
      if (!submission) continue;

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

      if (modified) {
        const updatedHistory = [...history];
        
        // If the current ACTIVE expert (in-review) was replaced, update history to point to the new expert
        if (currentExpertIndex === history.length - 1 && history.length > 0) {
            const lastHistory = history[history.length - 1];
            if (lastHistory?.status === 'in-review') {
              updatedHistory[updatedHistory.length - 1] = {
                ...lastHistory,
                updatedBy: new ObjectId(newExpertId),
                updatedAt: now,
              };
            }
        }

        await submissionRepo.updateById(job.submissionId, {
          $set: { queue: newQueue, history: updatedHistory, updatedAt: now },
        });

        affectedExpertIds.add(newExpertId);

        await notificationService.saveTheNotifications(
          'Tasks have been reallocated to your queue',
          'Workload Reassigned',
          submission.questionId.toString(),
          newExpertId,
          'answer_creation'
        );
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
