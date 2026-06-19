import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import {
  IUser,
  INotificationType,
  NotificationRetentionType,
  UserRole,
} from '#root/shared/interfaces/models.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
} from 'routing-controllers';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { ClientSession } from 'mongodb';
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
import {sendEmailNotification} from '#root/utils/mailer.js';
import { NotificationService } from '#root/modules/notification/services/NotificationService.js';

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

    @inject(GLOBAL_TYPES.NotificationService)
    private readonly notificationService: NotificationService,
  ) {
    super(mongoDatabase);
  }

  /** Lean list of all moderators ({_id, name, email}) for filter dropdowns. */
  async getModeratorsList(): Promise<{ _id: string; name: string; email: string }[]> {
    const moderators = await this.userRepo.findModerators();
    return moderators
      .map(m => ({
        _id: m._id?.toString() ?? '',
        name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.email || 'Unknown',
        email: m.email ?? '',
      }))
      .filter(m => m._id);
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
          { role: changeRoleTo },
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
    isSTF?: boolean,
  ): Promise<{ users: IUser[]; totalUsers: number; totalPages: number }> {
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
          isVerified,
          isSTF,
        );
      return { users, totalUsers, totalPages };
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
            assignedQuestionIds: (u.assignedQuestionIds ?? []).map(id =>
              id.toString(),
            ),
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
  ): Promise<{ experts: IUser[]; totalExperts: number; totalPages: number }> {
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
        // The minimum-experts guard protects the EXPERT pool only. Blocking a
        // moderator (e.g. moderator check-out, which toggles isBlocked) must not
        // be subject to it.
        const target = await this.userRepo.findById(userId, session);
        if (target?.role !== 'moderator') {
          const nonBlockedExpertsCount =
            await this.userRepo.countNonBlockedExperts(session);

          if (nonBlockedExpertsCount <= 10) {
            throw new BadRequestError(
              'Minimum 10 active experts required. Cannot block more experts.',
            );
          }
        }
      }
      return await this.userRepo.updateIsBlocked(userId, action, session);
    });
  }

  async updateSTFStatus(userId: string, action: string): Promise<void> {
    return await this._withTransaction(async (session: ClientSession) => {
      await this.userRepo.updateSTFStatus(userId, action, session);
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
          { isVerified },
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
            expertIdToRemove: expertId,
          },
          session,
        );

        await this.questionRepo.updateQuestion(
          questionId,
          {
            status: 'hold',
            isOnHold: true,
            holdAt: new Date(),
            isAutoAllocate: false,
          },
          session,
        );

        // Send notification to the expert that they have been removed from allocation
        try {
          const question = await this.questionRepo.getById(questionId, session);
          const truncatedQuestionText = question?.question
            ? question.question.length > 50
              ? question.question.substring(0, 50) + '...'
              : question.question
            : 'Question';
          
          await this.notificationService.saveTheNotifications(
            `You have been removed from the allocation. All your allocations have been cleared by an administrator.`,
            'Allocation Removed',
            questionId,
            expertId,
            'allocation_removal' as INotificationType,
          );
        } catch (notificationError) {
          console.error(
            `[removeExpertAllocations] ❌ Failed to send notification to expert ${expertId}:`,
            notificationError,
          );
        }

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

  async requestVerification(identifier: string): Promise<void> {
    try {
      if (!identifier) throw new BadRequestError('Identifier is required');

      return await this._withTransaction(async (session: ClientSession) => {
        const admins = await this.userRepo.findAdmins(session);
        if (admins && admins.length > 0) {
          const adminEmails = admins.map(admin => admin.email).filter(Boolean);
          if (adminEmails.length > 0) {
            const subject = 'New Verification Request';
            // const htmlMessage = `
            //   <div style="font-family: Arial, sans-serif; padding: 20px;">
            //     <h2 style="color: #4F46E5;">Verification Request</h2>
            //     <p>Hello Admin,</p>
            //     <p>A user with the following identifier has requested account verification:</p>
            //     <p><strong>${identifier}</strong></p>
            //     <br />
            //     <p>Please review their request in the admin dashboard.</p>
            //   </div>
            // `;
            const htmlMessage = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap" rel="stylesheet" />
            </head>
            <body style="margin: 0; padding: 0; background-color: #f2f2f0; font-family: 'Outfit', sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f2f2f0; padding: 40px 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #fdfdfb; border-radius: 8px; overflow: hidden; border: 1px solid #e8e8e4;">

                      <!-- Header -->
                      <tr>
                        <td style="background-color: #c5eedb; padding: 32px 40px; text-align: center; border-bottom: 1px solid #b0e4ca;">
                          <h1 style="margin: 0; color: #2d6650; font-size: 22px; font-weight: 600; font-family: 'Outfit', sans-serif; letter-spacing: 0.025em;">
                            Ajrasakha Reviewer System
                          </h1>
                          <p style="margin: 6px 0 0; color: #4a8c72; font-size: 13px; font-family: 'Outfit', sans-serif;">
                            desk.vicharanashala.ai
                          </p>
                        </td>
                      </tr>

                      <!-- Body -->
                      <tr>
                        <td style="padding: 36px 40px 24px;">

                          <p style="margin: 0 0 4px; font-size: 12px; color: #8a8a85; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; font-family: 'Outfit', sans-serif;">
                            Action Required
                          </p>
                          <h2 style="margin: 0 0 20px; font-size: 20px; color: #1a1a17; font-weight: 600; font-family: 'Outfit', sans-serif; letter-spacing: 0.025em;">
                            New Verification Request
                          </h2>

                          <p style="margin: 0 0 16px; font-size: 15px; color: #3a3a35; line-height: 1.6; font-family: 'Outfit', sans-serif;">
                            Hello Admin,
                          </p>
                          <p style="margin: 0 0 28px; font-size: 15px; color: #3a3a35; line-height: 1.6; font-family: 'Outfit', sans-serif;">
                            A user has submitted a verification request on the Ajrasakha Reviewer System and is awaiting your approval. Please review the details below and take the appropriate action.
                          </p>

                          <!-- User Info Card -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f2; border: 1px solid #e8e8e4; border-radius: 8px; margin-bottom: 28px;">
                            <tr>
                              <td style="padding: 20px 24px;">

                                <p style="margin: 0 0 3px; font-size: 11px; color: #9a9a95; text-transform: uppercase; letter-spacing: 0.07em; font-family: 'Outfit', sans-serif;">
                                  Requesting User
                                </p>
                                <p style="margin: 0 0 18px; font-size: 18px; color: #1a1a17; font-weight: 600; font-family: 'Outfit', sans-serif;">
                                  ${identifier}
                                </p>

                                <table cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td style="padding-right: 32px;">
                                      <p style="margin: 0 0 2px; font-size: 11px; color: #9a9a95; text-transform: uppercase; letter-spacing: 0.07em; font-family: 'Outfit', sans-serif;">Request Date</p>
                                      <p style="margin: 0; font-size: 14px; color: #3a3a35; font-family: 'Outfit', sans-serif;">
                                        ${new Date().toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'})}
                                      </p>
                                    </td>
                                    <td>
                                      <p style="margin: 0 0 2px; font-size: 11px; color: #9a9a95; text-transform: uppercase; letter-spacing: 0.07em; font-family: 'Outfit', sans-serif;">Status</p>
                                      <p style="margin: 0; font-size: 14px; font-weight: 600; font-family: 'Outfit', sans-serif;">
                                        <span style="display: inline-block; background-color: #fef9ec; color: #a0721a; border: 1px solid #f5dfa0; border-radius: 4px; padding: 2px 10px; font-size: 13px;">
                                          Pending Review
                                        </span>
                                      </p>
                                    </td>
                                  </tr>
                                </table>

                              </td>
                            </tr>
                          </table>

                          <!-- Dashboard Link -->
                          <p style="margin: 0 0 6px; font-size: 14px; color: #6b6b66; line-height: 1.6; font-family: 'Outfit', sans-serif;">
                            Or review all pending requests in the admin dashboard:
                          </p>
                          <a href="https://desk.vicharanashala.ai"
                            style="font-size: 14px; color: #4a8c72; text-decoration: underline; font-family: 'Outfit', sans-serif;">
                            Open Admin Dashboard →
                          </a>

                        </td>
                      </tr>

                      <!-- Divider -->
                      <tr>
                        <td style="padding: 0 40px;">
                          <hr style="border: none; border-top: 1px solid #e8e8e4; margin: 0;" />
                        </td>
                      </tr>

                      <!-- Footer -->
                      <tr>
                        <td style="padding: 24px 40px 32px;">
                          <p style="margin: 0; font-size: 12px; color: #9a9a95; line-height: 1.6; font-family: 'Outfit', sans-serif;">
                            This is an automated notification from the <strong style="color: #6b6b66;">Ajrasakha Web Application</strong>.
                            Please do not reply to this email. If you believe this was sent in error, you can safely ignore it
                            or contact your system administrator.
                          </p>
                          <p style="margin: 10px 0 0; font-size: 12px; color: #b8b8b3; font-family: 'Outfit', sans-serif;">
                            © ${new Date().getFullYear()} Annam.Ai · desk.vicharanashala.ai
                          </p>
                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
            `;
            await sendEmailNotification(
              adminEmails,
              subject,
              '',
              htmlMessage
            );
          }
        }
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to send verification request for identifier ${identifier}: ${error}`,
      );
    }
  }
  
  async getCallAgents(): Promise<IUser[]> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.userRepo.findCallAgents(session);
    });
  }


  async setCallAgentStatus(
    userId: string,
    isCallAgent: boolean,
    isCallAgentActive: boolean,
    requestingUserRole?: string,
  ): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      if (requestingUserRole !== 'admin') {
        throw new ForbiddenError('Only admin can manage call agents');
      }
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }
      // Only experts can be converted to call agents
      if (isCallAgent && user.role !== 'expert') {
        throw new BadRequestError(
          'Only experts can be set as call agents',
        );
      }
      // When removing call agent status, user must be a call_agent
      if (!isCallAgent && user.role !== ('call_agent' as any)) {
        throw new BadRequestError(
          'User is not a call agent',
        );
      }
      const res = await this.userRepo.setCallAgentStatus(
        userId,
        isCallAgent,
        isCallAgentActive,
        session,
      );
      return res;
    });
  }



  async toggleCallAgentActive(userId: string, requestingUserRole?: string): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      // Only moderators can manage call agents
      if (requestingUserRole !== 'admin') {
        throw new ForbiddenError('Only admin can manage call agents');
      }
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      if (user.role !== ('call_agent' as any)) {
        throw new BadRequestError('User is not a call agent');
      }
      return await this.userRepo.toggleCallAgentActive(userId, session);
    });
  }
}
