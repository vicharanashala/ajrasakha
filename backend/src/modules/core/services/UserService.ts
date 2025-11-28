import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  IUser,
  NotificationRetentionType,
  QuestionStatus,
} from '#root/shared/interfaces/models.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {ClientSession} from 'mongodb';
import {
  PreferenceDto,
  UsersNameResponseDto,
} from '../classes/validators/UserValidators.js';
import {INotificationRepository} from '#root/shared/database/interfaces/INotificationRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';

@injectable()
export class UserService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.NotificationRepository)
    private readonly notificationRepository: INotificationRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }
  async getUserById(userId: string): Promise<IUser> {
    try {
      if (!userId) throw new NotFoundError('User ID is required');

      return this._withTransaction(async (session: ClientSession) => {
        let user = await this.userRepo.findById(userId, session);
        if (!user) throw new NotFoundError(`User with ID ${userId} not found`);
        let notifications =
          await this.notificationRepository.getNotificationsCount(
            userId,
            session,
          );
        const usersWithNotification = {
          ...user,
          notifications,
        };
        return usersWithNotification;
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch user with ID ${userId}: ${error}`,
      );
    }
  }

  async updateUser(userId: string, data: Partial<IUser>): Promise<IUser> {
    try {
      if (!userId) throw new NotFoundError('User ID is required');

      return this._withTransaction(async (session: ClientSession) => {
        const updatedUser = await this.userRepo.edit(userId, data, session);
        if (!updatedUser)
          throw new NotFoundError(`User with ID ${userId} not found`);
        return updatedUser;
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to update user with ID ${userId}: ${error}`,
      );
    }
  }

  async getAllUsers(userId: string): Promise<UsersNameResponseDto> {
    try {
      return await this._withTransaction(async session => {
        const me = await this.userRepo.findById(userId, session);
        const users = await this.userRepo.findAll(session);

        const usersExceptMe = users.filter(
          user => user._id.toString() !== userId,
        );

        const myPreference: PreferenceDto = {
          state: me?.preference?.state ?? null,
          crop: me?.preference?.crop ?? null,
          domain: me?.preference?.domain ?? null,
        };

        return {
          myPreference,
          users: users.map(u => ({
            _id: u._id.toString(),
            role: u.role,
            email: u.email,
            preference: u.preference,
            userName: `${u.firstName} ${u.lastName ? u.lastName : ''}`.trim(),
            isBlocked: u.isBlocked,
          })),
        };
      });
    } catch (error) {
      throw new InternalServerError(`Failed to fetch users: ${error}`);
    }
  }

  async updateAutoDeleteNotificationPreference(
    preference: NotificationRetentionType,
    userId: string,
  ): Promise<void> {
    await this._withTransaction(async (session: ClientSession) => {
      await this.userRepo.updateAutoDeleteNotificationPreference(
        preference,
        userId,
        session,
      );
    });
  }

  async updatePenaltyAndIncentive(
    userId: string,
    type: 'penalty' | 'incentive',
  ): Promise<void> {
    await this._withTransaction(async (session: ClientSession) => {
      await this.userRepo.updatePenaltyAndIncentive(userId, type, session);
    });
  }

  async findAllExperts(
    page: number,
    limit: number,
    search: string,
    sort: string,
    filter: string,
  ): Promise<{experts: IUser[]; totalExperts: number; totalPages: number}> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.userRepo.findAllExperts(
        page,
        limit,
        search,
        sort,
        filter,
        session,
      );
    });
  }

  async blockUnblockExperts(userId: string, action: string) {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.userRepo.updateIsBlocked(userId, action, session);
    });
  }

  async getUserByEmail(email: string): Promise<IUser | null> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.userRepo.findByEmail(email, session);
    });
  }

  async recalculateReputationScores(
    userId: string,
  ): Promise<{message: string}> {
    try {
      return await this._withTransaction(async (session: ClientSession) => {
        // const user = await this.userRepo.findById(userId, session);
        // if (!user || user.role == 'expert') {
        //   throw new UnauthorizedError(
        //     `You don't have permission do this operation`,
        //   );
        // }
        const openQuestionStatus = ['open', 'delayed'] as QuestionStatus[];
        const questions = await this.questionRepo.getQuestionsByStatus(
          openQuestionStatus,
          session,
        );
        if (!questions || questions.length == 0)
          throw new BadRequestError(`Questions not found!`);

        const questionIds = questions.map(q => q._id.toString());

        const submissions = await this.questionSubmissionRepo.getByQuestionIds(
          questionIds,
          session,
        );

        if (!submissions || submissions.length == 0)
          throw new BadRequestError(`Question submissions not found!`);

        // Reputation mapping: { userId: score }
        const reputationMap: Record<string, number> = {};

        // Loop through submissions
        submissions.forEach(sub => {
          // If history is empty → take first user from the queue
          if (!sub.history || sub.history.length === 0) {
            const queue = sub.queue || [];

            if (queue.length > 0) {
              const expertId = queue[0].toString();
              if (!reputationMap[expertId]) reputationMap[expertId] = 0;
              reputationMap[expertId] += 1;
            }

            return; // skip rest of logic
          }

          sub.history.forEach(h => {
            const match =
              h.status === 'in-review' &&
              (!h.reviewId || h.reviewId === null) &&
              (!h.answer || h.answer === null) &&
              h.updatedBy;

            if (match) {
              const expertId = h.updatedBy.toString();
              if (!reputationMap[expertId]) reputationMap[expertId] = 0;
              reputationMap[expertId] += 1;
            }
          });
        });

        const expertIds = Object.keys(reputationMap);

        if (expertIds.length === 0) {
          console.log('No reputation changes to apply.');
          return;
        }

        await Promise.all(
          expertIds.map(async expertId => {
            const score = reputationMap[expertId];

            await this.userRepo.updateById(
              expertId,
              {reputation_score: score},
              session,
            );
          }),
        );

        return {message: 'Reputation scores updated successfully!'};
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to recalculate reputation scores /MORE: ${error}`,
      );
    }
  }
}
