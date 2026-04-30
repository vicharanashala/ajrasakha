import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  IUser,
  NotificationRetentionType,
  UserRole,
} from '#root/shared/interfaces/models.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {BadRequestError, ForbiddenError, InternalServerError, NotFoundError} from 'routing-controllers';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {ClientSession} from 'mongodb';
import {
  PreferenceDto,
  UsersNameResponseDto,
  ExpertReviewLevelDto,
} from '#root/modules/user/validators/UserValidators.js';
import {INotificationRepository} from '#root/shared/database/interfaces/INotificationRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import { getFromContainer } from 'class-validator';
import { FirebaseAuthService } from '#root/modules/auth/services/FirebaseAuthService.js';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto, PaginatedUsersResponseDto } from '../dtos/UserResponseDto.js';
import { PaginationMetaDto } from '#root/shared/dtos/PaginationDto.js';

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

  async getUserById(userId: string): Promise<UserResponseDto> {
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
        return plainToInstance(UserResponseDto, usersWithNotification, { excludeExtraneousValues: true });
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

  async updateUser(userId: string, data: Partial<IUser>): Promise<UserResponseDto> {
    try {
      if (!userId) throw new NotFoundError('User ID is required');

      if(data.firstName !== undefined && !data.firstName.trim()) throw new BadRequestError("Firstname cannot be empty or blank space");

      const authService = getFromContainer(FirebaseAuthService);

      return this._withTransaction(async (session: ClientSession) => {
        const updatedUser = await this.userRepo.edit(userId, data, session);
        if (!updatedUser)
          throw new NotFoundError(`User with ID ${userId} not found`);
        if (data.firstName || data.lastName) {
          await authService.updateFirebaseUser(
            updatedUser.firebaseUID,
            {
              firstName: data.firstName ?? updatedUser.firstName,
              lastName: data.lastName ?? updatedUser.lastName,
            },
          );
        }
        return plainToInstance(UserResponseDto, updatedUser, { excludeExtraneousValues: true });
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
  ): Promise<UserResponseDto> {
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

        return plainToInstance(UserResponseDto, updatedUser, { excludeExtraneousValues: true });
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
  role?: string,
  isBlocked?: boolean,
): Promise<PaginatedUsersResponseDto> {
  return await this._withTransaction(async () => {
    const { users, totalUsers, totalPages } =
      await this.userRepo.findAllUsers(
        page,
        limit,
        search,
        sort,
        filter,
        role,
        isBlocked,
      );
    
    return plainToInstance(PaginatedUsersResponseDto, {
      users,
      meta: {
        totalItems: totalUsers,
        totalPages,
        currentPage: page,
        limit,
      } as PaginationMetaDto
    }, { excludeExtraneousValues: true });
  });
}
async getAllUsersforManualSelect(
  userId: string,
  page: number,
  limit: number,
  search: string,
  sort: string,
  filter: string,
): Promise<PaginatedUsersResponseDto> {
  try {
    return await this._withTransaction(async session => {
      const me = await this.userRepo.findById(userId, session);
      const users = await this.userRepo.findAll(session);
      const usersExceptMe = users.filter(
        user => user._id.toString() !== userId,
      );

      const myPreference = {
        state: me?.preference?.state ?? null,
        crop: me?.preference?.crop ?? null,
        domain: me?.preference?.domain ?? null,
      };
 
      const responseData = {
        myPreference,
        users: usersExceptMe,
        meta: {
          totalItems: usersExceptMe.length,
          totalPages: 1, // Simplified for manual select
          currentPage: page,
          limit,
        } as PaginationMetaDto
      };

      return plainToInstance(PaginatedUsersResponseDto, responseData, { excludeExtraneousValues: true });
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
  ): Promise<PaginatedUsersResponseDto> {
    return await this._withTransaction(async (session: ClientSession) => {
      const { experts, totalExperts, totalPages } = await this.userRepo.findAllExperts(
        page,
        limit,
        search,
        sort,
        filter,
        session,
      );

      return plainToInstance(PaginatedUsersResponseDto, {
        users: experts,
        meta: {
          totalItems: totalExperts,
          totalPages,
          currentPage: page,
          limit,
        } as PaginationMetaDto
      }, { excludeExtraneousValues: true });
    });
  }

  async blockUnblockExperts(userId: string, action: string) {
    return await this._withTransaction(async (session: ClientSession) => {
      if (action === "block") {
        const nonBlockedExpertsCount = await this.userRepo.countNonBlockedExperts(session);

        if (nonBlockedExpertsCount <= 10) {
          throw new BadRequestError(
            "Minimum 10 active experts required. Cannot block more experts."
          );
        }
      }
      return await this.userRepo.updateIsBlocked(userId, action, session);
    });
  }

  async updateActivityStatus(userId: string, status: 'active' | 'in-active') {
    return await this._withTransaction(async (session: ClientSession) => {
      if (status === "in-active") {
        const activeExpertsCount = await this.userRepo.countActiveExperts(session);
        if (activeExpertsCount <= 10) {
          throw new BadRequestError(
            "Minimum 10 active experts required. Cannot mark more experts inactive."
          );
        }
      }
      return await this.userRepo.updateActivityStatus(userId, status, session);
    });
  }

  async getUserByEmail(email: string): Promise<UserResponseDto | null> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findByEmail(email, session);
      return user ? plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }) : null;
    });
  }
}
