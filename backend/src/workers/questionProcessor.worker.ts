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
  questions: any[];
  userId: string;
  mongoUri: string;
  dbName: string;
  isRequiredAiInitialAnswer?: boolean;
  isOutreachQuestion?: boolean;
}

const data = workerData as WorkerData;
const questionsPayload = Array.isArray(data?.questions) ? data.questions : [];
const userId = data.userId;
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
const { CropRepository } = await import(
  '#root/shared/database/providers/mongo/repositories/CropRepository.js'
);
const { normalizeKeysToLower } = await import('#root/utils/normalizeKeysToLower.js');

const contextRepo = new ContextRepository(database);
await (contextRepo as any).init();
const userRepo = new UserRepository(database);
await (userRepo as any).init();
const submissionRepo = new QuestionSubmissionRepository(database);
await (submissionRepo as any).init();
const notificationRepo = new NotificationRepository(database);
await (notificationRepo as any).init();
const cropRepo = new CropRepository(database);
await (cropRepo as any).init();
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
  if (questionsPayload.length === 0) {
    parentPort?.postMessage({ success: true, processed: 0 });
    process.exit(0);
  }

  console.log(`🧠 Worker started for ${questionsPayload.length} question(s)`);

  let processed = 0;
  const successIds: string[] = [];
  let duplicateCount = 0;
  const errors: any[] = [];

  const cropCache = new Map<string, string>();

  for (const qRaw of questionsPayload) {
    try {
      // 1. Normalization
      const low = normalizeKeysToLower(qRaw || {});
      const rawCropName = (low.crop || '').toString();
      let normalised_crop = rawCropName.trim().toLowerCase();

      if (rawCropName.trim()) {
        const cacheKey = rawCropName.trim().toLowerCase();
        if (cropCache.has(cacheKey)) {
          normalised_crop = cropCache.get(cacheKey)!;
        } else {
          try {
            const existingCrop = await cropRepo.findByNameOrAlias(rawCropName);
            if (existingCrop) {
              normalised_crop = existingCrop.name;
            } else {
              const normalizedName = rawCropName.trim().toLowerCase();
              await cropRepo.createCrop(normalizedName, userId || '', []);
              normalised_crop = normalizedName;
            }
          } catch (cropError: any) {
            console.error('Crop normalization warning:', cropError.message);
          }
          cropCache.set(cacheKey, normalised_crop);
        }
      }

      const details = {
        state: (low.state || '').toString(),
        district: (low.district || '').toString(),
        crop: rawCropName.trim(),
        normalised_crop,
        season: (low.season || '').toString(),
        domain: (low.domain || '').toString(),
      };

      const priorityRaw = (low.priority || 'medium').toString().toLowerCase();
      const priorities = ['low', 'high', 'medium'];
      const priority = priorities.includes(priorityRaw)
        ? (priorityRaw as any)
        : 'medium';

      const questionText = (low.question || '').toString().trim();
      if (!questionText) {
        console.warn('⚠️ Skipping question with empty text');
        continue;
      }

      //2. Embedding and AI Initial Answer Generation

      const ENABLE_AI_SERVER = appConfig.ENABLE_AI_SERVER;
      let textEmbedding = [];
      let aiInitialAnswer = qRaw.aiInitialAnswer || '';

      if (ENABLE_AI_SERVER) {
        const { embedding } = await aiService.getEmbedding(questionText);
        textEmbedding = embedding;

        if (isRequiredAiInitialAnswer && !aiInitialAnswer) {
          try {

            const partialQuestion: any = { question: questionText, details };

            const result = await aiService.getAnswerByQuestionDetails(partialQuestion);

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

      // 3. Construct IQuestion object
      const newQuestion: any = {
        userId: userId && userId.trim() !== '' ? new ObjectId(userId) : null,
        question: questionText,
        priority,
        source: isOutreachQuestion ? "OUTREACH" : (low.source || 'AGRI_EXPERT'),
        status: 'open',
        totalAnswersCount: 0,
        contextId: null,
        details,
        aiInitialAnswer,
        isAutoAllocate: true,
        embedding: textEmbedding,
        metrics: null,
        text: `Question: ${questionText}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 4. Duplicate Detection for Outreach Questions

      if (isOutreachQuestion && ENABLE_AI_SERVER) {
        const logData: any = {
          question: questionText,
          details,
          source: newQuestion.source,
        };
        try {
          const duplicateResult = await checkDuplicateQuestionHelper(
            newQuestion,
            details,
            logData,
            aiService,
            duplicateQuestionRepo,
          );

          if (duplicateResult.isDuplicate) {
            console.log(
              `🔁 Duplicate detected for outreach question. Record moved to duplicates.`,
            );
            processed++;
            duplicateCount++;
            parentPort?.postMessage({ processed: 1, duplicateCount: 1 });
            continue; // Skip allocation
          }
        } catch (dupError: any) {
          console.error(
            `⚠️ Duplicate check failed, proceeding with normal flow:`,
            dupError?.message,
          );
        }
      }

      // 5. Insert into DB
      const savedQuestion = await questionRepo.addQuestion(newQuestion);
      if (!savedQuestion?._id) {
        throw new Error('Failed to save question to database');
      }
      console.log(`✅ Question saved to database with ID: ${savedQuestion._id}`);
      const qId = savedQuestion._id.toString();

      // 6. Allocation
      const users = await userRepo.findExpertsByReputationScore(
        details as any,
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
      if (intialUsersToAllocate.length > 0) {
        const IS_INCREMENT = true;
        const userId = intialUsersToAllocate[0]._id.toString();
        await userRepo.updateReputationScore(userId, IS_INCREMENT);
      }
      console.log(`✅ Experts allocated for question ${qId}`);
      // 7. Create an empty QuestionSubmission entry for the newly created question
      const submissionData: IQuestionSubmission = {
        questionId: new ObjectId(qId),
        lastRespondedBy: null,
        history: [],
        queue,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 8. Save QuestionSubmission to DB
      await submissionRepo.addSubmission(submissionData);

      //9. Send the notifications
      if (intialUsersToAllocate[0]) {
        let message = `A Question has been assigned for answering`;
        let title = 'Answer Creation Assigned';
        let entityId = qId;
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
      successIds.push(qId);
      parentPort?.postMessage({ processed: 1, successIds: [qId] });

    } catch (error: any) {
      console.error(
        `❌ Error processing raw question:`,
        error?.message || error,
      );
      processed++;
      errors.push({
        message: error?.message || 'Unknown error',
        question: qRaw?.question || 'Unknown',
      });
      parentPort?.postMessage({
        processed: 1,
        error: error?.message || 'Unknown error',
      });
    }
}

  console.log(
    `🏁 Worker finished. Total processed: ${processed}/${questionsPayload.length}`,
  );
    parentPort?.postMessage({
    success: true,
  });
  process.exit(0);
})();
