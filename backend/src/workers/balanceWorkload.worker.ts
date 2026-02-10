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
}

const { assignments, mongoUri, dbName } = workerData as WorkerData;

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
const { NotificationService } = await import('#root/modules/core/services/NotificationService.js');

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

  for (const job of assignments) {
    try {
      
      const submission = await (submissionRepo as any).findById(job.submissionId);
      if (!submission) continue;

      const queue = submission.queue || [];
      const history = submission.history || [];
      const now = new Date();
      const expertId = job.expertId;

      // 🟢 TYPE A
      if (history.length === 0) {
        const firstExpert = queue[0]?.toString();
        if (firstExpert) await userRepo.updateReputationScore(firstExpert, false);

        await submissionRepo.updateById(job.submissionId, {
          $set: { queue: [new ObjectId(expertId)], updatedAt: now ,createdAt: now},
        });

        await userRepo.updateReputationScore(expertId, true);

        await notificationService.saveTheNotifications(
          'A Question has been reassigned for answering',
          'Answer Reassigned',
          submission.questionId.toString(),
          expertId,
          'answer_creation'
        );
      }

      // 🔵 TYPE B
      else {
        const lastHistory = history[history.length - 1];

        if (lastHistory?.status === 'in-review') {
          const stuckExpertId = lastHistory.updatedBy?.toString();

          const stuckIndex = queue.findIndex(q => q.toString() === stuckExpertId);
          const newQueue = stuckIndex > -1 ? queue.slice(0, stuckIndex) : [];

          newQueue.push(new ObjectId(expertId));

          const updatedHistory = history.slice(0, -1);
          updatedHistory.push({
            updatedBy: new ObjectId(expertId),
            status: 'in-review',
            createdAt: now,
            updatedAt: now,
          });

          await submissionRepo.updateById(job.submissionId, {
            $set: { queue: newQueue, history: updatedHistory, updatedAt: now },
          });

          if (stuckExpertId) await userRepo.updateReputationScore(stuckExpertId, false);
          await userRepo.updateReputationScore(expertId, true);

          await notificationService.saveTheNotifications(
            'A new Review has been assigned to you',
            'New Review Assigned',
            submission.questionId.toString(),
            expertId,
            'peer_review'
          );
        }
      }

      processed++;
      parentPort?.postMessage({ processed: 1 });
    } catch (err: any) {
      console.error(`❌ Failed for submission ${job.submissionId}`, err?.message);
    }
  }

  parentPort?.postMessage({ success: true, processed });
  process.exit(0);
})();
