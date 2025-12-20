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
import { GetDetailedQuestionsQuery } from '../classes/validators/QuestionValidators.js';

@injectable()
export class ReRouteService extends BaseService {
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
        const expert = await this.userRepo.findById(expertId.toString());
        if (!expert) {
          throw new NotFoundError('Expert not found');
        }
        const now = new Date();
        const existingReRoute = await this.reRouteRepository.findByQuestionId(
          questionId,
          session,
        );
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
          if (lastExpert.toString() === expertId.toString()) {
            throw new BadRequestError('Cannot assign to same expert');
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
        await Promise.all([updateWorkload, sendNotification, updateQuestion]);
        return;
      });
    } catch (error) {
      throw new InternalServerError(`Failed to add questions: ${error}`);
    }
  }


  async getAllocatedQuestions(userId:string,query:GetDetailedQuestionsQuery){
    return await this._withTransaction(async (session:ClientSession) => {
      const expert = await this.userRepo.findById(userId.toString());
        if (!expert) {
          throw new NotFoundError('Expert not found');
        }
        return await this.reRouteRepository.getAllocatedQuestions(userId.toString(),query,session)
    })
  }
  async getQuestionById(questionId: string,userId:string){
    try {
      return this._withTransaction(async (session: ClientSession) => {
        const currentQuestion = await this.questionRepo.getById(questionId);

        if (!currentQuestion)
          throw new NotFoundError(
            `Failed to find question with id: ${questionId}`,
          );
          let result= await this.reRouteRepository.getAllocatedQuestionsByID(questionId,userId,session)
          
          

        // Only author needs to see ai initial answer
        let aiInitialAnswer = '';

        

        return {
          id: currentQuestion._id.toString(),
          text: currentQuestion.question,
          source: currentQuestion.source,
          details: currentQuestion.details,
          status: currentQuestion.status,
          priority: currentQuestion.priority,
          aiInitialAnswer,
          createdAt: new Date(currentQuestion.createdAt).toLocaleString(),
          updatedAt: new Date(currentQuestion.updatedAt).toLocaleString(),
          totalAnswersCount: currentQuestion.totalAnswersCount,
          history: result,
          // currentAnswers: currentAnswers.map(currentAnswer => ({
          //   id: currentAnswer._id.toString(),
          //   answer: currentAnswer.answer,
          //   isFinalAnswer: currentAnswer.isFinalAnswer,
          //   createdAt: currentAnswer.createdAt,
          // })),
        };
      });

        // const currentAnswers = await this.answerRepo.getByQuestionId(
        //   questionId,
        //   session,
        // );

           
       
          // currentAnswers: currentAnswers.map(currentAnswer => ({
          //   id: currentAnswer._id.toString(),
          //   answer: currentAnswer.answer,
          //   isFinalAnswer: currentAnswer.isFinalAnswer,
          //   createdAt: currentAnswer.createdAt,
          // })),
        
      
    } catch (error) {
      throw new InternalServerError(
        `Failed to get unanswered questions: ${error}`,
      );
    }
  }


  async rejectRerouteRequest(rerouteId:string,questionId:string,expertId:string,moderatorId:string,reason:string,role:string){
    try {
      return await this._withTransaction(async (session:ClientSession) => {
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
        
        return
      })
    } catch (error) {
      throw new InternalServerError(
        `Failed to reject request: ${error}`,
      );
    }
  }

  async getRerouteHistory(answerId:string){
    return await this._withTransaction(async (session:ClientSession) => {
      return await this.reRouteRepository.getRerouteHistory(answerId,session)
    })
  }

  async moderatorReject(questionId:string,expertId:string,status:RerouteStatus,reason:string){
    return await this._withTransaction(async (session:ClientSession) => {
      return await this.reRouteRepository.updateStatus(questionId.toString(),expertId.toString(),status,undefined,reason,session)
    })
  }
}
