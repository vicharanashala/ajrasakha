import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {
  IQuestion,
  IQuestionSubmission,
  ISubmissionHistory,
  IAnswer,
  INotificationType,
  IQuestionPriority,
  IReroute,
  RerouteStatus,
  IRerouteHistory,
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';

import {IReRouteRepository} from '#root/shared/database/interfaces/IReRouteRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {NotificationService} from '#root/modules/core/index.js';
import { AllocatedQuestionsBodyDto, GetDetailedQuestionsQuery } from '../classes/validators/QuestionValidators.js';
import { IReRouteService } from '../interfaces/IRerouteService.js';
import {
  AllocatedQuestionDto,
  QuestionDetailedResponseDto,
  RerouteHistoryEntryDto,
} from '../dtos/ReRouteResponseDto.js';

@injectable()
export class ReRouteService extends BaseService implements IReRouteService {
  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,

    @inject(GLOBAL_TYPES.ReRouteRepository)
    private readonly reRouteRepository: IReRouteRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.NotificationService)
    private readonly notificationService: NotificationService,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,
  ) {
    super(mongoDatabase);
  }

  /*async addrerouteAnswer(
    questionId: string,
    expertId: string,
    answerId: string,
    moderatorId: string,
    comment: string,
    status: RerouteStatus,
  ) {
    try {
      const existingReRoute =
  await this.reRouteRepository.findByQuestionId(questionId);

if (existingReRoute?.reroutes.at(-1)?.status === "pending") {
  throw new BadRequestError(
    "The answer is in review state, you cannot assign a new expert"
  );
}
      return await this._withTransaction(async (session: ClientSession) => {
        const expert = await this.userRepo.findById(expertId.toString());
        if (!expert) {
          throw new NotFoundError('Expert not found');
        }
        const now = new Date();
        const rerouteHistory: IRerouteHistory = {
          reroutedBy: new ObjectId(moderatorId),
          reroutedTo: new ObjectId(expertId),
          reroutedAt: now,
          answerId:  new ObjectId(answerId),
          status,
          comment,
          updatedAt: now,
        };
        const isIncrement = true;
        const message = 'Moderator has been re routed a review for you';
        const title = 'Re route review assigned';
        const entityId = questionId.toString();
        const userId = expertId.toString();
        const type = 're-routed';
        if (!existingReRoute) {
          const payload: IReroute = {
            answerId: new ObjectId(answerId),
            questionId: new ObjectId(questionId),
            reroutes: [rerouteHistory],
            createdAt: now,
            updatedAt: now,
          };
          await this.reRouteRepository.addrerouteAnswer(payload, session);
        } else {
          const lastExpert = existingReRoute.reroutes.at(-1).reroutedTo;
          const lastStatus=existingReRoute.reroutes.at(-1).status
         
          if (lastStatus=="pending") {
            throw new BadRequestError('The answer is in review state you can not assign new expert please refresh the page');
          }

          await this.reRouteRepository.pushRerouteHistory(
            answerId,
            existingReRoute._id.toString(),
            rerouteHistory,
            now,
            session,
          );
        }
        const updateWorkload = this.userRepo.updateReputationScore(
          expertId.toString(),
          isIncrement,
          session,
        );
        const sendNotification = this.notificationService.saveTheNotifications(
          message,
          title,
          entityId,
          userId,
          type,
          session,
        );
        const updateQuestion = this.questionRepo.updateQuestionStatus(
          questionId.toString(),
          're-routed',
          null,
          session,
        );
       await updateWorkload;
       await sendNotification;
       await updateQuestion;
        return;
      });
    } catch (error) {
      throw new InternalServerError(`Failed to add expert: ${error}`);
    }
  }*/
  async addrerouteAnswer(
    questionId: string,
    expertId: string,
    answerId: string,
    moderatorId: string,
    comment: string,
    status: RerouteStatus,
  ) {
    try {
      return await this._withTransaction(async (session: ClientSession) => {
  
        /* ---------------------------------------------------
         * 1️⃣ VALIDATE EXPERT (inside transaction)
         * --------------------------------------------------- */
        const expert = await this.userRepo.findById(expertId, session);
        if (!expert) {
          throw new NotFoundError('Expert not found');
        }
  
        const now = new Date();
  
        /* ---------------------------------------------------
         * 2️⃣ READ reroute INSIDE transaction
         * --------------------------------------------------- */
        const existingReRoute =
          await this.reRouteRepository.findByQuestionId(questionId, session);
  
        if (
          existingReRoute?.reroutes?.length &&
          existingReRoute.reroutes.at(-1)?.status === 'pending'
        ) {
          throw new BadRequestError(
            'The answer is already rerouted, you cannot assign a new expert. Please reload',
          );
        }
  
        /* ---------------------------------------------------
         * 3️⃣ BUILD reroute history
         * --------------------------------------------------- */
        const rerouteHistory: IRerouteHistory = {
          reroutedBy: new ObjectId(moderatorId),
          reroutedTo: new ObjectId(expertId),
          reroutedAt: now,
          answerId: new ObjectId(answerId),
          status,
          comment,
          updatedAt: now,
        };
  
        /* ---------------------------------------------------
         * 4️⃣ INSERT / UPDATE reroute document
         * --------------------------------------------------- */
        if (!existingReRoute) {
          const payload: IReroute = {
            answerId: new ObjectId(answerId),
            questionId: new ObjectId(questionId),
            reroutes: [rerouteHistory],
            createdAt: now,
            updatedAt: now,
          };
  
          await this.reRouteRepository.addrerouteAnswer(payload, session);
        } else {
          const lastStatus = existingReRoute.reroutes.at(-1)?.status;
  
          if (lastStatus === 'pending') {
            throw new BadRequestError(
              'The answer is already under review. Please refresh the page.',
            );
          }
  
          await this.reRouteRepository.pushRerouteHistory(
            answerId,
            existingReRoute._id.toString(),
            rerouteHistory,
            now,
            session,
          );
        }
  
        /* ---------------------------------------------------
         * 5️⃣ SIDE EFFECTS (ALL WITH SAME SESSION)
         * --------------------------------------------------- */
        await this.userRepo.updateReputationScore(
          expertId,
          true,
          session,
        );
  
        await this.notificationService.saveTheNotifications(
          'Moderator has re-routed a review for you',
          'Re-route review assigned',
          questionId,
          expertId,
          're-routed',
          session,
        );
  
        await this.questionRepo.updateQuestionStatus(
          questionId,
          're-routed',
          null,
          session,
        );
  
        return;
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to add expert: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  

  async getAllocatedQuestions(
    userId: string,
    query: GetDetailedQuestionsQuery,
    body: AllocatedQuestionsBodyDto,
  ): Promise<AllocatedQuestionDto[]> {
    return await this._withTransaction(async (session: ClientSession) => {
      const expert = await this.userRepo.findById(userId.toString());
      if (!expert) {
        throw new NotFoundError('Expert not found');
      }
      const questions = await this.reRouteRepository.getAllocatedQuestions(userId.toString(), query, session, body);
      
      // Explicitly map to ensure it matches AllocatedQuestionDto
      return questions.map(q => ({
        id: q.id.toString(),
        text: q.text,
        status: q.status,
        priority: q.priority,
        source: q.source,
        totalAnswersCount: q.totalAnswersCount,
        createdAt: q.createdAt?.toISOString?.() || q.createdAt,
        updatedAt: q.updatedAt?.toISOString?.() || q.updatedAt,
      }));
    });
  }
  async getQuestionById(questionId: string, userId: string): Promise<QuestionDetailedResponseDto> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        const currentQuestion = await this.questionRepo.getById(questionId);

        if (!currentQuestion)
          throw new NotFoundError(
            `Failed to find question with id: ${questionId}`,
          );
        const result = await this.reRouteRepository.getAllocatedQuestionsByID(questionId, userId, session);

        // Only author needs to see ai initial answer
        const aiInitialAnswer = '';

        return {
          id: currentQuestion._id.toString(),
          text: currentQuestion.question,
          source: currentQuestion.source,
          details: {
            ...currentQuestion.details,
            crop: typeof currentQuestion.details.crop === 'object' ? currentQuestion.details.crop.name : currentQuestion.details.crop,
          },
          status: currentQuestion.status,
          priority: currentQuestion.priority,
          aiInitialAnswer,
          createdAt: currentQuestion.createdAt instanceof Date ? currentQuestion.createdAt.toISOString() : new Date(currentQuestion.createdAt).toISOString(),
          updatedAt: currentQuestion.updatedAt instanceof Date ? currentQuestion.updatedAt.toISOString() : new Date(currentQuestion.updatedAt).toISOString(),
          totalAnswersCount: currentQuestion.totalAnswersCount,
          history: result?.map((h: any) => ({
            ...h,
            reroutedBy: h.reroutedBy?.toString(),
            reroutedTo: h.reroutedTo?.toString(),
            answerId: h.answerId?.toString(),
            reroutedAt: h.reroutedAt instanceof Date ? h.reroutedAt.toISOString() : h.reroutedAt,
            updatedAt: h.updatedAt instanceof Date ? h.updatedAt.toISOString() : h.updatedAt,
          })),
        };
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to get question by ID: ${error instanceof Error ? error.message : error}`,
      );
    }
  }


  async rejectRerouteRequest(rerouteId:string,questionId:string,expertId:string,moderatorId:string,reason:string,role:string){
    try {
      return await this._withTransaction(async (session:ClientSession) => {
        const existingReRoute = await this.reRouteRepository.findByQuestionId(
          questionId,
          session,
        );
        const lastStatus=existingReRoute.reroutes.at(-1).status
       
        if (lastStatus=="expert_rejected"||lastStatus=="moderator_rejected") {
          throw new BadRequestError('You have already rejected the response please refresh the page');
          
        }
        await this.reRouteRepository.rejectRerouteRequest(rerouteId,reason,role,session)
        
        if(role=="expert")
        {
          const user = await this.userRepo.findById(expertId,session)
          const isIncrement=false
          const title="Re Route request rejected"
          const type:INotificationType='re-routed-rejected-expert'
          const message = `The expert ${user.email} has been rejected the re route request you sent`
          const updateReputation= this.userRepo.updateReputationScore(expertId.toString(),isIncrement,session)
          const sendNotification=this.notificationService.saveTheNotifications(message,title,questionId.toString(),moderatorId.toString(),type,session)
          await Promise.all([updateReputation,sendNotification])
        }
        else{
          const user = await this.userRepo.findById(moderatorId,session)
          const isIncrement=false
          const title="Re Route request rejected"
          const type:INotificationType='re-routed-rejected-moderator'
          const message = `The moderator ${user.email} has been rejected the re route request which sent to you`
          const updateReputation= this.userRepo.updateReputationScore(expertId.toString(),isIncrement,session)
          const sendNotification=this.notificationService.saveTheNotifications(message,title,questionId.toString(),expertId.toString(),type,session)
          await Promise.all([updateReputation,sendNotification])

        }
        await this.questionRepo.updateQuestionStatus(
          questionId,
          'in-review',
          null,
          session,
        );
        
        return
      })
    } catch (error) {
      throw new BadRequestError(
        "You have already rejected the response please refresh the page"
      );
    }
  }

  async getRerouteHistory(answerId: string): Promise<RerouteHistoryEntryDto[]> {
    return await this._withTransaction(async (session: ClientSession) => {
      const results = await this.reRouteRepository.getRerouteHistory(answerId, session);
      if (!results || results.length === 0) {
        return [];
      }
      
      // The repo returns an array of documents, each with a reroutes array.
      // We take the reroutes from the first matched document.
      const history = results[0].reroutes || [];
      
      return history.map((h: any) => ({
        reroutedBy: h.reroutedBy?._id || h.reroutedBy?.toString(),
        reroutedTo: h.reroutedTo?._id || h.reroutedTo?.toString(),
        reroutedAt: h.reroutedAt instanceof Date ? h.reroutedAt.toISOString() : h.reroutedAt,
        answerId: h.answer?._id || h.answerId?.toString(),
        status: h.status,
        rejectionReason: h.rejectionReason,
        moderatorRejectionReason: h.moderatorRejectionReason,
        comment: h.comment,
        updatedAt: h.updatedAt instanceof Date ? h.updatedAt.toISOString() : h.updatedAt,
      }));
    });
  }

  async moderatorReject(questionId:string,expertId:string,status:RerouteStatus,reason:string){
    return await this._withTransaction(async (session:ClientSession) => {
      return await this.reRouteRepository.updateStatus(questionId.toString(),expertId.toString(),status,undefined,reason,session)
    })
  }
}
