import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  IUser,
  NotificationRetentionType,
  UserRole,
} from '#root/shared/interfaces/models.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {InternalServerError, NotFoundError} from 'routing-controllers';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {ClientSession} from 'mongodb';
import {
  PreferenceDto,
  UsersNameResponseDto,
  ExpertReviewLevelDto,
} from '../classes/validators/UserValidators.js';
import {INotificationRepository} from '#root/shared/database/interfaces/INotificationRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';

@injectable()
export class UserService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.NotificationRepository)
    private readonly notificationRepository: INotificationRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,
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
  async getUserReviewLevel(query: ExpertReviewLevelDto): Promise<any> {
    try {
      //if (!query.userId) throw new NotFoundError('User ID is required');

      return this._withTransaction(async (session: ClientSession) => {
        if (query.role == 'moderator') {
          const moderatorResult =
            await this.questionSubmissionRepo.getModeratorReviewLevel(query);
          return moderatorResult;
        }
        const result = await this.questionSubmissionRepo.getUserReviewLevel(
          query,
        );

        return result;
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch user review-level with ID ${query.userId}: ${error}`,
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

  async toggleUserRole(
    currentUser: IUser,
    userId: string,
  ): Promise<IUser> {
    try {
      if (!currentUser || currentUser.role !== 'admin') {
        throw new NotFoundError('Only admin can switch user roles');
      }
      if (!userId) throw new NotFoundError('User ID is required');

      return this._withTransaction(async (session: ClientSession) => {
        const user = await this.userRepo.findById(userId, session);
        if (!user) {
          throw new NotFoundError(`User with ID ${userId} not found`);
        }

        const newRole: UserRole = user.role === 'moderator' ? 'expert' : 'moderator';
        const updatedUser = await this.userRepo.edit(
          userId,
          { role: newRole },
          session,
        );

        return updatedUser;
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to toggle role for user ID ${userId}: ${error}`,
      );
    }
  }

async getAllUsers(
  page: number,
  limit: number,
  search: string,
  sort: string,
  filter: string,
): Promise<{ users: IUser[]; totalUsers: number; totalPages: number }> {
  return await this._withTransaction(async () => {
    const { users, totalUsers, totalPages } =
      await this.userRepo.findAllUsers(
        page,
        limit,
        search,
        sort,
        filter,
      );
    return { users, totalUsers, totalPages };
  });
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
}
