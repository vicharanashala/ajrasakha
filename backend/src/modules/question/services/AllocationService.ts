import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {BadRequestError, NotFoundError, UnauthorizedError, InternalServerError} from 'routing-controllers';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {AUDIT_TRAILS_TYPES} from '#root/modules/auditTrails/types.js';
import {IAuditTrailsService} from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import {AuditAction, AuditCategory, OutComeStatus, ModeratorAuditTrail} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IRequestRepository} from '#root/shared/database/interfaces/IRequestRepository.js';
import {NotificationService} from '#root/modules/notification/services/NotificationService.js';
import {UserService} from '#root/modules/user/services/UserService.js';
import {IQuestion, IUser, IAnswer, IQuestionSubmission, ISubmissionHistory, IPreviousAllocations, IAuthorsHistory, INotificationType, QuestionSource, TIME_BOUND_SOURCES, MANUAL_SOURCES} from '#root/shared/interfaces/models.js';
import {PreferenceDto} from '#root/modules/user/validators/UserValidators.js';
import {isToday} from '#root/utils/date.utils.js';
import {startBalanceWorkloadWorkers} from '#root/workers/balanceWorkload.manager.js';
import {startPaeAllocationWorker} from '#root/workers/paeAllocation.manager.js';
import {DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT, TOTAL_EXPERTS_LIMIT} from '#root/shared/constants/general.js';

/** Guard so two time-bound reallocation runs never overlap. */
let isReallocatingTimeBound = false;
/** Same guard for the manual (AGRI_EXPERT/OUTREACH) single-allocation cron. */
let isReallocatingManual = false;

/**
 * Expert allocation & workload balancing extracted from QuestionService:
 * auto/manual allocation, queue removal/replacement, absent-expert cleanup,
 * workload reallocation, and the single-allocation crons (time-bound + manual).
 * QuestionService keeps thin delegating wrappers so IQuestionService and all
 * external callers are unchanged.
 */
@injectable()
export class AllocationService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.QuestionRepository) private readonly questionRepo: IQuestionRepository,
    @inject(GLOBAL_TYPES.UserRepository) private readonly userRepo: IUserRepository,
    @inject(GLOBAL_TYPES.QuestionSubmissionRepository) private readonly questionSubmissionRepo: IQuestionSubmissionRepository,
    @inject(GLOBAL_TYPES.AnswerRepository) private readonly answerRepo: IAnswerRepository,
    @inject(GLOBAL_TYPES.RequestRepository) private readonly requestRepository: IRequestRepository,
    @inject(GLOBAL_TYPES.NotificationService) private readonly notificationService: NotificationService,
    @inject(GLOBAL_TYPES.UserService) private readonly userService: UserService,
    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService) private readonly auditTrailsService: IAuditTrailsService,
    @inject(GLOBAL_TYPES.Database) mongoDatabase: MongoDatabase,
  ) { super(mongoDatabase); }

  /**
   * Helper function to truncate question text for notifications
   */
  private truncateQuestionText(
    questionText: string,
    maxLength: number = 50,
  ): string {
    if (!questionText) return 'Question';
    if (questionText.length <= maxLength) return questionText;
    return questionText.substring(0, maxLength) + '...';
  }

  async autoAllocateExperts(
    questionId: string,
    session?: ClientSession,
    BATCH_EXPECTED_TO_ADD: number = DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT,
  ): Promise<{data?: ObjectId[]; status: boolean}> {
    const question = await this.questionRepo.getById(questionId, session);
    if (!question) throw new NotFoundError('Question not found');

    if (
      question.status === 'in-review' ||
      question.status === 'closed' ||
      question.status == 'pae_submitted'
    ) {
      console.log(
        'This question is currently being reviewed or has been closed. Please check back later!',
      );
      return {data: [], status: false};
    }
    // Single-allocation sources (time-bound AJRASAKHA/WHATSAPP and manual
    // AGRI_EXPERT/OUTREACH) are managed by the single-allocation cron — bulk
    // auto-allocation is disabled for them here.
    const isSingleAllocation =
      TIME_BOUND_SOURCES.includes(question.source) ||
      MANUAL_SOURCES.includes(question.source);
    if (isSingleAllocation) {
      const reason = `Auto-allocation is disabled for single-allocation questions (source: ${question.source})`;
      console.log(
        `[autoAllocateExperts] ${reason} — questionId: ${questionId}`,
      );
      return {data: [], status: false};
    }
    if (question.status == 'draft') {
      await this.questionRepo.updateQuestion(
        questionId,
        {
          status: 'open',
        },
        session,
      );
    }

    const details = question.details as PreferenceDto;

    const questionSubmission =
      await this.questionSubmissionRepo.getByQuestionId(questionId, session);

    if (!questionSubmission) {
      throw new NotFoundError('Question submission not found');
    }

    // checking last submission in history to see if there is an expert who has not yet responded and if !lastSubmission.answer is added to ensure that we are not blocking the queue in case of reviewers who are just reviewing the answer without providing any answers
    const lastSubmission = questionSubmission.history.at(-1);
    if (
      lastSubmission &&
      lastSubmission.status === 'in-review' &&
      !lastSubmission.answer
    ) {
      return {data: [], status: false};
    }

    const EXISTING_QUEUE_COUNT = questionSubmission.queue.length || 0;
    const EXISTING_HISTORY_COUNT = questionSubmission.history.length || 0;

    if (EXISTING_QUEUE_COUNT >= TOTAL_EXPERTS_LIMIT) {
      console.log('Cannot auto allocate as queue is full');
      return {data: [], status: false};
    }

    let allExpertIds: string[] = [];
    const isAjrasakha = question.source == 'AJRASAKHA' ? true : false;
    const isTrainingQuestion = question.isTrainingQuestion === true;
    if (isAjrasakha) {
      const users = await this.userRepo.getExpertsWithFallback(
        details,
        session,
      );

      // A training question must go to training users only; a real question to real
      // users only. (Previously this always kept non-training users, so training
      // AJRASAKHA questions leaked to real experts.)
      allExpertIds = users
        .filter(user =>
          isTrainingQuestion
            ? user.isTrainingUser === true
            : user.isTrainingUser !== true,
        )
        .map(user => user._id.toString());
    } else {
      const expertTMU = [];
      const expertNormal = [];
      const [users, preferredExperts] = await Promise.all([
        this.userRepo.findAll(),
        this.userRepo.findExpertsByPreference(details, session),
      ]);

      for (const user of users) {
        if (user.role !== 'expert' || user.isBlocked === true) {
          continue;
        }

        if (user.isTrainingUser) {
          expertTMU.push(user);
        } else {
          expertNormal.push(user);
        }
      }

      const eligibleUsers = isTrainingQuestion ? expertTMU : expertNormal;

      const preferredTMU = [];
      const preferredNormal = [];

      for (const user of preferredExperts) {
        if (user.isTrainingUser) {
          preferredTMU.push(user);
        } else {
          preferredNormal.push(user);
        }
      }
      const eligiblePreferredExperts = isTrainingQuestion
        ? preferredTMU
        : preferredNormal;

      const expertIdsSet = new Set<string>();

      // Add preferred experts first to the set to ensure they get priority in allocation
      eligiblePreferredExperts.forEach(user =>
        expertIdsSet.add(user._id.toString()),
      );

      // Add remaining
      eligibleUsers.forEach(user => expertIdsSet.add(user._id.toString()));

      allExpertIds = Array.from(expertIdsSet);
    }

    let updatedQueue;

    // condition to check if we have room in the queue to add more experts and also to ensure we are not adding more experts if there is already an expert in the queue who has not yet responded (to avoid flooding the queue with multiple experts at once and to give existing experts a chance to respond before adding more)
    if (
      EXISTING_QUEUE_COUNT < DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT ||
      (EXISTING_QUEUE_COUNT === EXISTING_HISTORY_COUNT &&
        EXISTING_QUEUE_COUNT <= allExpertIds.length)
    ) {
      const answeredExperts = new Set(
        questionSubmission.history.map(h => h.updatedBy.toString()),
      );

      const unAnsweredExpertIds = allExpertIds.filter(
        expertId => !answeredExperts.has(expertId),
      );

      const CURRENT_BATCH_SIZE = TOTAL_EXPERTS_LIMIT - EXISTING_QUEUE_COUNT;

      // To ensure allocation will not overflow total limit
      const FINAL_BATCH_SIZE = Math.min(
        BATCH_EXPECTED_TO_ADD,
        CURRENT_BATCH_SIZE,
      );

      const existingQueueIds = questionSubmission.queue.map(id =>
        id.toString(),
      );

      const filteredExperts = unAnsweredExpertIds.filter(
        id => !existingQueueIds.includes(id.toString()),
      );

      const lastSubmission = questionSubmission.history.at(-1);
      // No more experts left to allocate — hand the question off to a moderator
      // (status → in-review, last answer → pending-with-moderator) and stop here:
      // everything below only applies when there are experts to add.
      if (filteredExperts.length === 0) {
        await this.questionRepo.updateQuestion(
          questionId,
          {status: 'in-review'},
          session,
        );
        const payload: Partial<IAnswer> = {
          status: 'pending-with-moderator',
        };

        // The last submission may be an answer, an approval, or a modification —
        // a modified review carries `modifiedAnswer` (not `answer`/`approvedAnswer`).
        // Include it in the fallback so the correct answer is marked pending-with-
        // moderator, and guard against a missing id so this never throws.
        const answer =
          lastSubmission?.answer ||
          lastSubmission?.approvedAnswer ||
          lastSubmission?.modifiedAnswer ||
          lastSubmission?.rejectedAnswer;

        if (answer) {
          await this.answerRepo.updateAnswerStatus(
            answer.toString(),
            payload,
            session,
          );
        }

        return {data: [], status: false};
      }

      const expertsToAdd = filteredExperts.slice(0, FINAL_BATCH_SIZE);

      // Add entry for first expert in the queue as status in-review (only after intial 3 allocation)
      // if (
      //   questionSubmission.history.length >= 0 &&
      //   (!lastSubmission ||
      //     (lastSubmission?.answer && lastSubmission.status !== 'in-review') ||
      //     lastSubmission?.status == 'reviewed')
      //   // &&EXISTING_QUEUE_COUNT >= 3
      // ) {
      const hasExperts = expertsToAdd?.length >= 1;
      if (!lastSubmission) {
        const IS_INCREMENT = true;
        const expertId = expertsToAdd[0]?.toString();
        await this.userRepo.updateReputationScore(
          expertId,
          IS_INCREMENT,
          session,
        );
        // No submissions send answer_creation notification to the first expert
        if (EXISTING_QUEUE_COUNT === 0) {
          let message = `A Question has been assigned for answering`;
          let title = 'Answer Creation Assigned';
          let entityId = questionId.toString();
          const user = expertId;
          const type: INotificationType = 'answer_creation';
          await this.notificationService.saveTheNotifications(
            message,
            title,
            entityId,
            user,
            type,
          );
          await this.questionRepo.updateQuestion(
            questionId,
            {firstAllocationAt: new Date()},
            session,
          );
        }
      }
      if (
        hasExperts &&
        lastSubmission &&
        (lastSubmission.reviewId || lastSubmission.answer) // if last submission is reviewed or author's answer
      ) {
        const nextExpertId = expertsToAdd[0]?.toString();
        const nextAllocatedSubmissionData: ISubmissionHistory = {
          updatedBy: new ObjectId(nextExpertId),
          status: 'in-review',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await this.questionSubmissionRepo.update(
          questionId,
          nextAllocatedSubmissionData,
          session,
          false,
        );
        const IS_INCREMENT = true;
        await this.userRepo.updateReputationScore(
          nextExpertId.toString(),
          IS_INCREMENT,
          session,
        );
        let message = `A new Review has been assigned to you`;
        let title = 'New Review Assigned';
        let entityId = questionId.toString();
        const user = nextExpertId.toString();
        const type: INotificationType = 'peer_review';
        await this.notificationService.saveTheNotifications(
          message,
          title,
          entityId,
          user,
          type,
        );
      }
      updatedQueue = [...questionSubmission.queue, ...(expertsToAdd || [])]
        .slice(0, TOTAL_EXPERTS_LIMIT)
        .map(id => new ObjectId(id));

      await this.questionSubmissionRepo.updateQueue(
        questionId,
        updatedQueue,
        session,
      );
    }
    return {
      data: updatedQueue,
      status: true,
    };
  }

  async toggleAutoAllocate(
    questionId: string,
  ): Promise<{message: string; data?: ObjectId[]}> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        //1. Validate question existence
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) throw new NotFoundError('Question not found');
        if (question.status == 'draft') {
          await this.questionRepo.updateQuestion(
            questionId,
            {
              status: 'open',
            },
            session,
          );
        }

        const updated = await this.questionRepo.updateAutoAllocate(
          questionId,
          question?.isAutoAllocate,
          session,
        );

        const currentStatus = question.isAutoAllocate;

        // If currentStatus is false, then we need to set it to true and vice versa
        let out;

        if (!currentStatus) {
          const questionSubmission =
            await this.questionSubmissionRepo.getByQuestionId(
              questionId,
              session,
            );

          if (!questionSubmission)
            await this.questionSubmissionRepo.addSubmission(
              {
                questionId: new ObjectId(questionId),
                lastRespondedBy: null,
                history: [],
                queue: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                reviewDelayNotificationSent: false,
              },
              session,
            );

          // const CURRENT_QUEUE_LENGTH = submission.queue.length || 0;
          // let BATCH_EXPECTED_TO_ADD = 6;

          // If removing first 3 intial allocation, so allocate only 3 intially
          // if (CURRENT_QUEUE_LENGTH < 3)
          //   BATCH_EXPECTED_TO_ADD = 3 - CURRENT_QUEUE_LENGTH;

          out = await this.autoAllocateExperts(
            questionId,
            session,
            // BATCH_EXPECTED_TO_ADD,
          );

          if (!out.status) {
            return {
              message: 'Auto allocate toggled, but queue is already full',
              data: out?.data,
            };
          }
        }

        return {
          message: `Auto allocate is now set to ${updated.isAutoAllocate}`,
          data: out?.data,
        };
      });
    } catch (error) {
      throw new InternalServerError(`Failed to toggle auto allocate: ${error}`);
    }
  }

  async allocateExperts(
    userId: string,
    questionId: string,
    experts: string[],
  ): Promise<IQuestionSubmission> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        // Validate that user has authorization for this
        const user = await this.userRepo.findById(userId, session);
        if (!user)
          throw new UnauthorizedError(`Cannot find user, try relogin!`);
        if (user.role == 'expert')
          throw new UnauthorizedError(
            `You don't have permission to perform this operation`,
          );
        //1. Validate question existence
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) throw new NotFoundError('Question not found');
        if (
          question.status === 'in-review' ||
          question.status === 'closed' ||
          question.status == 'pae_submitted'
        ) {
          console.log(
            'This question is currently being in reviewed or has been closed. Please check back later!',
          );
          return;
        }
        if (question.status == 'draft') {
          // Check if any of the experts being allocated is a PAE expert
          const expertUsers = await Promise.all(
            experts.map(id => this.userRepo.findById(id, session)),
          );
          const isPaeAllocation = expertUsers.some(
            u => u?.role === 'pae_expert',
          );

          await this.questionRepo.updateQuestion(
            questionId,
            {
              status: 'open',
              ...(isPaeAllocation && {pae_review: true}),
            },
            session,
          );
        }

        //2. Validate question submission existence
        let questionSubmission =
          await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );
        // let submission
        if (!questionSubmission) {
          if (question.source == 'WHATSAPP' || question.status === 'draft') {
            const newSubmission: IQuestionSubmission = {
              questionId: new ObjectId(questionId),
              lastRespondedBy: null,
              history: [],
              queue: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            questionSubmission =
              await this.questionSubmissionRepo.addSubmission(
                newSubmission,
                session,
              );
          } else {
            throw new NotFoundError('Question submission not found');
          }
        }

        // 3. Validate if the queue is full
        if (questionSubmission.queue.length >= 10)
          throw new BadRequestError(
            'Cannot allocate more than 10 experts for a question.',
          );

        const hasExistingExpert = experts.some(expertId =>
          questionSubmission.queue.includes(expertId),
        );

        // 4. Validate if the expert Id is already there in queue

        if (hasExistingExpert) {
          throw new BadRequestError(
            'The selected expert is already in the queue. Please choose another expert.',
          );
        }
        //5. Validate experts array
        if (!experts || experts.length === 0)
          throw new BadRequestError('Experts list cannot be empty');

        // Check if adding these experts exceeds the limit of 10
        const totalAllocatedExperts = questionSubmission.queue.length;
        if (totalAllocatedExperts + experts.length > 10)
          throw new BadRequestError(
            `Cannot allocate more than 10 experts. Currently allocated: ${totalAllocatedExperts}`,
          );

        // for (let expert of experts) {
        //   const IS_INCREMENT = true;
        //   await this.userRepo.updateReputationScore(
        //     expert,
        //     IS_INCREMENT,
        //     session,
        //   );
        // }

        //if manuall alloacation is first person

        if (questionSubmission.queue.length === 0) {
          const firstPerson = experts[0];
          const IS_INCREMENT = true;
          await this.userRepo.updateReputationScore(
            firstPerson.toString(),
            IS_INCREMENT,
            session,
          );
          let message = `A Question has been assigned for answering`;
          let title = 'Answer Creation Assigned';
          let entityId = questionId.toString();
          const user = firstPerson.toString();
          const type: INotificationType = 'answer_creation';
          await this.notificationService.saveTheNotifications(
            message,
            title,
            entityId,
            user,
            type,
          );
          await this.questionRepo.updateQuestion(
            questionId,
            {firstAllocationAt: new Date()},
            session,
          );
        }

        //6. Allocate experts
        // If the question is a duplicate and auto-allocate is OFF, it means the
        // moderator intentionally toggled off auto-allocate and is now manually
        // picking an expert. Reopen the question so the selected expert can see
        // it in their dashboard (only open/delayed questions are visible there).
        const updateData: any = {
          firstAllocationAt: new Date(),
        };
        if (question.status === 'duplicate') {
          updateData.status = 'open';
        }

        await this.questionRepo.updateQuestion(questionId, updateData, session);

        const expertIds = experts.map(e => new ObjectId(e));

        // if the last expert is  reviewing other question  (if status is not reviewed or not submitted an answer)
        const lastSubmission = questionSubmission.history.at(-1);
        if (
          questionSubmission.history.length >= 0 &&
          (lastSubmission?.answer || lastSubmission?.status == 'reviewed')
        ) {
          const expertId = expertIds[0];
          const userSubmissionData: ISubmissionHistory = {
            updatedBy: expertId,
            createdAt: new Date(),
            status: 'in-review',
            updatedAt: new Date(),
          };
          const IS_INCREMENT = true;
          await this.userRepo.updateReputationScore(
            expertId.toString(),
            IS_INCREMENT,
            session,
          );
          //need to add here
          let message = `A new Review has been assigned to you`;
          let title = 'New Review Assigned';
          let entityId = questionId.toString();
          const user = expertId.toString();
          const type: INotificationType = 'peer_review';
          await this.notificationService.saveTheNotifications(
            message,
            title,
            entityId,
            user,
            type,
          );
          await this.questionSubmissionRepo.update(
            questionId,
            userSubmissionData,
            session,
            false,
          );
        }
        //7. Update question submission with new experts
        const updated = await this.questionSubmissionRepo.allocateExperts(
          questionId,
          expertIds,
          session,
        );

        //8. For time-bound questions: start the 45-min clock.
        // NOTE: do NOT force isAutoAllocate back on here — a moderator who
        // explicitly turned auto-allocate off before assigning an expert must
        // have that choice respected (otherwise it silently re-enables on
        // refresh for AJRASAKHA/WHATSAPP questions).
        if (question.source === 'WHATSAPP' || question.source === 'AJRASAKHA') {
          // Run outside transaction (non-critical, fire-and-forget style)
          setImmediate(async () => {
            try {
              await this.questionSubmissionRepo.setCurrentExpertAllocatedAt(
                questionId,
                new Date(),
              );
            } catch (err: any) {
              console.error(
                `[allocateExperts] Failed to set time-bound fields for ${questionId}:`,
                err?.message,
              );
            }
          });
        }

        //9. Return updated question submission
        return updated;
      });
    } catch (error) {
      throw new InternalServerError(`Failed to allocate experts: ${error}`);
    }
  }

  /**
   * Bulk allocate a PAE expert to multiple existing draft questions via background worker.
   * Fires and returns immediately — the worker handles DB operations asynchronously.
   */
  async bulkAllocatePaeExperts(
    userId: string,
    questionIds: string[],
    paeExpertId: string,
  ): Promise<{jobId: string; message: string}> {
    // Validate actor and PAE expert before handing off to worker
    const actor = await this.userRepo.findById(userId);
    if (!actor) throw new UnauthorizedError('Cannot find user, try relogin!');
    if (actor.role === 'expert')
      throw new UnauthorizedError(
        "You don't have permission to perform this operation",
      );

    const paeUser = await this.userRepo.findById(paeExpertId);
    if (!paeUser) throw new BadRequestError('PAE expert not found');

    const jobId = startPaeAllocationWorker(questionIds, paeExpertId, userId);
    return {
      jobId,
      message: `PAE allocation started for ${questionIds.length} question(s). Track progress with job ID: ${jobId}`,
    };
  }

  // async removeExpertFromQueue(
  //   userId: string,
  //   questionId: string,
  //   index: number,
  //   options?: {
  //     skipAutoAllocate?: boolean;
  //   },
  //   session?: ClientSession,
  // ): Promise<IQuestionSubmission> {
  //   const skipAutoAllocate = options?.skipAutoAllocate ?? false;
  //   try {
  //     // return this._withTransaction(async (session: ClientSession) => {
  //     if (userId !== 'system') {
  //       const user = await this.userRepo.findById(userId, session);
  //       if (!user)
  //         throw new UnauthorizedError(`Cannot find user, try relogin!`);
  //       if (user.role == 'expert')
  //         throw new UnauthorizedError(
  //           `You don't have permission to perform this operation`,
  //         );
  //     }
  //     //1. Validate that the question exists
  //     const question = await this.questionRepo.getById(questionId, session);
  //     if (!question) throw new NotFoundError('Question not found');

  //     //2. Validate that the corresponding question submission exists
  //     const questionSubmission =
  //       await this.questionSubmissionRepo.getByQuestionId(questionId, session);
  //     if (!questionSubmission)
  //       throw new NotFoundError('Question submission not found');

  //     //3. Get the current expert queue from the question submission
  //     const submissionQueue = questionSubmission.queue || [];
  //     const submissionHistory = questionSubmission.history || [];
  //     //4. Extract the expert ID based on the provided index
  //     const expertId = submissionQueue[index]?.toString();
  //     //5. Decrease the expert's reputation score (since being removed)
  //     const nextUserId = submissionQueue[index + 1]?.toString();
  //     const isExpertInHistory = submissionHistory.find(
  //       h => h.updatedBy.toString() == expertId.toString(),
  //     );
  //     if (
  //       expertId &&
  //       isExpertInHistory &&
  //       !isExpertInHistory.reviewId &&
  //       isExpertInHistory.status === 'in-review'
  //     ) {
  //       const INCREMENT = false;
  //       await this.userRepo.updateReputationScore(expertId, INCREMENT, session);

  //       if (nextUserId) {
  //         const INCREMENT = true;
  //         await this.userRepo.updateReputationScore(
  //           nextUserId,
  //           INCREMENT,
  //           session,
  //         );
  //       }
  //     }
  //     if (submissionHistory.length === 0) {
  //       if (submissionQueue[0].toString() === expertId) {
  //         const IS_INCREMENT = false;
  //         await this.userRepo.updateReputationScore(
  //           expertId,
  //           IS_INCREMENT,
  //           session,
  //         );
  //         if (nextUserId) {
  //           const IS_INCREMENT = true;
  //           await this.userRepo.updateReputationScore(
  //             nextUserId,
  //             IS_INCREMENT,
  //             session,
  //           );
  //         }
  //       }
  //     }
  //     // } else {
  //     //   const matchUser = submissionHistory.find(
  //     //     u => u.updatedBy?.toString() === expertId,
  //     //   );
  //     //   if (matchUser) {
  //     //     const IS_INCREMENT = false;
  //     //     await this.userRepo.updateReputationScore(
  //     //       expertId,
  //     //       IS_INCREMENT,
  //     //       session,
  //     //     );
  //     //     if (nextUserId) {
  //     //       const IS_INCREMENT = true;
  //     //       await this.userRepo.updateReputationScore(
  //     //         nextUserId,
  //     //         IS_INCREMENT,
  //     //         session,
  //     //       );
  //     //     }
  //     //   }
  //     // }

  //     //6. Remove the expert from the queue by index
  //     const updated =
  //       await this.questionSubmissionRepo.removeExpertFromQueuebyIndex(
  //         questionId,
  //         Number(index),
  //         session,
  //       );
  //     /*  if(updated)
  //         {
  //           const IS_INCREMENT = true;
  //         const userId =updated.queue[0];
  //         await this.userRepo.updateReputationScore(
  //           userId.toString(),
  //           IS_INCREMENT,
  //           session,
  //         );
  //         }*/

  //     //7. Handle auto reallocation logic if autoAllocate is enabled
  //     if (!skipAutoAllocate && index >= 0 && question.isAutoAllocate) {
  //       // Get updated queue and history lengths
  //       const UPDATED_QUEUE_LENGTH = updated?.queue.length || 0;
  //       const UPDATED_HISTORY_LENGTH = updated?.history.length || 0;
  //       let BATCH_EXPECTED_TO_ADD = 6;

  //       // Adjust batch size if initial allocation (<3) experts are being removed
  //       if (UPDATED_QUEUE_LENGTH < 3)
  //         BATCH_EXPECTED_TO_ADD = 3 - UPDATED_QUEUE_LENGTH;

  //       // If all previous experts have responded and queue is not full, trigger auto allocation
  //       if (
  //         UPDATED_QUEUE_LENGTH < 3 ||
  //         (UPDATED_HISTORY_LENGTH == UPDATED_QUEUE_LENGTH &&
  //           UPDATED_QUEUE_LENGTH < 10)
  //       ) {
  //         await this.autoAllocateExperts(
  //           questionId,
  //           session,
  //           BATCH_EXPECTED_TO_ADD,
  //         );
  //       }
  //     }

  //     //8. Return the updated question submission
  //     return updated;
  //     // });
  //   } catch (error) {
  //     throw new InternalServerError(
  //       `Failed to remove expert from queue: ${error}`,
  //     );
  //   }
  // }

  async removeExpertFromQueue(
    userId: string,
    questionId: string,
    index: number,
    options?: {
      skipAutoAllocate?: boolean;
    },
    session?: ClientSession,
  ): Promise<IQuestionSubmission> {
    if (session) {
      return this._removeExpertFromQueue(
        userId,
        questionId,
        index,
        options,
        session,
      );
    }
    return this._withTransaction(async newSession => {
      return this._removeExpertFromQueue(
        userId,
        questionId,
        index,
        options,
        newSession,
      );
    });
  }

  async _removeExpertFromQueue(
    userId: string,
    questionId: string,
    index: number,
    options?: {
      skipAutoAllocate?: boolean;
    },
    session?: ClientSession,
  ): Promise<IQuestionSubmission> {
    const skipAutoAllocate = options?.skipAutoAllocate ?? false;
    try {
      if (userId !== 'system') {
        const user = await this.userRepo.findById(userId, session);
        if (!user)
          throw new UnauthorizedError(`Cannot find user, try relogin!`);
        if (user.role == 'expert')
          throw new UnauthorizedError(
            `You don't have permission to perform this operation`,
          );
      }
      //1. Validate that the question exists
      const question = await this.questionRepo.getById(questionId, session);
      if (!question) throw new NotFoundError('Question not found');

      //2. Validate that the corresponding question submission exists
      const questionSubmission =
        await this.questionSubmissionRepo.getByQuestionId(questionId, session);
      if (!questionSubmission)
        throw new NotFoundError('Question submission not found');

      //3. Get the current expert queue from the question submission
      const submissionQueue = questionSubmission.queue || [];
      const submissionHistory = questionSubmission.history || [];
      //4. Extract the expert ID based on the provided index
      const expertId = submissionQueue[index]?.toString();
      //5. Decrease the expert's reputation score (since being removed)
      const nextUserId = submissionQueue[index + 1]?.toString();
      const isExpertInHistory = submissionHistory.find(
        h => h.updatedBy.toString() == expertId.toString(),
      );
      if (
        expertId &&
        isExpertInHistory &&
        !isExpertInHistory.reviewId &&
        isExpertInHistory.status === 'in-review'
      ) {
        const INCREMENT = false;
        await this.userRepo.updateReputationScore(expertId, INCREMENT, session);

        if (nextUserId) {
          const INCREMENT = true;
          await this.userRepo.updateReputationScore(
            nextUserId,
            INCREMENT,
            session,
          );
        }
      }
      if (submissionHistory.length === 0) {
        if (submissionQueue[0].toString() === expertId) {
          const IS_INCREMENT = false;
          await this.userRepo.updateReputationScore(
            expertId,
            IS_INCREMENT,
            session,
          );
          if (nextUserId) {
            const IS_INCREMENT = true;
            await this.userRepo.updateReputationScore(
              nextUserId,
              IS_INCREMENT,
              session,
            );
            let entityId = questionId;
            let message: string = `A new Review has been assigned to you`;
            let title: string = 'New Review Assigned';
            let type: INotificationType = 'peer_review';
            await this.notificationService.saveTheNotifications(
              message,
              title,
              entityId,
              nextUserId,
              type,
            );
          }
        }
      }
      // } else {
      //   const matchUser = submissionHistory.find(
      //     u => u.updatedBy?.toString() === expertId,
      //   );
      //   if (matchUser) {
      //     const IS_INCREMENT = false;
      //     await this.userRepo.updateReputationScore(
      //       expertId,
      //       IS_INCREMENT,
      //       session,
      //     );
      //     if (nextUserId) {
      //       const IS_INCREMENT = true;
      //       await this.userRepo.updateReputationScore(
      //         nextUserId,
      //         IS_INCREMENT,
      //         session,
      //       );
      //     }
      //   }
      // }

      //6. Remove the expert from the queue by index
      const updated =
        await this.questionSubmissionRepo.removeExpertFromQueuebyIndex(
          questionId,
          Number(index),
          session,
        );
      if (updated) {
        let entityId = questionId;
        let message: string = `You have been removed from the Allocated question`;
        let title: string = 'Allocation Removed';
        let type: INotificationType = 'allocation_removal';
        await this.notificationService.saveTheNotifications(
          message,
          title,
          entityId,
          expertId,
          type,
        );
      }
      /*  if(updated)
          {
            const IS_INCREMENT = true;
          const userId =updated.queue[0];
          await this.userRepo.updateReputationScore(
            userId.toString(),
            IS_INCREMENT,
            session,
          );
          }*/

      //7. Handle auto reallocation logic if autoAllocate is enabled
      // if (!skipAutoAllocate && index >= 0 && question.isAutoAllocate) {
      //   // Get updated queue and history lengths
      //   const UPDATED_QUEUE_LENGTH = updated?.queue.length || 0;
      //   const UPDATED_HISTORY_LENGTH = updated?.history.length || 0;
      //   let BATCH_EXPECTED_TO_ADD = 6;

      //   // Adjust batch size if initial allocation (<3) experts are being removed
      //   if (UPDATED_QUEUE_LENGTH < 3)
      //     BATCH_EXPECTED_TO_ADD = 3 - UPDATED_QUEUE_LENGTH;

      //   // If all previous experts have responded and queue is not full, trigger auto allocation
      //   if (
      //     UPDATED_QUEUE_LENGTH < 3 ||
      //     (UPDATED_HISTORY_LENGTH == UPDATED_QUEUE_LENGTH &&
      //       UPDATED_QUEUE_LENGTH < 10)
      //   ) {
      //     await this.autoAllocateExperts(
      //       questionId,
      //       session,
      //       BATCH_EXPECTED_TO_ADD,
      //     );
      //   }
      // }

      //8. Return the updated question submission
      return updated;
    } catch (error) {
      throw new InternalServerError(
        `Failed to remove expert from queue: ${error}`,
      );
    }
  }

  /**
   * Replace an expert at a specific level/index in the queue or replace the author
   * This is used when a moderator wants to reassign a delayed review to a new expert
   */
  async replaceQueueExpert(
    userId: string,
    questionId: string,
    levelIndex: number,
    newExpertId: string,
    isAuthor?: boolean,
    reasonForChange?: string,
  ): Promise<IQuestionSubmission> {
    return this._withTransaction(async (session: ClientSession) => {
      // 1. Validate question exists
      const question = await this.questionRepo.getById(questionId, session);
      if (!question) {
        console.warn(`[replaceQueueExpert] Question not found: ${questionId}`);
        throw new NotFoundError('Question not found');
      }

      // 2. Get question submission
      const questionSubmission =
        await this.questionSubmissionRepo.getByQuestionId(questionId, session);
      if (!questionSubmission) {
        console.warn(
          `[replaceQueueExpert] Question submission not found: ${questionId}`,
        );
        throw new NotFoundError('Question submission not found');
      }

      // Handle Author replacement (column 0)
      if (isAuthor) {
        // Validate new expert exists
        const newExpert = await this.userRepo.findById(newExpertId, session);
        if (!newExpert) {
          console.warn(
            `[replaceQueueExpert] New expert not found: ${newExpertId}`,
          );
          throw new NotFoundError('New expert not found');
        }

        // Get current author ID
        const currentAuthorId = questionSubmission.queue[0];

        // Check if new expert is same as current author
        if (currentAuthorId === newExpertId) {
          console.warn(
            `[replaceQueueExpert] Cannot replace - new expert is same as current author`,
          );
          throw new BadRequestError(
            'The selected expert is already the author.',
          );
        }

        // Validate reasonForChange is provided
        if (!reasonForChange || reasonForChange.trim() === '') {
          console.warn(`[replaceQueueExpert] Reason for change not provided`);
          throw new BadRequestError('Reason for reallocation is required.');
        }

        const now = new Date();

        // Check for time constraint using authors_history or submission.createdAt
        let assignmentTime = questionSubmission.createdAt || now;
        const authorsHistory = question.authors_history || [];
        if (authorsHistory.length > 0) {
          // Use the last author replacement time
          assignmentTime = authorsHistory[authorsHistory.length - 1].createdAt;
        }

        const hoursSinceAssignment =
          (now.getTime() - new Date(assignmentTime).getTime()) /
          (1000 * 60 * 60);

        if (hoursSinceAssignment < 2) {
          const remainingMinutes = Math.ceil((2 - hoursSinceAssignment) * 60);
          throw new BadRequestError(
            `Reallocation denied. At least 2 hours must pass since the author was assigned. Please wait approximately ${remainingMinutes} more minutes.`,
          );
        }

        // Create authors_history entry for the old author being replaced
        const authorsHistoryEntry: IAuthorsHistory = {
          authorId: new ObjectId(currentAuthorId!),
          newAuthorId: new ObjectId(newExpertId),
          reasonForChange: reasonForChange,
          createdAt: now,
          updatedAt: now,
        };

        // Fetch current question to get existing authors_history
        const currentQuestion = await this.questionRepo.getById(
          questionId,
          session,
        );
        const existingHistory = currentQuestion.authors_history || [];

        const questionUpdates: Partial<IQuestion> = {
          userId: new ObjectId(newExpertId),
          authors_history: [...existingHistory, authorsHistoryEntry],
        };

        if (question.isOnHold) {
          const prevAccum = question.accumulatedHoldMs ?? 0;
          let segmentMs = 0;
          if (question.holdAt) {
            segmentMs = Math.max(
              0,
              now.getTime() - new Date(question.holdAt).getTime(),
            );
          }
          questionUpdates.isOnHold = false;
          questionUpdates.status = 'open';
          questionUpdates.accumulatedHoldMs = prevAccum + segmentMs;
          questionUpdates.holdAt = null;
        }

        // Update question's userId (author) and append to authors_history
        await this.questionRepo.updateQuestion(
          questionId,
          questionUpdates,
          session,
        );

        // ALSO update the queue[0] (author position in queue) - THIS WAS MISSING!
        let updatedQueue = questionSubmission.queue;
        if (questionSubmission.queue.length > 0) {
          const oldQueueAuthor = questionSubmission.queue[0]?.toString();
          updatedQueue = questionSubmission.queue.map((id, idx) =>
            idx === 0 ? new ObjectId(newExpertId) : new ObjectId(id.toString()),
          );
        } else {
          console.warn(
            `[replaceQueueExpert] Queue is empty, cannot update queue[0]`,
          );
        }

        // Update the question submission with queue only (history unchanged for author replacement)

        const updateResult = await this.questionSubmissionRepo.updateById(
          questionSubmission._id!.toString(),
          {
            $set: {
              queue: updatedQueue,
              updatedAt: now,
            },
          },
          session,
        );

        // Also update the answer's authorId (the initial answer created with the question)
        const answers = await this.answerRepo.getByQuestionId(
          questionId,
          session,
        );
        const initialAnswer = answers.find(
          a => a.answerIteration === 0 || a.isFinalAnswer === false,
        );
        if (initialAnswer && initialAnswer._id) {
          await this.answerRepo.updateAnswer(
            initialAnswer._id.toString(),
            {authorId: new ObjectId(newExpertId)},
            session,
          );
        }

        try {
          // Prepare notification data
          const truncatedQuestionText = this.truncateQuestionText(
            question.question,
          );
          const entityId = questionId.toString();
          const type: INotificationType = 'expert_replacement';

          const replacedExpertMessage = `You have been removed from the question "${truncatedQuestionText}". Reason: ${reasonForChange}`;
          const replacedExpertTitle = 'Question Assignment Removed';

          const newExpertMessage = `You have been assigned a new question: "${truncatedQuestionText}" as the author.`;
          const newExpertTitle = 'New Question Assigned';

          // Execute all operations in parallel
          await Promise.all([
            // 1. Assign penalty to replaced expert
            this.userService.updatePenaltyAndIncentive(
              currentAuthorId!.toString(),
              'penalty',
            ),

            // 2. Assign incentive to new expert
            this.userService.updatePenaltyAndIncentive(
              newExpertId,
              'incentive',
            ),

            // 3. Send notification to replaced expert (with error handling)
            this.notificationService
              .saveTheNotifications(
                replacedExpertMessage,
                replacedExpertTitle,
                entityId,
                currentAuthorId!.toString(),
                type,
              )
              .catch(notificationError => {
                console.error(
                  `[replaceQueueExpert] ❌ Failed to send notification to replaced author: ${currentAuthorId}`,
                  notificationError,
                );
                // Return resolved promise to not break Promise.all
                return Promise.resolve();
              }),

            // 4. Send notification to new expert (with error handling)
            this.notificationService
              .saveTheNotifications(
                newExpertMessage,
                newExpertTitle,
                entityId,
                newExpertId,
                type,
              )
              .catch(notificationError => {
                console.error(
                  `[replaceQueueExpert] ❌ Failed to send notification to new expert: ${newExpertId}`,
                  notificationError,
                );
                // Return resolved promise to not break Promise.all
                return Promise.resolve();
              }),
          ]);
        } catch (penaltyError) {
          console.error(
            `[replaceQueueExpert] Penalty/incentive update failed:`,
            penaltyError,
          );
          throw new InternalServerError(
            'Failed to update penalty/incentive scores. Operation rolled back.',
          );
        }

        // Return updated submission
        return updateResult;
      }

      // Handle Queue Expert replacement (Level 1, 2, etc.) - Reallocation Logic
      // 3. Validate levelIndex is within queue bounds (convert to 0-based for queue access)
      const queueIndex = levelIndex;
      if (queueIndex < 0 || queueIndex >= questionSubmission.queue.length) {
        console.warn(
          `[replaceQueueExpert] Invalid level index: ${levelIndex}, queue has ${questionSubmission.queue.length} experts`,
        );
        throw new BadRequestError(
          `Invalid level index. Queue has ${questionSubmission.queue.length} experts.`,
        );
      }

      // Step 1: Identify Last Reviewer from history and validate queue ownership
      const lastHistoryEntry =
        questionSubmission.history[questionSubmission.history.length - 1];
      const lastReviewerInQueue = lastHistoryEntry?.updatedBy?.toString();
      const currentExpertId = questionSubmission.queue[queueIndex]?.toString();

      // Validate that the reviewer to be replaced matches the current active reviewer
      // The last reviewer in queue must be the one being replaced (validation rule)
      if (currentExpertId !== lastReviewerInQueue) {
        console.warn(
          `[replaceQueueExpert] Queue validation failed - current expert ${currentExpertId} does not match last reviewer ${lastReviewerInQueue}`,
        );
        throw new BadRequestError(
          'Reallocation denied. The reviewer to be replaced must be the last assigned reviewer in the queue.',
        );
      }

      // 4. Check if this is the current active level (only current can be replaced)
      // Current active level is determined by history length (convert to 1-based since controller sends 1-based)
      const currentActiveIndex = questionSubmission.history.length - 1;

      if (levelIndex !== currentActiveIndex) {
        console.warn(
          `[replaceQueueExpert] Cannot replace - level ${levelIndex} is not active (active: ${currentActiveIndex})`,
        );
        throw new BadRequestError(
          'Can only replace the expert at the current active level. This level has already been completed or is not yet active.',
        );
      }

      // Step 2: Fetch History and perform validations
      const submissionHistory = questionSubmission.history || [];
      const now = new Date();

      // Find the history entry for the current expert being replaced
      let currentExpertHistoryIndex = -1;
      let currentExpertHistoryEntry: ISubmissionHistory | null = null;

      for (let i = 0; i < submissionHistory.length; i++) {
        const historyEntry = submissionHistory[i];
        if (historyEntry.updatedBy.toString() === currentExpertId) {
          currentExpertHistoryIndex = i;
          currentExpertHistoryEntry = historyEntry;
          break;
        }
      }

      // Use the found history entry or create a default one for validation
      const validationHistoryEntry =
        currentExpertHistoryEntry ||
        submissionHistory[submissionHistory.length - 1];

      // Time Constraint Validation: At least 2 hours must have passed since assignment (if history exists)
      if (validationHistoryEntry) {
        const lastAssignmentTime = new Date(validationHistoryEntry.createdAt);
        const hoursSinceAssignment =
          (now.getTime() - lastAssignmentTime.getTime()) / (1000 * 60 * 60);

        if (hoursSinceAssignment < 2) {
          console.warn(
            `[replaceQueueExpert] Time constraint not met - only ${hoursSinceAssignment.toFixed(2)} hours since assignment (requires 2 hours)`,
          );
          const remainingMinutes = Math.ceil((2 - hoursSinceAssignment) * 60);
          throw new BadRequestError(
            `Reallocation denied. At least 2 hours must pass since the review was assigned. Please wait approximately ${remainingMinutes} more minutes.`,
          );
        }

        // Review Status Validation: The submission must still be in 'in-review' state
        if (validationHistoryEntry.status !== 'in-review') {
          console.warn(
            `[replaceQueueExpert] Status validation failed - current status is ${validationHistoryEntry.status}, expected 'in-review'`,
          );
          throw new BadRequestError(
            `Reallocation denied. The review status is '${validationHistoryEntry.status}'. Only reviews in 'in-review' status can be reallocated.`,
          );
        }
      }

      // Validate reasonForChange is provided
      if (!reasonForChange || reasonForChange.trim() === '') {
        console.warn(`[replaceQueueExpert] Reason for change not provided`);
        throw new BadRequestError('Reason for reallocation is required.');
      }

      // 5. Validate new expert exists
      const newExpert = await this.userRepo.findById(newExpertId, session);
      if (!newExpert) {
        console.warn(
          `[replaceQueueExpert] New expert not found: ${newExpertId}`,
        );
        throw new NotFoundError('New expert not found');
      }
      // 6. Check if new expert is already in queue
      const existingQueueIds = questionSubmission.queue.map(id =>
        id.toString(),
      );
      if (existingQueueIds.includes(newExpertId)) {
        console.warn(
          `[replaceQueueExpert] Expert ${newExpertId} already in queue`,
        );
        throw new BadRequestError(
          'The selected expert is already in the queue. Please choose another expert.',
        );
      }

      // Step 3: Create Previous Allocation Record
      const previousAllocation: IPreviousAllocations = {
        reviewerId: new ObjectId(currentExpertId!),
        reasonForChange: reasonForChange,
        createdAt: currentExpertHistoryEntry?.createdAt || now,
        updatedAt: now,
      };

      // Step 4: Update Queue - Replace the expert at the specified index
      const updatedQueue = questionSubmission.queue.map((id, idx) => {
        const shouldReplace = idx === queueIndex;
        const resultId = shouldReplace
          ? new ObjectId(newExpertId)
          : new ObjectId(id.toString());
        return resultId;
      });

      // Step 5: Build updated history with previousAllocations
      const updatedHistory = [...submissionHistory];

      if (currentExpertHistoryIndex !== -1 && currentExpertHistoryEntry) {
        // Update existing history entry with previousAllocations
        const updatedPreviousAllocations = [
          ...(currentExpertHistoryEntry.previousAllocations || []),
          previousAllocation,
        ];
        const updatedExpertHistory: ISubmissionHistory = {
          ...currentExpertHistoryEntry,
          updatedBy: new ObjectId(newExpertId), // Replace with new expert ID
          previousAllocations: updatedPreviousAllocations,
          createdAt: now, // Update both timestamps as requested
          updatedAt: now,
        };
        updatedHistory[currentExpertHistoryIndex] = updatedExpertHistory;
      } else {
        // No history entry found for current expert - create one with new expert
        const newExpertHistoryEntry: ISubmissionHistory = {
          updatedBy: new ObjectId(newExpertId), // Create with new expert directly
          status: 'in-review',
          previousAllocations: [previousAllocation],
          createdAt: now,
          updatedAt: now,
        };
        updatedHistory.push(newExpertHistoryEntry);
      }

      // Update database with queue and history changes
      const updateData: any = {
        $set: {
          queue: updatedQueue,
          history: updatedHistory,
          updatedAt: now,
        },
      };

      if (question.isOnHold) {
        const prevAccum = question.accumulatedHoldMs ?? 0;
        let segmentMs = 0;
        if (question.holdAt) {
          segmentMs = Math.max(
            0,
            now.getTime() - new Date(question.holdAt).getTime(),
          );
        }
        await this.questionRepo.updateQuestion(
          questionId,
          {
            isOnHold: false,
            status: 'open',
            accumulatedHoldMs: prevAccum + segmentMs,
            holdAt: null,
          },
          session,
        );
      }

      const updated = await this.questionSubmissionRepo.updateById(
        questionSubmission._id!.toString(),
        updateData,
        session,
      );

      try {
        // Prepare notification data
        const truncatedQuestionText = this.truncateQuestionText(
          question.question,
        );
        const entityId = questionId.toString();
        const type: INotificationType = 'expert_replacement';

        const replacedExpertMessage = `You have been removed from level ${levelIndex} review of question "${truncatedQuestionText}".`;
        const replacedExpertTitle = 'Review Assignment Removed';

        const newExpertMessage = `You have been assigned level ${levelIndex} review for question: "${truncatedQuestionText}".`;
        const newExpertTitle = 'New Review Assigned';

        // Execute all operations in parallel
        await Promise.all([
          // 1. Assign penalty to replaced expert
          this.userService.updatePenaltyAndIncentive(
            currentExpertId,
            'penalty',
          ),

          // 2. Assign incentive to new expert
          this.userService.updatePenaltyAndIncentive(newExpertId, 'incentive'),

          // 3. Send notification to replaced expert (with error handling)
          this.notificationService
            .saveTheNotifications(
              replacedExpertMessage,
              replacedExpertTitle,
              entityId,
              currentExpertId,
              type,
            )
            .catch(notificationError => {
              console.error(
                `[replaceQueueExpert] ❌ Failed to send notification to replaced expert: ${currentExpertId}`,
                notificationError,
              );
              // Return resolved promise to not break Promise.all
              return Promise.resolve();
            }),

          // 4. Send notification to new expert (with error handling)
          this.notificationService
            .saveTheNotifications(
              newExpertMessage,
              newExpertTitle,
              entityId,
              newExpertId,
              type,
            )
            .catch(notificationError => {
              console.error(
                `[replaceQueueExpert] ❌ Failed to send notification to new expert: ${newExpertId}`,
                notificationError,
              );
              // Return resolved promise to not break Promise.all
              return Promise.resolve();
            }),
        ]);
      } catch (penaltyError) {
        console.error(
          `[replaceQueueExpert] Penalty/incentive update failed for queue expert:`,
          penaltyError,
        );
        throw new InternalServerError(
          'Failed to update penalty/incentive scores. Operation rolled back.',
        );
      }

      return updated;
    });
  }

  async runAbsentScript() {
    return await this._withTransaction(async session => {
      try {
        const absentExpertIds = await this.findAbsentExperts(session);
        console.log('absent experts ', absentExpertIds);
        if (!absentExpertIds.length) return;
        await this.userRepo.blockExperts(absentExpertIds, session);
        await this.cleanupQuestionSubmissions(absentExpertIds, session);
      } catch (error) {
        throw new InternalServerError(
          `Daily reviewer cleanup failed: ${error}`,
        );
      }
    });
  }

  async findAbsentExperts(session: ClientSession): Promise<string[]> {
    const experts = await this.userRepo.findUnblockedUsers(session);
    return experts
      .filter(expert => !isToday(expert.lastCheckInAt))
      .map(expert => expert._id.toString());
  }

  async cleanupQuestionSubmissions(
    absentExpertIds: string[],
    session: ClientSession,
  ): Promise<void> {
    if (!absentExpertIds.length) return;

    const submissions = await this.questionSubmissionRepo.getAbsentSubmissions(
      absentExpertIds,
      session,
    );
    for (const submission of submissions) {
      const {questionId, queue = [], history = []} = submission;

      if (!queue.length) continue;
      const indicesToRemove = new Set<number>();
      if (
        history.length === 0 &&
        queue[0] &&
        absentExpertIds.includes(queue[0].toString())
      ) {
        indicesToRemove.add(0);
      }
      if (history.length > 0) {
        const pendingIndex = history.length - 1;
        const expertId = queue[pendingIndex]?.toString();

        if (expertId && absentExpertIds.includes(expertId)) {
          indicesToRemove.add(pendingIndex);
        }
      }
      for (let index = history.length; index < queue.length; index++) {
        const expertId = queue[index]?.toString();
        if (!expertId) continue;

        if (absentExpertIds.includes(expertId)) {
          indicesToRemove.add(index);
        }
      }
      if (!indicesToRemove.size) continue;
      const sortedIndices = Array.from(indicesToRemove).sort((a, b) => b - a);
      for (const index of sortedIndices) {
        console.log(
          'Removing expert from question',
          questionId.toString(),
          'at index',
          index,
        );

        await this.removeExpertFromQueue(
          'system',
          questionId.toString(),
          index,
          {skipAutoAllocate: true},
          session,
        );
      }
      const question = await this.questionRepo.getById(
        questionId.toString(),
        session,
      );

      // Do NOT reset isAutoAllocate here. If a moderator deliberately turned off
      // auto-allocation for this question, that decision must be respected even
      // when the absent-expert cleanup removes experts from the queue.
      // Only attempt re-allocation when the question still has isAutoAllocate: true.
      if (!question.isAutoAllocate) {
        console.log(
          `[AbsentExpert] Skipping auto-reallocation for question ${questionId} — isAutoAllocate is false (moderator override).`,
        );
        continue;
      }

      const latestSubmission =
        await this.questionSubmissionRepo.getByQuestionId(
          questionId.toString(),
          session,
        );

      const UPDATED_QUEUE_LENGTH = latestSubmission.queue.length || 0;
      const UPDATED_HISTORY_LENGTH = latestSubmission.history.length || 0;
      if (UPDATED_QUEUE_LENGTH === 0) {
        // if (question?.isAutoAllocate) {
        await this.autoAllocateExperts(
          questionId.toString(),
          session,
          // 3
        );
        // }
        continue;
      }

      // let BATCH_EXPECTED_TO_ADD = 6;
      // if (UPDATED_QUEUE_LENGTH < 3) {
      //   BATCH_EXPECTED_TO_ADD = 3 - UPDATED_QUEUE_LENGTH;
      // }
      if (
        UPDATED_QUEUE_LENGTH < DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT ||
        (UPDATED_QUEUE_LENGTH === UPDATED_HISTORY_LENGTH &&
          UPDATED_QUEUE_LENGTH < 10)
      ) {
        await this.autoAllocateExperts(
          questionId.toString(),
          session,
          // BATCH_EXPECTED_TO_ADD,
        );
      }
    }
    console.log('Completed!');
  }

  async balanceWorkload_copy() {
    return await this._withTransaction(async session => {
      try {
        const lessWorkloadExperts =
          await this.userRepo.findActiveLowReputationExpertsToday(session);
        const MAX_PER_EXPERT = 5;
        const maxAssignments = lessWorkloadExperts.length * MAX_PER_EXPERT;
        if (!lessWorkloadExperts.length) {
          return {
            message: 'No Expert present to Reallocate question ',
            expertsInvolved: 0,
            submissionsProcessed: 0,
          };
        }

        const delayedSubmissions =
          await this.questionSubmissionRepo.findQuestionsNeedingEscalation(
            maxAssignments,
            session,
          );
        if (!delayedSubmissions.length) {
          return {
            message: 'No delayed questions present to Reallocate',
            expertsInvolved: 0,
            submissionsProcessed: 0,
          };
        }

        //  const submissionsToProcess = delayedSubmissions.slice(0, maxAssignments);

        // -----------------------------
        // 🎯 Round Robin Distribution
        // -----------------------------
        /* const assignments: Record<string, any[]> = {};
        lessWorkloadExperts.forEach(e => (assignments[e._id.toString()] = []));
  
        let expertIndex = 0;
        for (const submission of submissionsToProcess) {
          const expert = lessWorkloadExperts[expertIndex];
          assignments[expert._id.toString()].push(submission);
          expertIndex = (expertIndex + 1) % lessWorkloadExperts.length;
        }*/
        // -----------------------------
        // 🎯 Smart Round Robin Distribution
        // -----------------------------
        const assignments: Record<string, any[]> = {};
        const expertLoad: Record<string, number> = {};

        lessWorkloadExperts.forEach(e => {
          const id = e._id.toString();
          assignments[id] = [];
          expertLoad[id] = 0;
        });

        let expertIndex = 0;
        console.log(
          'the assignments coming=====',
          delayedSubmissions.length,
          assignments,
        );
        console.log('the delayed questions====', expertLoad);

        for (const submission of delayedSubmissions) {
          let attempts = 0;
          let assigned = false;

          // Build a set of experts who already handled this submission
          const historyExpertIds = new Set(
            (submission.history || []).map(h => h.updatedBy?.toString()),
          );

          /*const queueExpertIds = new Set(
    (submission.queue || []).map(q => q.toString()),
  );*/
          const firstExpertId = submission.queue?.[0]?.toString();
          const queueExpertIds = new Set(firstExpertId ? [firstExpertId] : []);

          while (attempts < lessWorkloadExperts.length && !assigned) {
            const expert = lessWorkloadExperts[expertIndex];
            const expertId = expert._id.toString();

            const alreadyInHistory = historyExpertIds.has(expertId);
            const alreadyInQueue = queueExpertIds.has(expertId);
            const overloaded = expertLoad[expertId] >= MAX_PER_EXPERT;

            if (!alreadyInHistory && !alreadyInQueue && !overloaded) {
              assignments[expertId].push(submission);
              expertLoad[expertId]++;
              assigned = true;
            }

            expertIndex = (expertIndex + 1) % lessWorkloadExperts.length;
            attempts++;
          }

          if (!assigned) {
            console.warn(
              `No eligible expert found for submission ${submission._id}`,
            );
            // Optional: push to fallback/manual bucket
          }
        }
        const totalAssigned = Object.values(assignments).reduce(
          (sum, arr) => sum + arr.length,
          0,
        );

        // -----------------------------
        // 🔄 Process Each Assignment
        // -----------------------------
        for (const expertId in assignments) {
          const expertSubmissions = assignments[expertId];

          for (const submission of expertSubmissions) {
            const submissionId = submission._id;
            const queue = submission.queue || [];
            const history = submission.history || [];
            const now = new Date();

            // =========================
            // 🟢 TYPE A — No History
            // =========================
            if (history.length === 0) {
              const firstExpert = queue[0]?.toString();

              // Penalize only first queued expert
              if (firstExpert) {
                await this.userRepo.updateReputationScore(
                  firstExpert,
                  false,
                  session,
                );
              }

              await this.questionSubmissionRepo.updateById(
                submissionId,
                {
                  $set: {
                    queue: [new ObjectId(expertId)],
                    createdAt: now,
                    updatedAt: now,
                  },
                },
                session,
              );

              await this.userRepo.updateReputationScore(
                expertId,
                true,
                session,
              );

              await this.notificationService.saveTheNotifications(
                'A Question has been assigned for answering',
                'Answer Creation Assigned',
                submission.questionId.toString(),
                expertId,
                'answer_creation',
              );

              continue;
            }

            // =========================
            // 🔵 TYPE B — Has History
            // =========================
            const lastHistory = history[history.length - 1];

            if (lastHistory?.status === 'in-review') {
              const stuckExpertId = lastHistory.updatedBy?.toString();

              // Find stuck expert index
              const stuckIndex = queue.findIndex(
                q => q.toString() === stuckExpertId,
              );

              // Keep only experts before stuck one
              const newQueue =
                stuckIndex > -1 ? queue.slice(0, stuckIndex) : [];

              // Add new expert
              newQueue.push(new ObjectId(expertId));
              // rebuild history safely
              const updatedHistory = history.slice(0, -1);
              updatedHistory.push({
                updatedBy: new ObjectId(expertId),
                status: 'in-review',
                createdAt: now,
                updatedAt: now,
              });

              await this.questionSubmissionRepo.updateById(
                submissionId,
                {
                  $set: {
                    queue: newQueue,
                    history: updatedHistory,
                    updatedAt: now,
                  },
                },
                session,
              );

              // Penalize stuck expert
              if (stuckExpertId) {
                await this.userRepo.updateReputationScore(
                  stuckExpertId,
                  false,
                  session,
                );
              }

              // Reward new expert
              await this.userRepo.updateReputationScore(
                expertId,
                true,
                session,
              );
              await this.notificationService.saveTheNotifications(
                'A new Review has been assigned to you',
                'New Review Assigned',
                submission.questionId.toString(),
                expertId,
                'peer_review',
              );
            }
          }
        }
        return {
          message: 'Successfully ReAllocated delayed Questions',
          expertsInvolved: lessWorkloadExperts.length,
          submissionsProcessed: totalAssigned,
        };
      } catch (error) {
        throw new InternalServerError(`Failed to balance workload: ${error}`);
      }
    });
  }

  async balanceWorkload(
    session?: ClientSession,
    type?: string,
  ): Promise<{
    message: string;
    expertsInvolved: number;
    submissionsProcessed: number;
    inactiveExpertsFound?: number;
  }> {
    console.log(`[QuestionService] balanceWorkload called with type: ${type}`);

    // ==========================================
    // 🚩 Path 1: Inactive to Active Reallocation
    // ==========================================
    if (type === 'inactive') {
      const lessWorkloadExperts =
        await this.userRepo.findActiveLowReputationExpertsToday(session);
      console.log(
        `[QuestionService] [Path 1] Found ${lessWorkloadExperts.length} active experts for replacement`,
      );

      if (!lessWorkloadExperts.length) {
        return {
          message:
            'No active experts with low workload available for balancing',
          expertsInvolved: 0,
          submissionsProcessed: 0,
        };
      }

      const inactiveExperts =
        await this.userRepo.findInactiveOrBlockedExperts(session);
      const inactiveExpertIds = inactiveExperts.map(u => u._id.toString());

      console.log(
        `[QuestionService] [Path 1] Found ${inactiveExpertIds.length} inactive/blocked experts to clean`,
      );

      if (inactiveExpertIds.length === 0) {
        return {
          message: 'No inactive or blocked experts found',
          expertsInvolved: lessWorkloadExperts.length,
          submissionsProcessed: 0,
        };
      }

      const targetSubmissions =
        await this.questionSubmissionRepo.findSubmissionsWithExpertsInQueue(
          inactiveExpertIds,
          session,
        );
      console.log(
        `[QuestionService] [Path 1] Found ${targetSubmissions.length} active tasks owned by inactive experts`,
      );

      if (!targetSubmissions.length) {
        return {
          message: 'No active tasks found for inactive experts',
          expertsInvolved: lessWorkloadExperts.length,
          submissionsProcessed: 0,
        };
      }

      const assignments: Record<string, any[]> = {};
      const expertLoad: Record<string, number> = {};
      const MAX_PER_EXPERT = 5;

      lessWorkloadExperts.forEach(e => {
        const id = e._id.toString();
        assignments[id] = [];
        expertLoad[id] = 0;
      });

      let expertIndex = 0;

      for (const submission of targetSubmissions) {
        let attempts = 0;
        let assigned = false;

        const historyExpertIds = new Set(
          (submission.history || []).map(h => h.updatedBy?.toString()),
        );
        const currentQueueIds = new Set(
          (submission.queue || []).map(id => id.toString()),
        );

        while (attempts < lessWorkloadExperts.length && !assigned) {
          const expert = lessWorkloadExperts[expertIndex];
          const expertId = expert._id.toString();

          if (
            !historyExpertIds.has(expertId) &&
            !currentQueueIds.has(expertId) &&
            expertLoad[expertId] < MAX_PER_EXPERT
          ) {
            assignments[expertId].push(submission);
            expertLoad[expertId]++;
            assigned = true;
          }

          expertIndex = (expertIndex + 1) % lessWorkloadExperts.length;
          attempts++;
        }
      }

      const flatAssignments: {submissionId: string; expertId: string}[] = [];
      for (const expertId in assignments) {
        for (const submission of assignments[expertId]) {
          flatAssignments.push({
            submissionId: submission._id.toString(),
            expertId,
          });
        }
      }

      startBalanceWorkloadWorkers(flatAssignments, inactiveExpertIds);

      return {
        message: 'Inactive-to-Active reallocation started in background',
        inactiveExpertsFound: inactiveExpertIds.length,
        expertsInvolved: lessWorkloadExperts.length,
        submissionsProcessed: flatAssignments.length,
      };
    }

    // ==========================================
    // 🚩 Path 2: Default ReAllocate (Escalation)
    // ==========================================
    else {
      const lessWorkloadExperts =
        await this.userRepo.findActiveLowReputationExpertsToday(session);

      console.log(
        `[QuestionService] Found ${lessWorkloadExperts.length} active experts with low workload`,
      );

      const MAX_PER_EXPERT = 5;
      const maxAssignments = lessWorkloadExperts.length * MAX_PER_EXPERT;

      if (!lessWorkloadExperts.length) {
        return {
          message:
            'No Expert Present To Reallocate Questions .No action needed.',
          expertsInvolved: 0,
          submissionsProcessed: 0,
        };
      }

      const delayedSubmissions =
        await this.questionSubmissionRepo.findQuestionsNeedingEscalation(
          maxAssignments,
          session,
        );

      console.log(
        `[QuestionService] Found ${delayedSubmissions.length} delayed submissions needing escalation`,
      );

      if (!delayedSubmissions.length) {
        return {
          message:
            'No questions are pending allocation for more than one hour. No action needed.',
          expertsInvolved: 0,
          submissionsProcessed: 0,
        };
      }

      await this._withTransaction(async session => {
        for (const submission of delayedSubmissions as any[]) {
          const question = submission.question;
          if (question && question.isOnHold) {
            const now = new Date();
            const prevAccum = question.accumulatedHoldMs ?? 0;
            let segmentMs = 0;
            if (question.holdAt) {
              segmentMs = Math.max(
                0,
                now.getTime() - new Date(question.holdAt).getTime(),
              );
            }
            await this.questionRepo.updateQuestion(
              question._id.toString(),
              {
                isOnHold: false,
                status: 'open',
                accumulatedHoldMs: prevAccum + segmentMs,
                holdAt: null,
              },
              session,
            );
          }
        }
      });

      const assignments: Record<string, any[]> = {};
      const expertLoad: Record<string, number> = {};

      lessWorkloadExperts.forEach(e => {
        const id = e._id.toString();
        assignments[id] = [];
        expertLoad[id] = 0;
      });

      let expertIndex = 0;

      for (const submission of delayedSubmissions) {
        let attempts = 0;
        let assigned = false;

        const historyExpertIds = new Set(
          (submission.history || []).map(h => h.updatedBy?.toString()),
        );
        const firstExpertId = submission.queue?.[0]?.toString();
        const queueExpertIds = new Set(firstExpertId ? [firstExpertId] : []);

        while (attempts < lessWorkloadExperts.length && !assigned) {
          const expert = lessWorkloadExperts[expertIndex];
          const expertId = expert._id.toString();

          if (
            !historyExpertIds.has(expertId) &&
            !queueExpertIds.has(expertId) &&
            expertLoad[expertId] < MAX_PER_EXPERT
          ) {
            assignments[expertId].push(submission);
            expertLoad[expertId]++;
            assigned = true;
          } else {
            console.log(
              `[QuestionService] Skipping expert ${expertId} for submission ${submission._id}: alreadyInHistory=${historyExpertIds.has(expertId)}, alreadyInQueue=${queueExpertIds.has(expertId)}, load=${expertLoad[expertId]}`,
            );
          }

          expertIndex = (expertIndex + 1) % lessWorkloadExperts.length;
          attempts++;
        }
      }

      const flatAssignments: {submissionId: string; expertId: string}[] = [];

      for (const expertId in assignments) {
        for (const submission of assignments[expertId]) {
          flatAssignments.push({
            submissionId: submission._id.toString(),
            expertId,
          });
        }
      }

      console.log(
        `[QuestionService] Created ${flatAssignments.length} reallocation assignments`,
      );

      if (flatAssignments.length > 0) {
        startBalanceWorkloadWorkers(flatAssignments);
      }
      return {
        message: 'Workload balancing started in background',
        expertsInvolved: lessWorkloadExperts.length,
        submissionsProcessed: flatAssignments.length,
      };
    }
  }

  async getReallocationPreview(type: string): Promise<any> {
    return this._withTransaction(async session => {
      let questions: any[] = [];
      let inactiveExpertIds: string[] = [];
      const activeExperts =
        await this.userRepo.findActiveLowReputationExpertsToday(session);

      if (type === 'inactive') {
        const inactiveExperts =
          await this.userRepo.findInactiveOrBlockedExperts(session);
        inactiveExpertIds = inactiveExperts.map(e => e._id.toString());

        if (inactiveExpertIds.length > 0) {
          const INACTIVE_PREVIEW_LIMIT = 50;
          questions =
            await this.questionSubmissionRepo.findSubmissionsWithExpertsInQueue(
              inactiveExpertIds,
              session,
              INACTIVE_PREVIEW_LIMIT,
            );
        }
      } else {
        // escalation - show questions that are delayed (1+ hour)
        // We fetch a generous amount for the manual preview
        const ESCALATION_LIMIT = 50;
        questions =
          await this.questionSubmissionRepo.findQuestionsNeedingEscalation(
            ESCALATION_LIMIT,
            session,
          );
      }

      // Identify experts name and status for display
      const expertInfoMap = new Map<
        string,
        {name: string; status: string; isBlocked: boolean}
      >();
      if (questions.length > 0) {
        // Collect all expert IDs in queues
        const allExpertIdsInQueues = new Set<string>();
        questions.forEach(q => {
          q.queue?.forEach((id: any) =>
            allExpertIdsInQueues.add(id.toString()),
          );
        });

        const experts = await this.userRepo.getUsersByIds(
          Array.from(allExpertIdsInQueues),
          session,
        );
        experts.forEach(e =>
          expertInfoMap.set(e._id.toString(), {
            name: `${e.firstName || ''} ${e.lastName || ''}`.trim(),
            status: e.status || 'unknown',
            isBlocked: !!e.isBlocked,
          }),
        );
      }

      // Populate question text and identify current "responsible" expert
      const populatedQuestions = (
        await Promise.all(
          questions.map(async submission => {
            let questionText = '';
            try {
              const question = await this.questionRepo.getById(
                submission.questionId.toString(),
                session,
              );
              if (!question) return null; // Skip if question document is deleted
              questionText = question.question;
            } catch (err) {
              console.error(
                `[QuestionService] Failed to fetch question ${submission.questionId}:`,
                err,
              );
              return null; // Skip on error to avoid invalid entries
            }

            let currentExpertId = null;
            const targetExpertIdsSet = new Set(inactiveExpertIds);

            if (type === 'inactive') {
              // Identify which inactive expert is currently assigned
              const historyLength = (submission.history || []).length;
              const currentInQueue = submission.queue?.[historyLength];

              if (
                currentInQueue &&
                targetExpertIdsSet.has(currentInQueue.toString())
              ) {
                currentExpertId = currentInQueue.toString();
              } else {
                // Fallback: search queue for any inactive/blocked expert
                const targetInQueue = submission.queue?.find(id =>
                  targetExpertIdsSet.has(id.toString()),
                );
                if (targetInQueue) {
                  currentExpertId = targetInQueue.toString();
                }
              }
            } else {
              // Escalation - whoever is currently supposed to review
              const historyLength = (submission.history || []).length;
              currentExpertId = submission.queue?.[historyLength]?.toString();
            }

            const info = currentExpertId
              ? expertInfoMap.get(currentExpertId)
              : null;
            const currentExpertName = info?.name || 'No Experts Assigned';
            const currentExpertStatus = info?.status || 'unknown';
            const isCurrentExpertBlocked = info?.isBlocked || false;

            return {
              submissionId: submission._id.toString(),
              questionId: submission.questionId.toString(),
              questionText: questionText,
              currentExpertId,
              currentExpertName,
              currentExpertStatus,
              isCurrentExpertBlocked,
              queue: submission.queue?.map(id => id.toString()) || [],
            };
          }),
        )
      ).filter(q => q !== null);

      // Get names for active experts
      const populatedActiveExperts = activeExperts.map(e => ({
        id: e._id.toString(),
        name: `${e.firstName} ${e.lastName || ''}`.trim(),
        reputation_score: e.reputation_score || 0,
      }));

      return {
        questions: populatedQuestions,
        activeExperts: populatedActiveExperts,
        inactiveExpertIds: type === 'inactive' ? inactiveExpertIds : [],
      };
    });
  }

  async manualReallocate(
    assignments: {submissionId: string; expertId: string}[],
    inactiveExpertIds?: string[],
  ): Promise<{message: string; submissionsProcessed: number}> {
    if (assignments.length > 0) {
      startBalanceWorkloadWorkers(assignments, inactiveExpertIds);
    }

    return {
      message: 'Manual reallocation started in background',
      submissionsProcessed: assignments.length,
    };
  }

  async balanceWorkloadSelectedQuestions(questionIds: string[]): Promise<{
    message: string;
    expertsInvolved: number;
    submissionsProcessed: number;
    questionsFiltered?: number;
    unallocatedQuestions?: number;
  }> {
    const lessWorkloadExperts =
      await this.userRepo.findActiveLowReputationExpertsToday();
    const MAX_PER_EXPERT = 5;

    if (!lessWorkloadExperts.length) {
      return {
        message: 'No Expert Present To Reallocate Questions .No action needed.',
        expertsInvolved: 0,
        submissionsProcessed: 0,
      };
    }

    if (questionIds.length > lessWorkloadExperts.length * MAX_PER_EXPERT) {
      return {
        message: `Too many questions selected. Only ${lessWorkloadExperts.length} experts are currently available for reallocation. The maximum allowed is ${lessWorkloadExperts.length * MAX_PER_EXPERT} questions based on the current expert capacity. Please reduce the number of selected questions or increase the number of available experts.`,
        expertsInvolved: lessWorkloadExperts.length,
        submissionsProcessed: 0,
      };
    }

    const questionSubmissionDetails =
      await this.questionSubmissionRepo.findReallocationQuestionsByIds(
        questionIds,
      );

    if (!questionSubmissionDetails.length) {
      return {
        message: `No valid questions found. Selected questions are either closed, in review, passed, draft, or already submitted.`,
        expertsInvolved: lessWorkloadExperts.length,
        submissionsProcessed: 0,
      };
    }

    await this._withTransaction(async session => {
      for (const submission of questionSubmissionDetails as any[]) {
        const question = submission.question;
        if (question && question.isOnHold) {
          const now = new Date();
          const prevAccum = question.accumulatedHoldMs ?? 0;
          let segmentMs = 0;
          if (question.holdAt) {
            segmentMs = Math.max(
              0,
              now.getTime() - new Date(question.holdAt).getTime(),
            );
          }
          await this.questionRepo.updateQuestion(
            question._id.toString(),
            {
              isOnHold: false,
              status: 'open',
              accumulatedHoldMs: prevAccum + segmentMs,
              holdAt: null,
            },
            session,
          );
        }
      }
    });

    const assignments: Record<string, any[]> = {};
    const expertLoad: Record<string, number> = {};

    lessWorkloadExperts.forEach(e => {
      const id = e._id.toString();
      assignments[id] = [];
      expertLoad[id] = 0;
    });

    let expertIndex = 0;
    let unallocatedQuestionsCount = 0;

    for (const submission of questionSubmissionDetails) {
      let attempts = 0;
      let assigned = false;

      // Get all experts who already reviewed the question
      const historyExpertIds = new Set(
        (submission.history || []).map(h => h.updatedBy?.toString()),
      );

      // Get all experts already present in queue
      const queueExpertIds = new Set(
        (submission.queue || []).map(id => id.toString()),
      );

      while (attempts < lessWorkloadExperts.length && !assigned) {
        const expert = lessWorkloadExperts[expertIndex];
        const expertId = expert._id.toString();

        if (
          !historyExpertIds.has(expertId) &&
          !queueExpertIds.has(expertId) &&
          expertLoad[expertId] < MAX_PER_EXPERT
        ) {
          assignments[expertId].push(submission);
          expertLoad[expertId]++;
          assigned = true;
        }

        // Round robin balancing
        expertIndex = (expertIndex + 1) % lessWorkloadExperts.length;
        attempts++;
      }
      if (!assigned) unallocatedQuestionsCount++;
    }

    const flatAssignments: {submissionId: string; expertId: string}[] = [];

    for (const expertId in assignments) {
      for (const submission of assignments[expertId]) {
        flatAssignments.push({
          submissionId: submission._id.toString(),
          expertId,
        });
      }
    }
    startBalanceWorkloadWorkers(flatAssignments);

    return {
      message: 'Workload balancing started in background',
      expertsInvolved: lessWorkloadExperts.length,
      submissionsProcessed: flatAssignments.length,
      questionsFiltered: questionIds.length - questionSubmissionDetails.length,
      unallocatedQuestions: unallocatedQuestionsCount,
    };
  }

  async reallocateTimeBoundQuestions(): Promise<{
    message: string;
    reallocated: number;
    skipped: number;
  }> {
    if (isReallocatingTimeBound) {
      console.log(
        '[TimeBound] Previous run still in progress — skipping this tick to avoid double-allocation.',
      );
      return {
        message: 'Reallocation already in progress',
        reallocated: 0,
        skipped: 0,
      };
    }
    isReallocatingTimeBound = true;
    try {
      return await this._runSingleAllocation({
        label: 'TimeBound',
        sources: TIME_BOUND_SOURCES,
        requirePaeReviewNotDone: false,
      });
    } finally {
      isReallocatingTimeBound = false;
    }
  }

  /**
   * Manual single-allocation queue for AGRI_EXPERT / OUTREACH questions.
   * Mirrors the time-bound flow exactly (one expert at a time, STF-first for
   * never-allocated, 45-min stuck reallocation, reviewer assignment) but:
   *   - operates on MANUAL_SOURCES instead of time-bound sources,
   *   - only considers questions not yet PAE-reviewed (pae_review false/missing),
   *   - uses an independent per-expert "1 active manual" cap.
   */
  async reallocateManualQuestions(): Promise<{
    message: string;
    reallocated: number;
    skipped: number;
  }> {
    if (isReallocatingManual) {
      console.log(
        '[ManualSingle] Previous run still in progress — skipping this tick to avoid double-allocation.',
      );
      return {
        message: 'Reallocation already in progress',
        reallocated: 0,
        skipped: 0,
      };
    }
    isReallocatingManual = true;
    try {
      return await this._runSingleAllocation({
        label: 'ManualSingle',
        sources: MANUAL_SOURCES,
        requirePaeReviewNotDone: true,
      });
    } finally {
      isReallocatingManual = false;
    }
  }

  /**
   * Core single-question allocation engine shared by the time-bound and manual
   * crons. Fetches stuck / never-allocated / needs-reviewer submissions for the
   * given source group and allocates one expert at a time (cap enforced per group).
   */
  private async _runSingleAllocation(cfg: {
    label: string;
    sources: QuestionSource[];
    requirePaeReviewNotDone: boolean;
  }): Promise<{message: string; reallocated: number; skipped: number}> {
    const {label, sources, requirePaeReviewNotDone} = cfg;
    console.log(
      `[${label}] Starting reallocation + initial-allocation + reviewer-assignment check...`,
    );
    try {
      // 1. Fetch all cases in parallel.
      // NOTE: opened-but-idle reallocation is intentionally DISABLED — once an expert
      // opens a question (currentExpertOpenedAt is set) it stays with them
      // and is never reallocated. The "stuck" path already excludes opened questions
      // (its query requires currentExpertOpenedAt to be null), so by not fetching the
      // openedIdle work here an opened question is reallocated by neither path.
      const [
        stuckSubmissions,
        unallocatedSubmissions,
        answeredNeedingReviewer,
      ] = await Promise.all([
        this.questionSubmissionRepo.findTimeBoundQuestionsForReallocation(
          sources,
          requirePaeReviewNotDone,
        ),
        this.questionSubmissionRepo.findUnallocatedTimeBoundQuestions(
          sources,
          requirePaeReviewNotDone,
        ),
        this.questionSubmissionRepo.findAnsweredQuestionsNeedingReviewer(
          sources,
          requirePaeReviewNotDone,
        ),
      ]);

      const byCreatedAt = (a: any, b: any) =>
        new Date((a.question?.createdAt ?? a.createdAt) as string).getTime() -
        new Date((b.question?.createdAt ?? b.createdAt) as string).getTime();

      stuckSubmissions.sort(byCreatedAt);
      unallocatedSubmissions.sort(byCreatedAt);
      answeredNeedingReviewer.sort(byCreatedAt);

      const totalWork =
        stuckSubmissions.length +
        unallocatedSubmissions.length +
        answeredNeedingReviewer.length;
      //console.log('the total work coming====', totalWork);
      if (!totalWork) {
        return {
          message: `[${label}] No questions need attention`,
          reallocated: 0,
          skipped: 0,
        };
      }

      console.log(
        `[TimeBound] Stuck: ${stuckSubmissions.length}, Never-allocated: ${unallocatedSubmissions.length}, NeedReviewer: ${answeredNeedingReviewer.length}`,
      );

      // 2. Get all non-blocked experts ordered by workload (lowest first)
      const allExperts = await this.userRepo.findExpertsByReputationScore(
        {} as any,
      );
      const TMU_experts = [];
      const Normal_experts = [];
      for (const expert of allExperts) {
        if (expert.isTrainingUser === true) {
          TMU_experts.push(expert);
        } else {
          Normal_experts.push(expert);
        }
      }
      if (!allExperts.length) {
        return {
          message: 'No experts available',
          reallocated: 0,
          skipped: totalWork,
        };
      }

      const getEligibleExpertsForQuestion = (question?: IQuestion | null) => {
        return question?.isTrainingQuestion === true
          ? TMU_experts
          : Normal_experts;
      };

      // Audit a system (cron) allocation so it shows in the question's audit trail
      // tagged "System Allocated". Fire-and-forget — never blocks the allocation.
      const writeSystemAllocationAudit = (
        qId: string,
        qText: string | undefined,
        assigneeId: string,
        roleLabel: 'expert' | 'reviewer',
      ) => {
        const e = allExperts.find((x: any) => x._id.toString() === assigneeId);
        const name = e
          ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || assigneeId
          : assigneeId;
        this.auditTrailsService
          .createAuditTrail({
            category: AuditCategory.EXPERTS_CATEGORY,
            action: AuditAction.SYSTEM_ALLOCATED,
            actor: {
              id: 'system',
              name: 'System',
              email: '',
              role: 'system',
              avatar: '',
            },
            context: {questionId: qId, question: qText, expertId: assigneeId},
            changes: {after: {[roleLabel]: name}},
            outcome: {status: OutComeStatus.SUCCESS},
            createdAt: new Date(),
          } as ModeratorAuditTrail)
          .catch((err: any) =>
            console.error(
              '[TimeBound] Failed to write SYSTEM_ALLOCATED audit:',
              err?.message,
            ),
          );
      };

      // 3. Get current active workload per expert for THIS source group (single DB
      //    call). Passing `sources` keeps the manual cap independent from time-bound.
      const timeBoundCounts =
        await this.questionSubmissionRepo.getTimeBoundActiveCountPerExpert(
          sources,
        );
      const MAX_TIME_BOUND = 1; // Each expert handles at most 1 active question in this group
      // Track provisional additions during this run to respect cap within batch
      const provisionalCounts = new Map<string, number>(timeBoundCounts);

      // ── Full diagnostic dump: every question to allocate + every expert + availability ──
      const summarizeSub = (s: any) => ({
        questionId: (s.questionId ?? s._id)?.toString(),
        status: s.question?.status,
        source: s.question?.source,
        queueLen: (s.queue ?? []).length,
        historyLen: (s.history ?? []).length,
        queue: (s.queue ?? []).map((q: any) => q?.toString()),
        createdAt: s.question?.createdAt ?? s.createdAt,
      });
      /* console.log(
        '[TimeBound][diag] stuck:',
        JSON.stringify(stuckSubmissions.map(summarizeSub)),
      );
      console.log(
        '[TimeBound][diag] unallocated:',
        JSON.stringify(unallocatedSubmissions.map(summarizeSub)),
      );
      console.log(
        '[TimeBound][diag] needsReviewer:',
        JSON.stringify(answeredNeedingReviewer.map(summarizeSub)),
      );*/

      const expertDiag = allExperts.map((e: any) => {
        const id = e._id.toString();
        const active = provisionalCounts.get(id) ?? 0;
        return {
          id,
          name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim(),
          email: e.email,
          isBlocked: e.isBlocked === true,
          stf: e.special_task_force === true,
          reputation: e.reputation_score,
          activeTimeBound: active,
          free: active < MAX_TIME_BOUND,
        };
      });
      /*  console.log(
        `[TimeBound][diag] experts=${allExperts.length}, free=${expertDiag.filter(x => x.free).length}, ` +
        `freeSTF=${expertDiag.filter(x => x.free && x.stf).length}, busyMapSize=${timeBoundCounts.size}`,
      );
      console.log('[TimeBound][diag] experts:', JSON.stringify(expertDiag));*/

      // ── Merge all lists into one priority queue ordered by question.createdAt ──
      type WorkType = 'stuck' | 'openedIdle' | 'unallocated' | 'needsReviewer';
      const workQueue: {type: WorkType; submission: any}[] = [
        ...stuckSubmissions.map((s: any) => ({
          type: 'stuck' as WorkType,
          submission: s,
        })),
        // Opened-but-idle reallocation disabled — see note above. Once a question is
        // opened it stays with its current expert and is NOT added to the work queue.
        ...unallocatedSubmissions.map((s: any) => ({
          type: 'unallocated' as WorkType,
          submission: s,
        })),
        ...answeredNeedingReviewer.map((s: any) => ({
          type: 'needsReviewer' as WorkType,
          submission: s,
        })),
      ];

      // Priority: never-allocated questions (and stuck/opened-idle reallocations)
      // must be fully processed BEFORE any needsReviewer (review-level) work, so
      // that available STF experts are consumed by never-allocated questions first.
      // Only once no never-allocated questions remain do reviewer assignments run.
      // Within the same priority bucket, keep FIFO by question.createdAt.
      const typePriority: Record<WorkType, number> = {
        stuck: 0,
        openedIdle: 0,
        unallocated: 0,
        needsReviewer: 1,
      };
      workQueue.sort((a, b) => {
        if (typePriority[a.type] !== typePriority[b.type]) {
          return typePriority[a.type] - typePriority[b.type];
        }
        const aTime = new Date(
          (a.submission.question?.createdAt ??
            a.submission.createdAt) as string,
        ).getTime();
        const bTime = new Date(
          (b.submission.question?.createdAt ??
            b.submission.createdAt) as string,
        ).getTime();
        return aTime - bTime;
      });

      const flatAssignments: {
        submissionId: string;
        expertId: string;
        appendExpert?: boolean;
        skipPenalty?: boolean;
      }[] = [];
      const reallocationInfo: {
        questionId: string;
        oldExpertId: string;
        newExpertId: string;
        sourceLabel: string;
        questionText: string;
      }[] = [];
      let skipped = 0;
      let initialAllocated = 0;
      let reviewersAssigned = 0;

      // Never-allocated (author-level) questions REQUIRE an STF answer-creator, so STF
      // experts are reserved for them — but only while such questions still remain to be
      // processed this run. Because the work queue puts all never-allocated work BEFORE
      // reviewer work, once they're all handled any STF still free (per the cap) is spare
      // and MAY take reviewer work. `unallocatedRemaining` tracks how many never-allocated
      // questions are still pending; the needsReviewer STF guard checks it (not a run-wide
      // flag) so a free STF isn't wrongly blocked from review-level questions.
      const hasUnallocatedSubmissions = unallocatedSubmissions.length > 0;
      let unallocatedProcessed = 0;
      let unallocatedRemaining = unallocatedSubmissions.length;

      for (const {type, submission} of workQueue) {
        const questionId = submission.questionId?.toString();
        const question = submission.question;
        const sourceLabel =
          (
            {
              AJRASAKHA: 'Ajrasakha',
              WHATSAPP: 'WhatsApp',
              AGRI_EXPERT: 'Agri Expert',
              OUTREACH: 'Outreach',
            } as Record<string, string>
          )[question?.source] ??
          question?.source ??
          'Unknown';
        const history: any[] = submission.history || [];
        const queue: any[] = submission.queue || [];

        if (type === 'stuck' || type === 'openedIdle') {
          // Determine current stuck expert
          let currentExpertId: string | null = null;
          if (history.length === 0) {
            currentExpertId = queue[0]?.toString() ?? null;
          } else {
            const lastH = history[history.length - 1];
            currentExpertId =
              lastH.status === 'in-review'
                ? (lastH.updatedBy?.toString() ?? null)
                : (queue[history.length]?.toString() ?? null);
          }

          const historyExpertIds = new Set(
            history.map((h: any) => h.updatedBy?.toString()),
          );
          const queueExpertIds = new Set(queue.map((q: any) => q.toString()));

          let assignedExpert: string | null = null;
          for (const expert of getEligibleExpertsForQuestion(question)) {
            const expertId = expert._id.toString();
            if (expertId === currentExpertId) continue;
            if (historyExpertIds.has(expertId)) continue;
            if (queueExpertIds.has(expertId)) continue;
            if (!history.length && expert?.special_task_force !== true)
              continue;
            // Reserve STF experts for never-allocated questions: when this run has
            // any never-allocated work, only AUTHOR-level reallocations (empty
            // history — they require an STF answer-creator) may use STF. Review-level
            // reallocations (history present, non-STF can handle them) skip STF.
            if (
              hasUnallocatedSubmissions &&
              history.length > 0 &&
              expert?.special_task_force === true
            ) {
              continue;
            }
            const currentCount = provisionalCounts.get(expertId) ?? 0;
            if (currentCount >= MAX_TIME_BOUND) continue;
            assignedExpert = expertId;
            provisionalCounts.set(expertId, currentCount + 1);
            break;
          }

          if (!assignedExpert) {
            console.log(
              `[TimeBound] No eligible expert for ${type} submission ${submission._id} — skipping`,
            );
            skipped++;
            continue;
          }
          // openedIdle → reassign but don't penalise the idle expert (skipPenalty).
          flatAssignments.push({
            submissionId: submission._id.toString(),
            expertId: assignedExpert,
            appendExpert: false,
            skipPenalty: type === 'openedIdle',
          });
          reallocationInfo.push({
            questionId,
            oldExpertId: currentExpertId ?? 'Unknown',
            newExpertId: assignedExpert,
            sourceLabel,
            questionText: (question as any)?.question?.toString() ?? '',
          });
        } else if (type === 'unallocated') {
          // This never-allocated question is now being handled — it no longer reserves an
          // STF expert away from later reviewer work.
          unallocatedRemaining--;
          let assignedExpert: string | null = null;
          for (const expert of getEligibleExpertsForQuestion(question)) {
            if (expert?.special_task_force !== true) continue;
            const expertId = expert._id.toString();
            const currentCount = provisionalCounts.get(expertId) ?? 0;
            if (currentCount >= MAX_TIME_BOUND) continue;
            assignedExpert = expertId;
            provisionalCounts.set(expertId, currentCount + 1);
            break;
          }

          if (!assignedExpert) {
            console.log(
              `[TimeBound] No eligible expert for unallocated question ${questionId} — skipping`,
            );
            skipped++;
            continue;
          }

          try {
            // Atomic allocation: run the DB writes in one transaction so a failure in
            // any of them rolls back the rest (no half-allocated question). Ops on a
            // single session must run sequentially (no Promise.all inside).
            await this._withTransaction(async (session: ClientSession) => {
              await this.questionSubmissionRepo.updateQueue(
                questionId,
                [new ObjectId(assignedExpert)],
                session,
              );
              await this.userRepo.updateReputationScore(
                assignedExpert,
                true,
                session,
              );
              await this.questionRepo.updateQuestion(
                questionId,
                {isAutoAllocate: true, firstAllocationAt: new Date()},
                session,
              );
              await this.questionSubmissionRepo.setCurrentExpertAllocatedAt(
                questionId,
                new Date(),
                session,
              );
            });

            // Notification is best-effort and lives OUTSIDE the transaction so it can
            // never roll back a committed allocation.
            await this.notificationService
              .saveTheNotifications(
                `A question from ${sourceLabel} has been assigned to you`,
                'Answer Creation Assigned',
                questionId,
                assignedExpert,
                'answer_creation',
              )
              .catch((err: any) =>
                console.error(
                  `[TimeBound] Failed to notify expert ${assignedExpert} for ${questionId}:`,
                  err?.message,
                ),
              );
            writeSystemAllocationAudit(
              questionId,
              (question as any)?.question,
              assignedExpert,
              'expert',
            );
            console.log(
              `[TimeBound] Initially allocated question ${questionId} to expert ${assignedExpert}`,
            );
            initialAllocated++;
            unallocatedProcessed++;
          } catch (allocErr: any) {
            console.error(
              `[TimeBound] Failed to initially allocate question ${questionId}:`,
              allocErr?.message,
            );
            skipped++;
          }
        } else {
          // needsReviewer
          const historyExpertIds = new Set(
            history.map((h: any) => h.updatedBy?.toString()),
          );
          const queueExpertIds = new Set(queue.map((q: any) => q.toString()));

          let assignedReviewer: string | null = null;
          for (const expert of getEligibleExpertsForQuestion(question)) {
            const expertId = expert._id.toString();
            if (historyExpertIds.has(expertId)) continue;
            if (queueExpertIds.has(expertId)) continue;

            // Reserve STF experts for never-allocated questions only while such
            // questions still remain to be processed this run. Since never-allocated
            // work is ordered BEFORE reviewer work, by the time we reach needsReviewer
            // all of it has been handled (unallocatedRemaining === 0), so an STF expert
            // that is still free (per the cap) is spare and may take review-level work.
            if (
              unallocatedRemaining > 0 &&
              expert?.special_task_force === true
            ) {
              console.log(
                `[TimeBound] Skipping STF expert ${expertId} for needsReviewer question ${questionId} — ${unallocatedRemaining} never-allocated question(s) still pending; STF reserved for them`,
              );
              continue; // STF reserved for still-pending never-allocated questions
            }

            const currentCount = provisionalCounts.get(expertId) ?? 0;
            if (currentCount >= MAX_TIME_BOUND) continue;
            assignedReviewer = expertId;
            provisionalCounts.set(expertId, currentCount + 1);
            break;
          }

          if (!assignedReviewer) {
            console.log(
              `[TimeBound] No eligible reviewer for question ${questionId} — skipping`,
            );
            skipped++;
            continue;
          }

          try {
            // Atomic reviewer assignment (see initial-allocation note above): DB writes
            // run sequentially in one transaction; the notification is best-effort and
            // lives outside so it can't roll back a committed assignment.
            await this._withTransaction(async (session: ClientSession) => {
              await this.questionSubmissionRepo.assignTimeBoundReviewer(
                questionId,
                assignedReviewer,
                new Date(),
                session,
              );
              await this.userRepo.updateReputationScore(
                assignedReviewer,
                true,
                session,
              );
            });

            await this.notificationService
              .saveTheNotifications(
                `A question from ${sourceLabel} needs your review`,
                'New Review Assigned',
                questionId,
                assignedReviewer,
                'peer_review',
              )
              .catch((err: any) =>
                console.error(
                  `[TimeBound] Failed to notify reviewer ${assignedReviewer} for ${questionId}:`,
                  err?.message,
                ),
              );
            writeSystemAllocationAudit(
              questionId,
              (question as any)?.question,
              assignedReviewer,
              'reviewer',
            );
            console.log(
              `[TimeBound] Assigned reviewer ${assignedReviewer} for question ${questionId}`,
            );
            reviewersAssigned++;
          } catch (err: any) {
            console.error(
              `[TimeBound] Failed to assign reviewer for question ${questionId}:`,
              err?.message,
            );
            skipped++;
          }
        }
      }

      if (flatAssignments.length) {
        // Await the workers so the run (and its lock) stays open until the queue
        // writes land — otherwise the next tick could re-reserve an expert whose
        // assignment hasn't been persisted yet.
        const workerResult = await startBalanceWorkloadWorkers(flatAssignments);
        console.log(
          `[TimeBound] Triggered reallocation for ${flatAssignments.length} stuck submission(s); ` +
            `workers persisted=${workerResult.processed}, failedWorkers=${workerResult.failedWorkers}`,
        );

        // Audit each stuck reallocation as a system allocation ("System Allocated").
        for (const info of reallocationInfo) {
          writeSystemAllocationAudit(
            info.questionId,
            info.questionText,
            info.newExpertId,
            'expert',
          );
        }

        //   // Notify all moderators and admins about stuck-question reallocations
        //   try {
        //     const [moderators, admins] = await Promise.all([
        //       this.userRepo.findModerators(),
        //       this.userRepo.findAdmins(),
        //     ]);
        //     const allRecipients = [...(moderators || []), ...(admins || [])];
        //     console.log(`[TimeBound] Notifying ${allRecipients.length} moderators/admins about ${reallocationInfo.length} reallocation(s)`);

        //     const getName = async (id?: string | null): Promise<string> => {
        //       if (!id) return 'Unknown';
        //       try {
        //         const u = await this.userRepo.findById(id);
        //         if (!u) return 'Unknown';
        //         const first = (u as any).firstName?.toString().trim() || '';
        //         const last = (u as any).lastName?.toString().trim() || '';
        //         const full = `${first} ${last}`.trim();
        //         return full || 'Unknown';
        //       } catch {
        //         return 'Unknown';
        //       }
        //     };

        //     for (const info of reallocationInfo) {
        //       const [oldExpertName, newExpertName] = await Promise.all([
        //         getName(info.oldExpertId),
        //         getName(info.newExpertId),
        //       ]);
        //       const message = `${info.sourceLabel} question auto-reallocated from expert ${oldExpertName} to ${newExpertName}gggggg`;
        //       const trimmedQuestion = (info.questionText || '').trim();
        //       const title = trimmedQuestion
        //         ? (trimmedQuestion.length > 80 ? `${trimmedQuestion.slice(0, 80)}...` : trimmedQuestion)
        //         : 'Time-Bound Question Reallocated';
        //       for (const recipient of allRecipients) {
        //         const recipientId = recipient._id?.toString();
        //         if (!recipientId) continue;
        //         await this.notificationService.saveTheNotifications(
        //           message,
        //           title,
        //           info.questionId,
        //           recipientId,
        //           'expert_replacement',
        //         ).catch((err: any) => {
        //           console.error(`[TimeBound] Failed to notify ${recipientId}:`, err?.message);
        //         });
        //       }
        //     }
        //   } catch (err: any) {
        //     console.error(`[TimeBound] Failed to notify moderators/admins:`, err?.message);
        //   }
      }

      const totalReallocated =
        flatAssignments.length + initialAllocated + reviewersAssigned;
      return {
        message: `[${label}] reallocated=${flatAssignments.length}, initially-allocated=${initialAllocated}, reviewers-assigned=${reviewersAssigned}`,
        reallocated: totalReallocated,
        skipped,
      };
    } catch (error: any) {
      console.error(`[${label}] single-allocation run failed:`, error?.message);
      throw new InternalServerError(
        `Failed to run ${label} allocation: ${error?.message}`,
      );
    }
  }
}
