import {parentPort, workerData} from 'worker_threads';
import 'reflect-metadata';
import path from 'path';
import {Container} from 'inversify';
import {IQuestionSubmission, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {ObjectId} from 'mongodb';
import {PreferenceDto} from '#root/modules/user/validators/UserValidators.js';
import {getBackgroundJobs} from './workerManager.js';
import {appConfig} from '#root/config/app.js';
import {DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT} from '#root/shared/constants/general.js';
import { toTitleCase } from '#root/utils/ToTitlecase.js';

interface WorkerData {
  questions: any[];
  userId: string;
  mongoUri: string;
  dbName: string;
  isRequiredAiInitialAnswer?: boolean;
  isOutreachQuestion?: boolean;
  allocationMode?: 'expert' | 'draft' | 'pae_expert';
  paeExpertId?: string;
}

const data = workerData as WorkerData;
const questionsPayload = Array.isArray(data?.questions) ? data.questions : [];
const userId = data.userId;
const mongoUri = data.mongoUri;
const dbName = data.dbName;
const isRequiredAiInitialAnswer = data.isRequiredAiInitialAnswer ?? false;
const isOutreachQuestion = data.isOutreachQuestion ?? false;
const allocationMode = data.allocationMode ?? 'expert';
const paeExpertId = data.paeExpertId ?? null;
console.log(
  '[Worker] allocationMode:',
  allocationMode,
  '| paeExpertId:',
  paeExpertId,
);

if (!parentPort) {
  console.error(
    '❌ parentPort not found – worker must run in a worker thread.',
  );
  process.exit(1);
}

const container = new Container({defaultScope: 'Singleton'});

container.bind<string>(GLOBAL_TYPES.uri).toConstantValue(mongoUri);
container.bind<string>(GLOBAL_TYPES.dbName).toConstantValue(dbName);
container
  .bind<MongoDatabase>(GLOBAL_TYPES.Database)
  .to(MongoDatabase)
  .inSingletonScope();

const database = container.get<MongoDatabase>(GLOBAL_TYPES.Database);
await database.init();
const {QuestionRepository} =
  await import('#root/shared/database/providers/mongo/repositories/QuestionRepository.js');
const questionRepo = new QuestionRepository(database);
await (questionRepo as any).init();
const {ContextRepository} =
  await import('#root/shared/database/providers/mongo/repositories/ContextRepository.js');
const {UserRepository} =
  await import('#root/shared/database/providers/mongo/repositories/UserRepository.js');
const {QuestionSubmissionRepository} =
  await import('#root/shared/database/providers/mongo/repositories/SubmissionRepository.js');
const {NotificationRepository} =
  await import('#root/shared/database/providers/mongo/repositories/NotificationRepository.js');
const {NotificationService} =
  await import('#root/modules/notification/services/NotificationService.js');
const {AiService} = await import('#root/modules/ai/services/AiService.js');
const {CropRepository} =
  await import('#root/shared/database/providers/mongo/repositories/CropRepository.js');
const {normalizeKeysToLower} =
  await import('#root/utils/normalizeKeysToLower.js');

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

const {DuplicateQuestionRepository} =
  await import('#root/shared/database/providers/mongo/repositories/DuplicateQuestionRepository.js');
const duplicateQuestionRepo = new DuplicateQuestionRepository(database);
await (duplicateQuestionRepo as any).init();

const {checkDuplicateQuestionHelper} =
  await import('#root/modules/question/helpers/duplicateQuestionHelper.js');

(async () => {
  if (questionsPayload.length === 0) {
    parentPort?.postMessage({success: true, processed: 0});
    process.exit(0);
  }

  console.log(`🧠 Worker started for ${questionsPayload.length} question(s)`);

  let processed = 0;
  const successIds: string[] = [];
  let duplicateCount = 0;
  const errors: any[] = [];
  const paeAssignedQuestionTexts: string[] = [];

  // Resolve PAE expert once before the loop so we don't re-fetch on every question
  const paeUserRef = (allocationMode === 'pae_expert' && paeExpertId)
    ? await userRepo.findById(paeExpertId)
    : null;

  if (allocationMode === 'pae_expert' && paeExpertId && !paeUserRef) {
    console.warn(`⚠️ PAE expert ${paeExpertId} not found — no questions will be assigned`);
  }

  const cropCache = new Map<string, string>();

  for (const qRaw of questionsPayload) {
    try {
      // 1. Normalization
      const low = normalizeKeysToLower(qRaw || {});
      // const rawCropName = (low.crop || '').toString();
      const rawCropName = toTitleCase(low.crop);
      const cleanState = toTitleCase(low.state)
      let normalised_crop: string | undefined;

      if (rawCropName.trim()) {
        const cacheKey = rawCropName.trim().toLowerCase();
        if (cropCache.has(cacheKey)) {
          normalised_crop = cropCache.get(cacheKey)!;
        } else {
          try {
            const existingCrop = await cropRepo.findByNameOrAlias(rawCropName);
            if (existingCrop) {
              normalised_crop = existingCrop.name;
              cropCache.set(cacheKey, normalised_crop);
            }
            // Crop not found — omit normalised_crop; moderator must add it via Agri Tech Management.
          } catch (cropError: any) {
            console.error('Crop normalization warning:', cropError.message);
          }
        }
      }

      const details: any = {
        // state: (low.state || '').toString(),
        state: cleanState,
        district: (low.district || '').toString(),
        crop: rawCropName.trim(),
        season: (low.season || '').toString(),
        domain: Array.isArray(low.domain)
          ? low.domain
          : low.domain
            ? [low.domain.toString()]
            : [],
        ...(normalised_crop !== undefined && { normalised_crop }),
      };

      const priorityRaw = (low.priority || 'medium').toString().toLowerCase();
      const priorities = ['low', 'high', 'medium', 'critical'];
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
        const {embedding} = await aiService.getEmbedding(questionText);
        textEmbedding = embedding;

        if (isRequiredAiInitialAnswer && !aiInitialAnswer) {
          try {
            const partialQuestion: any = {question: questionText, details};

            const result =
              await aiService.getAnswerByQuestionDetails(partialQuestion);

            const answer = result?.answer?.trim();

            if (!answer) {
              aiInitialAnswer =
                'AI could not generate an initial answer at this time.';
            } else {
              aiInitialAnswer = answer;
            }
          } catch (error) {
            console.error('AI initial answer generation failed:', error);

            aiInitialAnswer =
              'AI service is currently unavailable. Please try again later.';
          }
        }
      }

      // 3. Construct IQuestion object
      const newQuestion: any = {
        userId: userId && userId.trim() !== '' ? new ObjectId(userId) : null,
        question: questionText,
        priority,
        source: isOutreachQuestion ? 'OUTREACH' : low.source || 'AGRI_EXPERT',
        status: allocationMode === 'draft' ? 'draft' : 'open',
        totalAnswersCount: 0,
        contextId: null,
        details,
        aiInitialAnswer,
        isAutoAllocate: allocationMode === 'expert',
        embedding: textEmbedding,
        metrics: null,
        text: `Question: ${questionText}`,
        //  saved_to_draft: allocationMode === 'draft',
        pae_review: allocationMode === 'pae_expert',
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
            null,
            true,
          );

          if (duplicateResult.isDuplicate) {
            console.log(
              `🔁 Duplicate detected for outreach question. Record moved to duplicates.`,
            );
            processed++;
            duplicateCount++;
            parentPort?.postMessage({processed: 1, duplicateCount: 1});
            continue; // Skip allocation
          }

          if (duplicateResult.isNonAgri) {
            newQuestion.status = 'non_agri';
            await questionRepo.addQuestion(newQuestion);
            console.log(
              `🚫 Non-agri question saved with status 'non_agri'. Skipping allocation.`,
            );
            processed++;
            parentPort?.postMessage({processed: 1});
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
      console.log(
        `✅ Question saved to database with ID: ${savedQuestion._id}`,
      );
      const qId = savedQuestion._id.toString();

      // 6. Allocation — branch by allocationMode
      let queue: ObjectId[] = [];
      let notificationRecipient: string | null = null;
      let notificationMessage = 'A Question has been assigned for answering';
      let notificationTitle = 'Answer Creation Assigned';

      if (allocationMode === 'draft') {
        // Draft mode: empty queue, no allocation, no notification
        console.log(
          `📝 Draft mode — skipping expert allocation for question ${qId}`,
        );
      } else if (allocationMode === 'pae_expert' && paeUserRef) {
        // PAE Expert mode: assign to the pre-fetched PAE expert
        queue = [new ObjectId(paeUserRef._id!.toString())];
        notificationRecipient = paeUserRef._id!.toString();
        notificationMessage = 'A Question has been assigned for answering';
        notificationTitle = 'Answer Creation Assigned';
        const truncated = questionText.length > 120 ? questionText.slice(0, 120) + '…' : questionText;
        paeAssignedQuestionTexts.push(truncated);
        console.log(`👤 PAE Expert mode — assigned question ${qId} to ${paeUserRef.email}`);
      } else {
        // Default 'expert' mode: auto-allocate to experts by reputation score
        const users = await userRepo.findExpertsByReputationScore(
          details as any,
        );
        const intialUsersToAllocate = users.slice(
          0,
          DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT,
        );
        queue = intialUsersToAllocate.map(
          user => new ObjectId(user._id.toString()),
        );
        if (intialUsersToAllocate.length > 0) {
          const IS_INCREMENT = true;
          const firstUserId = intialUsersToAllocate[0]._id.toString();
          await userRepo.updateReputationScore(firstUserId, IS_INCREMENT);
          notificationRecipient = firstUserId;
        }
        console.log(`✅ Experts allocated for question ${qId}`);
      }

      if (queue.length > 0) {
        await questionRepo.updateQuestion(qId, { firstAllocationAt: new Date() });
      }

      // 7. Create QuestionSubmission entry (always created; queue may be empty for drafts)
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

      // 9. Send notification (skipped for draft mode)
      if (notificationRecipient) {
        await notificationService.saveTheNotifications(
          notificationMessage,
          notificationTitle,
          qId,
          notificationRecipient,
          'answer_creation',
        );
      }

      processed++;
      successIds.push(qId);
      parentPort?.postMessage({processed: 1, successIds: [qId]});
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
    paeEmail: paeUserRef?.email ?? null,
    paeFirstName: paeUserRef?.firstName ?? null,
    paeAssignedQuestionTexts,
  });
  process.exit(0);
})();
