import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  IUser,
  NotificationRetentionType,
  UserRole,
} from '#root/shared/interfaces/models.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
} from 'routing-controllers';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {ClientSession} from 'mongodb';
import {
  PreferenceDto,
  UsersNameResponseDto,
  ExpertReviewLevelDto,
} from '#root/modules/user/validators/UserValidators.js';
import {INotificationRepository} from '#root/shared/database/interfaces/INotificationRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {getFromContainer} from 'class-validator';
import {FirebaseAuthService} from '#root/modules/auth/services/FirebaseAuthService.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';

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

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,
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
        const result =
          await this.questionSubmissionRepo.getUserReviewLevel(query);

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

      if (data.firstName !== undefined && !data.firstName.trim())
        throw new BadRequestError('Firstname cannot be empty or blank space');
      if (data.mobile !== undefined && !data.mobile.trim())
        throw new BadRequestError(
          'Mobile number cannot be empty or blank space',
        );
      if (data.university !== undefined && !data.university.trim())
        throw new BadRequestError(
          'University name cannot be empty or blank space',
        );
      const authService = getFromContainer(FirebaseAuthService);

      return this._withTransaction(async (session: ClientSession) => {
        const updatedUser = await this.userRepo.edit(userId, data, session);
        if (!updatedUser)
          throw new NotFoundError(`User with ID ${userId} not found`);
        if (data.firstName || data.lastName) {
          await authService.updateFirebaseUser(updatedUser.firebaseUID, {
            firstName: data.firstName ?? updatedUser.firstName,
            lastName: data.lastName ?? updatedUser.lastName,
          });
        }
        return updatedUser;
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to update user with ID ${userId}: ${error}`,
      );
    }
  }

  async updateUserRole(
    currentUser: IUser,
    userId: string,
    changeRoleTo: UserRole,
  ): Promise<IUser> {
    try {
      if (!currentUser || currentUser.role !== 'admin') {
        throw new ForbiddenError('Only admin can switch user roles');
      }

      if (!userId) {
        throw new BadRequestError('User ID is required');
      }

      return this._withTransaction(async (session: ClientSession) => {
        const user = await this.userRepo.findById(userId, session);

        if (!user) {
          throw new NotFoundError(`User with ID ${userId} not found`);
        }

        // Prevent unnecessary update
        if (user.role === changeRoleTo) {
          throw new BadRequestError(`User already has role ${changeRoleTo}`);
        }

        const updatedUser = await this.userRepo.edit(
          userId,
          {role: changeRoleTo},
          session,
        );

        if (!updatedUser) {
          throw new InternalServerError('Failed to update user role');
        }

        return updatedUser;
      });
    } catch (error) {
      // Preserve known errors
      if (
        error instanceof BadRequestError ||
        error instanceof NotFoundError ||
        error instanceof ForbiddenError
      ) {
        throw error;
      }

      throw new InternalServerError(
        `Failed to update role for user ID ${userId}`,
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
    isVerified?: boolean,
  ): Promise<{users: IUser[]; totalUsers: number; totalPages: number}> {
    return await this._withTransaction(async () => {
      const {users, totalUsers, totalPages} = await this.userRepo.findAllUsers(
        page,
        limit,
        search,
        sort,
        filter,
        role,
        isBlocked,
        isVerified,
      );
      return {users, totalUsers, totalPages};
    });
  }
  async getAllUsersforManualSelect(
    userId: string,
    page: number,
    limit: number,
    search: string,
    sort: string,
    filter: string,
  ): Promise<UsersNameResponseDto> {
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
          users: usersExceptMe.map(u => ({
            _id: u._id.toString(),
            role: u.role,
            email: u.email,
            preference: u.preference,
            userName: `${u.firstName} ${u.lastName ? u.lastName : ''}`.trim(),
            firstName: u.firstName ?? '',
            lastName: u.lastName ?? '',
            reputation_score: u.reputation_score ?? 0,
            incentive: u.incentive ?? 0,
            penaltyPercentage: u.penalty ?? 0,
            createdAt: u.createdAt ?? null,
            isBlocked: u.isBlocked,
            special_task_force: u.special_task_force,
            special_task_force_moderator: u.special_task_force_moderator,
            mobile: u.mobile ?? '',
            university: u.university ?? '',
            state: u.preference?.state ?? null,
            domain: u.preference?.domain ?? null,
          })),
          totalUsers: users.length,
          totalPages: 5,
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
      if (action === 'block') {
        const nonBlockedExpertsCount =
          await this.userRepo.countNonBlockedExperts(session);

        if (nonBlockedExpertsCount <= 10) {
          throw new BadRequestError(
            'Minimum 10 active experts required. Cannot block more experts.',
          );
        }
      }
      return await this.userRepo.updateIsBlocked(userId, action, session);
    });
  }

  async updateActivityStatus(userId: string, status: 'active' | 'in-active') {
    return await this._withTransaction(async (session: ClientSession) => {
      if (status === 'in-active') {
        const activeExpertsCount =
          await this.userRepo.countActiveExperts(session);
        if (activeExpertsCount <= 10) {
          throw new BadRequestError(
            'Minimum 10 active experts required. Cannot mark more experts inactive.',
          );
        }
      }
      return await this.userRepo.updateActivityStatus(userId, status, session);
    });
  }

  async getUserByEmail(email: string): Promise<IUser | null> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.userRepo.findByEmail(email, session);
    });
  }

  async verifyUser(userId: string, isVerified: boolean): Promise<IUser> {
    try {
      if (!userId) throw new NotFoundError('User ID is required');

      return this._withTransaction(async (session: ClientSession) => {
        const updatedUser = await this.userRepo.edit(
          userId,
          {isVerified},
          session,
        );
        if (!updatedUser)
          throw new NotFoundError(`User with ID ${userId} not found`);
        return updatedUser;
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to verify user with ID ${userId}: ${error}`,
      );
    }
  }

  async removeExpertAllocations(
    currentUser: IUser,
    expertId: string,
  ): Promise<{
    questionsAffected: number;
    removedQueues: number;
    workloadBefore: number;
    workloadAfter: number;
    questionIds: string[];
  }> {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new ForbiddenError('Only admins can remove expert allocations');
    }

    return this._withTransaction(async (session: ClientSession) => {
      const expert = await this.userRepo.findById(expertId, session);
      if (!expert) {
        throw new NotFoundError(`User with ID ${expertId} not found`);
      }

      if (expert.role !== 'expert' && expert.role !== 'pae_expert') {
        throw new BadRequestError(
          'Allocations can only be removed for expert users',
        );
      }

      const workloadBefore =
        typeof expert.reputation_score === 'number'
          ? expert.reputation_score
          : 0;

      const submissions =
        await this.questionSubmissionRepo.findByQueuedExpertId(
          expertId,
          session,
        );

      let questionsAffected = 0;
      const questionIds: string[] = [];

      for (const submission of submissions) {
        const queue = submission.queue || [];
        if (queue.length === 0) continue;

        const hasTargetExpert = queue.some(
          queuedExpertId => queuedExpertId.toString() === expertId,
        );
        if (!hasTargetExpert) continue;

        const history = submission.history || [];
        let activeExpertId: string | null = null;

        if (history.length === 0) {
          activeExpertId = queue[0] ? queue[0].toString() : null;
        } else {
          const lastHistory = history[history.length - 1];
          if (lastHistory?.status === 'in-review' && lastHistory.updatedBy) {
            activeExpertId = lastHistory.updatedBy.toString();
          }
        }

        if (activeExpertId !== expertId) {
          continue; // skip if the expert to be removed is not the active expert for this submission
        }

        if (activeExpertId) {
          await this.userRepo.updateReputationScore(
            activeExpertId,
            false,
            session,
          );
        }

        const shouldPopHistory =
          history.length > 0 &&
          history[history.length - 1]?.status === 'in-review';

        // const hasReviewed = history.some(
        //   item =>
        //     item.status === 'reviewed' ||
        //     item.status === 'approved' ||
        //     item.status === 'rejected' ||
        //     item.answer, // consider any history with an answer as reviewed
        // );

        let updatedQueue = [];

        if (history.length == 0) {
          // If there's no history, we can simply remove the expert from the queue without worrying about the order of experts in the history.
          updatedQueue = [];
        } else {
          const removeIndex = queue.findIndex(
            queuedExpertId => queuedExpertId.toString() === expertId,
          );

          if (removeIndex !== -1) {
            updatedQueue = queue.slice(0, removeIndex);
          }
        }

        const questionId = submission.questionId.toString();

        await this.questionSubmissionRepo.updateSubmissionState(
          questionId,
          {
            queue: updatedQueue,
            popHistory: shouldPopHistory,
          },
          session,
        );

        await this.questionRepo.updateQuestion(
          questionId,
          {isAutoAllocate: false},
          session,
        );

        questionsAffected += 1;
        questionIds.push(submission.questionId.toString());
      }

      await this.userRepo.setReputationScore(expertId, 0, session);

      return {
        questionsAffected,
        removedQueues: questionsAffected,
        workloadBefore,
        workloadAfter: 0,
        questionIds,
      };
    });
  }
}
