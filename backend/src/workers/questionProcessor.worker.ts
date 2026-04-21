import { parentPort, workerData } from 'worker_threads';
import 'reflect-metadata';
import path from 'path';
import {Container} from 'inversify';
import {IQuestionSubmission, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {ObjectId} from 'mongodb';
import {PreferenceDto} from '#root/modules/user/validators/UserValidators.js';
import {getBackgroundJobs} from './workerManager.js';
import {appConfig} from '#root/config/app.js';

interface WorkerData {
  ids: string[];
  mongoUri: string;
  dbName: string;
  isRequiredAiInitialAnswer?: boolean;
  isOutreachQuestion?: boolean;
}

const data = workerData as WorkerData;
const ids = Array.isArray(data?.ids) ? data.ids : [];
const mongoUri = data.mongoUri;
const dbName = data.dbName;
const isRequiredAiInitialAnswer = data.isRequiredAiInitialAnswer ?? false;
const isOutreachQuestion = data.isOutreachQuestion ?? false;

if (!parentPort) {
  console.error(
    '❌ parentPort not found – worker must run in a worker thread.',
  );
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
const questionRepo = new QuestionRepository(database);
await (questionRepo as any).init();
const { ContextRepository } = await import(
  '#root/shared/database/providers/mongo/repositories/ContextRepository.js'
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
const {NotificationService} = await import(
  '#root/modules/notification/services/NotificationService.js'
);
const {AiService} = await import('#root/modules/ai/services/AiService.js');
const contextRepo = new ContextRepository(database);
await (contextRepo as any).init();
const userRepo = new UserRepository(database);
await (userRepo as any).init();
const submissionRepo = new QuestionSubmissionRepository(database);
await (submissionRepo as any).init();
const notificationRepo = new NotificationRepository(database);
await (notificationRepo as any).init();
const notificationService = new NotificationService(notificationRepo, database);
const aiService = new AiService();

const { DuplicateQuestionRepository } = await import(
  '#root/shared/database/providers/mongo/repositories/DuplicateQuestionRepository.js'
);
const duplicateQuestionRepo = new DuplicateQuestionRepository(database);
await (duplicateQuestionRepo as any).init();

const { checkDuplicateQuestionHelper } = await import(
  '#root/modules/question/helpers/duplicateQuestionHelper.js'
);

(async () => {
  if (ids.length === 0) {
    parentPort?.postMessage({ success: true, processed: 0 });
    process.exit(0);
  }

  console.log(`🧠 Worker started for ${ids.length} question(s)`);

  let processed = 0;

  for (const qId of ids) {
    try {
      const question = await questionRepo.getById(qId);
      if (!question) {
        console.warn(`⚠️ Question not found: ${qId}`);
        continue;
      }

      //embedding   stage 1
      const textToEmbed = question.text || question.question;
      // if (!textToEmbed) {
      //   await questionRepo.updateQuestionStatus(
      //     qId,
      //     'failed',
      //     'Missing question text',
      //   );
      //   continue;
      // }
      let textEmbedding = [];
      let aiInitialAnswer = question.aiInitialAnswer;

      const ENABLE_AI_SERVER = appConfig.ENABLE_AI_SERVER;

      if (ENABLE_AI_SERVER) {
        const { embedding } = await aiService.getEmbedding(textToEmbed);
        textEmbedding = embedding;

        if (isRequiredAiInitialAnswer && !aiInitialAnswer) {
          try {
            const result = await aiService.getAnswerByQuestionDetails(question);

            const answer = result?.answer?.trim();

            if (!answer) {
              aiInitialAnswer =
                "AI could not generate an initial answer at this time.";
            } else {
              aiInitialAnswer = answer;
            }
          } catch (error) {
            console.error("AI initial answer generation failed:", error);

            aiInitialAnswer =
              "AI service is currently unavailable. Please try again later.";
          }
        }
      }

      await questionRepo['QuestionCollection'].updateOne(
        { _id: new (await import('mongodb')).ObjectId(qId) },
        { $set: { embedding: textEmbedding, aiInitialAnswer, updatedAt: new Date() } },
      );

      // ── Duplicate Detection for Outreach Questions ──
      if (isOutreachQuestion && ENABLE_AI_SERVER) {
        const logData: any = {
          qId,
          question: question.question,
          details: question.details,
          source: question.source,
        };

        try {
          const duplicateResult = await checkDuplicateQuestionHelper(
            question,
            question.details,
            logData,
            aiService,
            duplicateQuestionRepo,
          );

          if (duplicateResult.isDuplicate) {
            await questionRepo.deleteQuestion(qId);
            console.log(
              `🔁 Duplicate detected for outreach question ${qId}. Record moved to duplicates.`,
            );
            processed++;
            continue; // Skip allocation
          }
        } catch (dupError: any) {
          console.error(
            `⚠️ Duplicate check failed for question ${qId}, proceeding with normal flow:`,
            dupError?.message,
          );
        }
      }

      // allocation stage - 2

      const users = await userRepo.findExpertsByReputationScore(
        question.details as PreferenceDto,
      );

      const intialUsersToAllocate = users.slice(0, 3);

      const queue = intialUsersToAllocate.map(
        user => new ObjectId(user._id.toString()),
      );

      // for (const user of intialUsersToAllocate) {
      //   const IS_INCREMENT = true;
      //   const userId = user._id.toString();
      //   await userRepo.updateReputationScore(userId, IS_INCREMENT);
      // }
      if (intialUsersToAllocate) {
        const IS_INCREMENT = true;
        const userId = intialUsersToAllocate[0]._id.toString();
        await userRepo.updateReputationScore(userId, IS_INCREMENT);
      }
      // 6. Create an empty QuestionSubmission entry for the newly created question
      const submissionData: IQuestionSubmission = {
        questionId: new ObjectId(question._id.toString()),
        lastRespondedBy: null,
        history: [],
        queue,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 6. Save QuestionSubmission to DB
      await submissionRepo.addSubmission(submissionData);

      //send the notifications
      if (intialUsersToAllocate[0]) {
        let message = `A Question has been assigned for answering`;
        let title = 'Answer Creation Assigned';
        let entityId = question._id.toString();
        const user = intialUsersToAllocate[0]._id.toString();
        const type = 'answer_creation';
        await notificationService.saveTheNotifications(
          message,
          title,
          entityId,
          user,
          type,
        );
      }

      processed++;
    } catch (error: any) {
      console.error(
        `❌ Error processing question ${qId}:`,
        error?.message || error,
      );
      await questionRepo.deleteQuestion(qId);
      // await questionRepo.updateQuestionStatus(qId, 'failed', error?.message);
    }
  }

  console.log(
    `🏁 Worker finished. Total processed: ${processed}/${ids.length}`,
  );
  parentPort?.postMessage({ success: true, processed });
  process.exit(0);
})();
