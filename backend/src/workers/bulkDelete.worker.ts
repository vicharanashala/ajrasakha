import { parentPort, workerData } from 'worker_threads';
import 'reflect-metadata';
import { MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { Container } from 'inversify';
import { ClientSession, ReadPreference, ReadConcern, WriteConcern } from 'mongodb';

interface WorkerData {
  questionIds: string[];
  userId: string;
  mongoUri: string;
  dbName: string;
}

const data = workerData as WorkerData;
const { questionIds, mongoUri, dbName } = data;

if (!parentPort) {
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

// Dynamic imports for repositories
const { QuestionRepository } = await import('#root/shared/database/providers/mongo/repositories/QuestionRepository.js');
const { UserRepository } = await import('#root/shared/database/providers/mongo/repositories/UserRepository.js');
const { AnswerRepository } = await import('#root/shared/database/providers/mongo/repositories/AnswerRepository.js');
const { QuestionSubmissionRepository } = await import('#root/shared/database/providers/mongo/repositories/SubmissionRepository.js');
const { RequestRepository } = await import('#root/shared/database/providers/mongo/repositories/RequestRepository.js');
const { ReRouteRepository } = await import('#root/shared/database/providers/mongo/repositories/ReRouteRepository.js');
const { DuplicateQuestionRepository } = await import('#root/shared/database/providers/mongo/repositories/DuplicateQuestionRepository.js');

const questionRepo = new QuestionRepository(database);
await (questionRepo as any).init();
const userRepo = new UserRepository(database);
await (userRepo as any).init();
const answerRepo = new AnswerRepository(database);
await (answerRepo as any).init();
const submissionRepo = new QuestionSubmissionRepository(database);
await (submissionRepo as any).init();
const requestRepo = new RequestRepository(database);
await (requestRepo as any).init();
const reRouteRepo = new ReRouteRepository(database);
await (reRouteRepo as any).init();
const duplicateRepo = new DuplicateQuestionRepository(database);
await (duplicateRepo as any).init();

async function _withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
  const client = await database.getClient();
  const session = client.startSession();
  const txOptions = {
    readPreference: ReadPreference.primary,
    readConcern: new ReadConcern('snapshot'),
    writeConcern: new WriteConcern('majority'),
  };

  try {
    session.startTransaction(txOptions);
    const result = await operation(session);
    await session.commitTransaction();
    return result;
  } catch (error: any) {
    if (session.inTransaction()) await session.abortTransaction().catch(() => {});
    const isStandalone =
      error?.message?.includes?.('Transaction numbers are only allowed') ||
      error?.message?.includes?.('replica set') ||
      error?.code === 20 ||
      error?.codeName === 'IllegalOperation';
    if (isStandalone) {
      return await operation(session);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function deleteQuestion(questionId: string) {
  return _withTransaction(async (session: ClientSession) => {
    const question = await questionRepo.getById(questionId, session);
    if (!question) throw new Error(`Question ${questionId} not found`);

    // 1. Delete all answers
    await answerRepo.deleteByQuestionId(questionId, session);

    // 2. Fetch submission for reputation updates
    const submission = await submissionRepo.getByQuestionId(questionId, session);
    const history = submission?.history || [];

    if (history.length > 0) {
      const lastEntry = history[history.length - 1];
      if (lastEntry && lastEntry.status === 'in-review' && !lastEntry.answer) {
        const expertId = lastEntry.updatedBy?.toString();
        if (expertId) await userRepo.updateReputationScore(expertId, false, session);
      }
    } else if (submission?.queue?.[0]) {
      const expertId = submission.queue[0].toString();
      await userRepo.updateReputationScore(expertId, false, session);
    }

    // 3. Handle reroutes
    const existingReRoute = await reRouteRepo.findByQuestionId(questionId, session);
    if (existingReRoute?.reroutes?.length) {
      const lastReroute = existingReRoute.reroutes.at(-1);
      if (lastReroute?.status === 'pending') {
        const reroutedExpertId = lastReroute.reroutedTo?.toString();
        if (reroutedExpertId) await userRepo.updateReputationScore(reroutedExpertId, false, session);
      }
    }

    // 4. Delete submission, requests, duplicates
    await submissionRepo.deleteByQuestionId(questionId, session);
    await requestRepo.deleteByEntityId(questionId, session);
    await duplicateRepo.deleteByReferenceQuestionId(questionId, session);

    // 4b. Pull this question from any moderator's assignedQuestionIds so no orphan entry
    // is left behind keeping them wrongly "busy" after the question is gone.
    await userRepo.removeAssignedQuestionFromAllModerators(questionId, session);

    // 5. Finally delete question
    return questionRepo.deleteQuestion(questionId, session);
  });
}

(async () => {
  console.log(`🗑️ Bulk Delete Worker started for ${questionIds.length} questions`);

  for (const id of questionIds) {
    try {
      await deleteQuestion(id);
      parentPort?.postMessage({ processed: 1, successId: id });
    } catch (error: any) {
      console.error(`❌ Failed to delete ${id}:`, error?.message);
      parentPort?.postMessage({
        processed: 1,
        failedQuestion: { questionId: id, reason: error?.message || 'Unknown error' },
      });
    }
  }

  console.log(`🏁 Bulk Delete Worker finished.`);
  process.exit(0);
})();
