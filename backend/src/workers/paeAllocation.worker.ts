import { parentPort, workerData } from 'worker_threads';
import 'reflect-metadata';
import { MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { Container } from 'inversify';
import { ObjectId } from 'mongodb';
import { IQuestionSubmission } from '#root/shared/interfaces/models.js';
import { sendPaeAssignmentEmail } from '#root/utils/buildPaeAssignmentEmail.js';

interface WorkerData {
  questionIds: string[];
  paeExpertId: string;
  userId: string;
  mongoUri: string;
  dbName: string;
}

const data = workerData as WorkerData;
const { questionIds, paeExpertId, userId, mongoUri, dbName } = data;

if (!parentPort) {
  console.error('❌ parentPort not found – worker must run in a worker thread.');
  process.exit(1);
}

const container = new Container({ defaultScope: 'Singleton' });
container.bind<string>(GLOBAL_TYPES.uri).toConstantValue(mongoUri);
container.bind<string>(GLOBAL_TYPES.dbName).toConstantValue(dbName);
container
  .bind<MongoDatabase>(GLOBAL_TYPES.Database)
  .to(MongoDatabase)
  .inSingletonScope();

const database = container.get<MongoDatabase>(GLOBAL_TYPES.Database);
await database.init();

const { QuestionRepository } = await import(
  '#root/shared/database/providers/mongo/repositories/QuestionRepository.js'
);
const { UserRepository } = await import(
  '#root/shared/database/providers/mongo/repositories/UserRepository.js'
);
const { QuestionSubmissionRepository } = await import(
  '#root/shared/database/providers/mongo/repositories/SubmissionRepository.js'
);
const { NotificationRepository } = await import(
  '#root/shared/database/providers/mongo/repositories/NotificationRepository.js'
);
const { NotificationService } = await import(
  '#root/modules/notification/services/NotificationService.js'
);

const questionRepo = new QuestionRepository(database);
await (questionRepo as any).init();
const userRepo = new UserRepository(database);
await (userRepo as any).init();
const submissionRepo = new QuestionSubmissionRepository(database);
await (submissionRepo as any).init();
const notificationRepo = new NotificationRepository(database);
await (notificationRepo as any).init();
const notificationService = new NotificationService(notificationRepo, database);

(async () => {
  if (!questionIds?.length) {
    parentPort?.postMessage({ success: true, processed: 0 });
    process.exit(0);
  }

  console.log(`🧠 PAE Allocation Worker started for ${questionIds.length} question(s)`);

  let processed = 0;
  const succeeded: string[] = [];
  const failed: Array<{ questionId: string; reason: string }> = [];
  const assignedQuestionTexts: string[] = [];

  // Validate PAE expert once up-front
  const paeUser = await userRepo.findById(paeExpertId);
  if (!paeUser) {
    parentPort?.postMessage({ success: false, error: `PAE expert ${paeExpertId} not found` });
    process.exit(1);
  }

  const expertObjectId = new ObjectId(paeExpertId);

  for (const questionId of questionIds) {
    try {
      // 1. Get question and validate it can be PAE-assigned
      const question = await questionRepo.getById(questionId);
      if (!question) throw new Error('Question not found');
      if (question.status !== 'draft' && question.status !== 'open')
        throw new Error(`Cannot assign PAE expert to question with status '${question.status}'`);

      // 2. For draft questions promote to open; for already-open questions just set pae_review flag
      await questionRepo.updateQuestion(questionId, {
        ...(question.status === 'draft' && { status: 'open' }),
        pae_review: true,
      });

      // 3. Get existing submission or create one with empty queue
      let submission = await submissionRepo.getByQuestionId(questionId);

      if (!submission) {
        const newSubmission: IQuestionSubmission = {
          questionId: new ObjectId(questionId),
          lastRespondedBy: null,
          history: [],
          queue: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        submission = await submissionRepo.addSubmission(newSubmission);
        console.log(`📋 Created new submission for question ${questionId}`);
      }

      // 4. Assign the PAE expert into the queue (both new and existing submissions)
      const alreadyQueued = submission.queue.some(
        (q) => q.toString() === paeExpertId,
      );
      if (alreadyQueued) throw new Error('PAE expert is already in the queue');
      await submissionRepo.allocateExperts(questionId, [expertObjectId]);
      console.log(`📥 Assigned PAE expert to question ${questionId}`);

      // 5. Bump reputation score for the PAE expert
      await userRepo.updateReputationScore(paeExpertId, true);

      // 6. Send notification to PAE expert — best-effort: a notification failure must
      // not fail an allocation that has already been persisted above.
      try {
        await notificationService.saveTheNotifications(
          'A Question has been assigned for answering',
          'Answer Creation Assigned',
          questionId,
          paeExpertId,
          'answer_creation',
        );
      } catch (notifyErr: any) {
        console.error(`⚠️ Assigned PAE expert to question ${questionId} but notification failed:`, notifyErr?.message);
      }

      // 7. Collect question text for summary email
      const questionText = (question.question || questionId).toString();
      const truncatedText = questionText.length > 120 ? questionText.slice(0, 120) + '…' : questionText;
      assignedQuestionTexts.push(truncatedText);

      processed++;
      succeeded.push(questionId);
      parentPort?.postMessage({ processed: 1, successId: questionId });
    } catch (error: any) {
      console.error(`❌ Failed for question ${questionId}:`, error?.message);
      processed++;
      failed.push({ questionId, reason: error?.message || 'Unknown error' });
      parentPort?.postMessage({
        processed: 1,
        failedQuestion: { questionId, reason: error?.message || 'Unknown error' },
      });
    }
  }

  console.log(
    `🏁 PAE Allocation Worker finished. ${succeeded.length} succeeded, ${failed.length} failed.`,
  );

  // Send a single summary email for all successfully assigned questions
  await sendPaeAssignmentEmail(paeUser.email, paeUser.firstName, assignedQuestionTexts);

  parentPort?.postMessage({ success: true, succeeded, failed });
  process.exit(0);
})();
