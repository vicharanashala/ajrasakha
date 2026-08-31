import { inject, injectable } from 'inversify';
import ExcelJS from 'exceljs';
import { GLOBAL_TYPES } from '#root/types.js';
import {
  IUser,
  INotificationType,
  NotificationRetentionType,
  UserRole,
  IUserHistory,
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
import { appConfig } from '#root/config/app.js';
import { NotificationService } from '#root/modules/notification/services/NotificationService.js';
import { TrendGranularity } from '#root/shared/database/providers/mongo/repositories/UserRepository.js';

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

  async getPaeValidationExperts(): Promise<
    { _id: string; name: string; email: string }[]
  > {
    const experts = await this.userRepo.findAvailablePaeExperts();
    return experts.map((expert) => ({
      _id: expert._id?.toString() ?? '',
      name: `${expert.firstName ?? ''} ${expert.lastName ?? ''}`.trim() || expert.email || 'Unknown',
      email: expert.email ?? '',
    }));
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
  async getUserReviewLevel(query: ExpertReviewLevelDto, isTrainingUser?: boolean, isAdmin?: boolean): Promise<any> {
    try {
      //if (!query.userId) throw new NotFoundError('User ID is required');

      return this._withTransaction(async (session: ClientSession) => {
        if (query.role == 'moderator') {
          const moderatorResult =
            await this.questionSubmissionRepo.getModeratorReviewLevel(query,isTrainingUser,isAdmin);
          return moderatorResult;
        }
        const result =
          await this.questionSubmissionRepo.getUserReviewLevel(query,isTrainingUser,isAdmin);

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

      const editableFields = [
        'firstName',
        'lastName',
        'mobile',
        'university',
        'kvkCovered',
        'preference',
        'avatar',
      ] as const;
      const sanitizedData: Partial<IUser> = {};

      for (const field of editableFields) {
        if (Object.prototype.hasOwnProperty.call(data, field)) {
          (sanitizedData as any)[field] = (data as any)[field];
        }
      }

      if (
        Object.keys(sanitizedData).length === 0 &&
        Object.keys(data).length > 0
      ) {
        throw new BadRequestError('No editable profile fields provided');
      }

      if (sanitizedData.firstName !== undefined && !sanitizedData.firstName.trim())
        throw new BadRequestError('Firstname cannot be empty or blank space');
      if (sanitizedData.mobile !== undefined && !sanitizedData.mobile.trim())
        throw new BadRequestError(
          'Mobile number cannot be empty or blank space',
        );
      if (sanitizedData.university !== undefined && !sanitizedData.university.trim())
        throw new BadRequestError(
          'University name cannot be empty or blank space',
        );
      // Title-case a value so entries persist consistently ("kl university" → "Kl University").
      const toTitleCase = (v: unknown) =>
        typeof v === 'string'
          ? v.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
          : '';
      // Same, but keep the "all" sentinel lowercase so domain/district "all" checks keep working.
      const titleCaseOrAll = (v: unknown) => {
        const s = typeof v === 'string' ? v.trim() : '';
        return s.toLowerCase() === 'all' ? 'all' : toTitleCase(s);
      };

      if (sanitizedData.kvkCovered !== undefined && sanitizedData.kvkCovered !== null) {
        const raw = Array.isArray(sanitizedData.kvkCovered)
          ? sanitizedData.kvkCovered
          : [];
        sanitizedData.kvkCovered = raw
          .map((item: any) => {
            // New shape: { state, district, name }. Legacy: a plain KVK-name string.
            if (item && typeof item === 'object') {
              return {
                state: toTitleCase(item.state),
                district: toTitleCase(item.district),
                name: toTitleCase(item.name),
              };
            }
            return { state: '', district: '', name: toTitleCase(item) };
          })
          .filter((item: {name: string}) => item.name);
      }

      // Store preference district and domain in Title Case (preserving the "all" sentinel).
      if (sanitizedData.preference) {
        const pref: any = sanitizedData.preference;
        if (typeof pref.district === 'string') {
          pref.district = titleCaseOrAll(pref.district);
        }
        if (Array.isArray(pref.domain)) {
          pref.domain = pref.domain.map((d: unknown) => titleCaseOrAll(d)).filter(Boolean);
        } else if (typeof pref.domain === 'string') {
          pref.domain = titleCaseOrAll(pref.domain);
        }
      }
      const authService = getFromContainer(FirebaseAuthService);

      return this._withTransaction(async (session: ClientSession) => {
        const updatedUser = await this.userRepo.edit(userId, sanitizedData, session);
        if (!updatedUser)
          throw new NotFoundError(`User with ID ${userId} not found`);
        if (sanitizedData.firstName || sanitizedData.lastName) {
          await authService.updateFirebaseUser(updatedUser.firebaseUID, {
            firstName: sanitizedData.firstName ?? updatedUser.firstName,
            lastName: sanitizedData.lastName ?? updatedUser.lastName,
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
      if (
        !currentUser ||
        (currentUser.role !== 'admin' && currentUser.role !== 'gate_keeper')
      ) {
        throw new ForbiddenError('Only admin or gate keeper can switch user roles');
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

  /**
   * Build an .xlsx of all users matching the SAME filters the admin user-management
   * list uses (search / sort / state filter / role / blocked / verified / STF), with
   * one row per user. Only human/personal details are included — preference is split
   * into its own columns (state / district / crop / domain) — and work/system fields
   * (assigned questions, reputation, penalty, incentive, etc.), the password and the
   * firebase id are excluded. Returns the workbook as a Buffer.
   */
  async exportUsersToXlsx(opts: {
    search?: string;
    sort?: string;
    filter?: string;
    role?: string;
    isBlocked?: boolean;
    isVerified?: boolean;
    isSTF?: boolean;
    isTMU?: boolean;
  }): Promise<ArrayBuffer> {
    // Fetch every matching user (no pagination) via the same query the list uses.
    // 1_000_000 is an effective "no limit" cap — far above the total user count.
    const { users } = await this.userRepo.findAllUsers(
      1,
      1_000_000,
      opts.search || '',
      opts.sort || '',
      opts.filter || '',
      opts.role || 'ALL',
      opts.isBlocked,
      opts.isVerified,
      opts.isSTF,
      opts.isTMU,
    );

    const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
    const asIST = (v: any): string => {
      if (!v) return '';
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return '';
      return new Date(d.getTime() + IST_OFFSET_MS)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 16);
    };
    const yesNo = (v: any): string => (v === true ? 'Yes' : v === false ? 'No' : '');
    const joinArr = (v: any): string =>
      Array.isArray(v) ? v.filter(Boolean).join(', ') : (v ?? '');
    // KVKs → "State / District — Name; …" (each entry may be partial).
    const fmtKvk = (v: any): string =>
      Array.isArray(v)
        ? v
            .map((k: any) =>
              [k?.state, k?.district].filter(Boolean).join(' / ') +
              (k?.name ? ` — ${k.name}` : ''),
            )
            .filter(s => s.trim())
            .join('; ')
        : '';

    // Curated, human-readable columns only.
    const columns: { header: string; value: (u: any) => any }[] = [
      { header: 'ID', value: u => u._id?.toString() ?? '' },
      { header: 'First Name', value: u => u.firstName ?? '' },
      { header: 'Last Name', value: u => u.lastName ?? '' },
      { header: 'Email', value: u => u.email ?? '' },
      { header: 'Mobile', value: u => u.mobile ?? '' },
      { header: 'Role', value: u => u.role ?? '' },
      { header: 'Status', value: u => u.status ?? '' },
      { header: 'Blocked', value: u => yesNo(u.isBlocked) },
      { header: 'Verified', value: u => yesNo(u.isVerified) },
      { header: 'University', value: u => u.university ?? '' },
      { header: 'Preferred State', value: u => u.preference?.state ?? '' },
      { header: 'Preferred District', value: u => u.preference?.district ?? '' },
      { header: 'Preferred Crop', value: u => u.preference?.crop ?? '' },
      { header: 'Preferred Domain', value: u => joinArr(u.preference?.domain) },
      { header: 'KVK Covered', value: u => fmtKvk(u.kvkCovered) },
      { header: 'Last Check-In', value: u => asIST(u.lastCheckInAt) },
      { header: 'Created At', value: u => asIST(u.createdAt) },
      { header: 'Updated At', value: u => asIST(u.updatedAt) },
    ];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.columns = columns.map(c => ({ header: c.header, key: c.header, width: 22 }));
    sheet.getRow(1).font = { bold: true };

    for (const u of users as any[]) {
      const row: Record<string, any> = {};
      for (const c of columns) row[c.header] = c.value(u);
      sheet.addRow(row);
    }

    return (await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer;
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
    isTMU?: boolean,
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
          isTMU,
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
    includeSelf = false,
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<UsersNameResponseDto> {
    try {
      return await this._withTransaction(async session => {
        const me = await this.userRepo.findById(userId, session);
        const users = await this.userRepo.findAll(session,isTrainingUser,isAdmin);
        // The caller is excluded by default: most manual-select flows are handing work
        // to someone else (re-routing an answer, reallocating a question). Gate keepers /
        // auditors assigning a question to themselves pass includeSelf.
        const usersExceptMe = includeSelf
          ? users
          : users.filter(user => user._id.toString() !== userId);

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
            status: u.status ?? 'active',
            special_task_force: u.special_task_force,
            special_task_force_moderator: u.special_task_force_moderator,
            mobile: u.mobile ?? '',
            university: u.university ?? '',
            kvkCovered: u.kvkCovered ?? null,
            state: u.preference?.state ?? null,
            domain: u.preference?.domain ?? null,
            assignedQuestionIds: (u.assignedQuestionIds ?? []).map(a => ({
              questionId: a.questionId?.toString(),
              status: a.status,
            })),
            isTrainingUser: u.isTrainingUser ?? false,
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
    currentUser?: IUser,
  ): Promise<{ experts: IUser[]; totalExperts: number; totalPages: number }> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.userRepo.findAllExperts(
        page,
        limit,
        search,
        sort,
        filter,
        currentUser?.role === 'moderator'
          ? currentUser.isTrainingUser === true
          : undefined,
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

         /* if (nonBlockedExpertsCount <= 10) {
            throw new BadRequestError(
              'Minimum 10 active experts required. Cannot block more experts.',
            );
          }*/
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
      /*  if (activeExpertsCount <= 10) {
          throw new BadRequestError(
            'Minimum 10 active experts required. Cannot mark more experts inactive.',
          );
        }*/
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
        // When verifying a user, also unblock them and set status to active
        // so they can access the platform after approval
        const updatedUser = await this.userRepo.edit(
          userId,
          { 
            isVerified,
            isBlocked: false,
            status: 'active' as const,
          },
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
    if (
      !currentUser ||
      (currentUser.role !== 'admin' && currentUser.role !== 'gate_keeper')
    ) {
      throw new ForbiddenError(
        'Only admin or gate keeper can remove expert allocations',
      );
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
            const requestDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
            const currentYear = new Date().getFullYear();
            const frontendUrl = appConfig.frontendUrl;
            const htmlMessage = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <meta name="color-scheme" content="light" />
              <meta name="supported-color-schemes" content="light" />
              <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
              <title>New Registration Request</title>
            </head>
            <body style="margin: 0; padding: 0; background-color: #eef1ef; font-family: 'Outfit', Arial, sans-serif;">
              <!-- Preheader (hidden preview text) -->
              <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
                ${identifier} has requested registration approval on Ajrasakha Reviewer System.
              </div>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #eef1ef; padding: 40px 16px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e3e6e2; box-shadow: 0 1px 3px rgba(20, 40, 30, 0.06);">

                      <!-- Logo bar -->
                      <tr>
                        <td style="background-color: #ffffff; padding: 20px 40px; text-align: center; border-bottom: 1px solid #e3e6e2;">
                          <img src="${frontendUrl}/annam-logo.png" alt="Annam.ai" width="130" height="auto" style="display: block; margin: 0 auto; max-width: 130px; border: 0;" />
                        </td>
                      </tr>

                      <!-- Header -->
                      <tr>
                        <td style="background-color: #1f5f45; padding: 24px 40px; text-align: center;">
                          <p style="margin: 0; color: #ffffff; font-size: 17px; font-weight: 700; font-family: 'Outfit', Arial, sans-serif; letter-spacing: 0.02em;">
                            Ajrasakha Reviewer System
                          </p>
                          <p style="margin: 4px 0 0; font-size: 12.5px; font-family: 'Outfit', Arial, sans-serif;">
                            <a href="${frontendUrl}" style="color: #bfe0cf; text-decoration: none; font-family: 'Outfit', Arial, sans-serif;">ajrasakha-desk.annam.ai</a>
                          </p>
                        </td>
                      </tr>

                      <!-- Accent stripe -->
                      <tr>
                        <td style="height: 4px; background-color: #2f8f66; line-height: 4px; font-size: 0;">&nbsp;</td>
                      </tr>

                      <!-- Body -->
                      <tr>
                        <td style="padding: 40px 40px 24px;">

                          <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 20px;">
                            <tr>
                              <td style="background-color: #fef3d9; border-radius: 4px; padding: 4px 10px;">
                                <span style="font-size: 11px; font-weight: 600; color: #96650f; text-transform: uppercase; letter-spacing: 0.06em; font-family: 'Outfit', Arial, sans-serif;">
                                  Action Required
                                </span>
                              </td>
                            </tr>
                          </table>

                          <h1 style="margin: 0 0 16px; font-size: 21px; line-height: 1.3; color: #1a1e1b; font-weight: 700; font-family: 'Outfit', Arial, sans-serif;">
                            New Registration Request
                          </h1>

                          <p style="margin: 0 0 14px; font-size: 15px; color: #454a46; line-height: 1.6; font-family: 'Outfit', Arial, sans-serif;">
                            Hello Admin,
                          </p>
                          <p style="margin: 0 0 28px; font-size: 15px; color: #454a46; line-height: 1.6; font-family: 'Outfit', Arial, sans-serif;">
                            A new user has submitted a registration request on the Ajrasakha Web Application and is awaiting your approval. Please review the details below and take the appropriate action.
                          </p>

                          <!-- Role reminder callout -->
                          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 28px;">
                            <tr>
                              <td style="background-color: #f0f7f4; border-left: 3px solid #1f5f45; border-radius: 0 6px 6px 0; padding: 14px 18px;">
                                <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #1f5f45; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Outfit', Arial, sans-serif;">Before Approving</p>
                                <p style="margin: 0; font-size: 13.5px; color: #383d39; line-height: 1.65; font-family: 'Outfit', Arial, sans-serif;">
                                  Please ensure the user's <strong>role is correctly set</strong> before granting access. If this is a test or internal account, set the role to <strong style="color: #1f5f45;">INTERNAL</strong> before approving.
                                </p>
                              </td>
                            </tr>
                          </table>

                          <!-- User Info Card -->
                          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f6f8f6; border: 1px solid #e3e6e2; border-radius: 10px; margin-bottom: 28px;">
                            <tr>
                              <td style="padding: 22px 24px;">
                                <p style="margin: 0 0 4px; font-size: 11px; color: #8b918c; text-transform: uppercase; letter-spacing: 0.06em; font-family: 'Outfit', Arial, sans-serif;">
                                  Requesting User
                                </p>
                                <p style="margin: 0 0 20px; font-size: 18px; color: #1a1e1b; font-weight: 600; font-family: 'Outfit', Arial, sans-serif;">
                                  ${identifier}
                                </p>

                                <table cellpadding="0" cellspacing="0" role="presentation">
                                  <tr>
                                    <td style="padding-right: 40px;">
                                      <p style="margin: 0 0 3px; font-size: 11px; color: #8b918c; text-transform: uppercase; letter-spacing: 0.06em; font-family: 'Outfit', Arial, sans-serif;">
                                        Request Date
                                      </p>
                                      <p style="margin: 0; font-size: 14px; color: #383d39; font-family: 'Outfit', Arial, sans-serif;">
                                        ${requestDate}
                                      </p>
                                    </td>
                                    <td>
                                      <p style="margin: 0 0 3px; font-size: 11px; color: #8b918c; text-transform: uppercase; letter-spacing: 0.06em; font-family: 'Outfit', Arial, sans-serif;">
                                        Status
                                      </p>
                                      <span style="display: inline-block; background-color: #fef3d9; color: #96650f; border: 1px solid #f3dda2; border-radius: 4px; padding: 3px 10px; font-size: 12.5px; font-weight: 600; font-family: 'Outfit', Arial, sans-serif;">
                                        Pending Review
                                      </span>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>

                          <!-- CTA Button -->
                          <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 8px;">
                            <tr>
                              <td style="border-radius: 8px; background-color: #1f5f45;">
                                <a href="${frontendUrl}/chatbot?source=web-application&view=dashboard&user=all"
                                  style="display: inline-block; padding: 13px 28px; font-size: 14.5px; font-weight: 600; color: #ffffff; text-decoration: none; font-family: 'Outfit', Arial, sans-serif; border-radius: 8px;">
                                  Review Request
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- Divider -->
                      <tr>
                        <td style="padding: 0 40px;">
                          <hr style="border: none; border-top: 1px solid #e3e6e2; margin: 0;" />
                        </td>
                      </tr>

                      <!-- Footer -->
                      <tr>
                        <td style="padding: 24px 40px 32px;">
                          <p style="margin: 0; font-size: 12px; color: #9a9fa0; line-height: 1.6; font-family: 'Outfit', Arial, sans-serif;">
                            This is an automated notification from the <strong style="color: #6b706c;">Ajrasakha</strong>.
                            Please do not reply to this email. If you believe this was sent in error, you can safely ignore it
                            or contact your system administrator.
                          </p>
                          <p style="margin: 10px 0 0; font-size: 12px; color: #b8bcb8; font-family: 'Outfit', Arial, sans-serif;">
                            &copy; ${currentYear} Annam.Ai 
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
    requestingUser?: IUser,
  ): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      if (requestingUser?.role !== 'admin' || !requestingUser?.Call_centre_manager) {
        throw new ForbiddenError(
          'Only admin with Call_centre_manager field as true can manage call agents',
        );
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



  async toggleCallAgentActive(userId: string, requestingUser?: IUser): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      // Only moderators can manage call agents
      if (requestingUser?.role !== 'admin' || !requestingUser?.Call_centre_manager) {
        throw new ForbiddenError(
          'Only admin with Call_centre_manager field as true can manage call agents',
        );
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

  /**
   * Sets a call agent as online and assigns them an agent number
   * This should be called by the agent themselves when they go online
   */
  async setAgentOnline(userId: string): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      if (user.role !== ('call_agent' as any)) {
        throw new BadRequestError('User is not a call agent');
      }

      // Find the smallest available agent number
      const allCallAgents = await this.userRepo.findCallAgents(session);
      const assignedNumbers = new Set<string>();
      for (const agent of allCallAgents) {
        if (agent.agent && agent.agent !== 'not_available' && agent.isCallAgentActive) {
          assignedNumbers.add(agent.agent);
        }
      }

      let agentNumber = 1;
      while (assignedNumbers.has(`agent_${agentNumber}`)) {
        agentNumber++;
      }

      const assignedAgent = `agent_${agentNumber}`;

      // Update the user with the assigned agent number and set them as active
      const updatedUser = await this.userRepo.edit(userId, {
        agent: assignedAgent,
        isCallAgentActive: true,
        isBusy: false,
        currentCallUuid: null,
        lastAgentActiveAt: new Date()
      }, session);

      return updatedUser;
    });
  }

  /**
   * Sets a call agent as offline and releases their agent number
   * This should be called by the agent themselves when they go offline
   */
  async setAgentOffline(userId: string): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      if (user.role !== ('call_agent' as any)) {
        throw new BadRequestError('User is not a call agent');
      }

      // Update the user to release their agent number and set them as inactive
      const updatedUser = await this.userRepo.edit(userId, {
        agent: 'not_available',
        isCallAgentActive: false,
        isBusy: false,
        currentCallUuid: null
      }, session);

      return updatedUser;
    });
  }

  /**
   * Updates the heartbeat timestamp for an active agent
   */
  async updateAgentHeartbeat(userId: string): Promise<void> {
    await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      if (user.role !== ('call_agent' as any)) {
        throw new BadRequestError('User is not a call agent');
      }

      await this.userRepo.edit(userId, {
        lastAgentActiveAt: new Date()
      }, session);
    });
  }

  /**
   * Cleanup inactive agents who haven't sent a heartbeat for over 75 seconds
   */
  async cleanupInactiveAgents(): Promise<void> {
    const activeAgents = await this.userRepo.findActiveCallAgents();
    if (activeAgents.length === 0) {
      return; // Run only if there are active agents
    }

    const oneMinuteAgo = new Date(Date.now() - 75 * 1000); // 75 seconds ago
    const inactiveAgents = activeAgents.filter(
      agent =>
        !agent.lastAgentActiveAt || new Date(agent.lastAgentActiveAt) < oneMinuteAgo
    );

    if (inactiveAgents.length > 0) {
      for (const agent of inactiveAgents) {
        try {
          const userId = agent._id.toString();
          await this.setAgentOffline(userId);
        } catch (error) {
          console.error(`[AGENT-CLEANUP] Failed to mark agent ${agent._id} offline:`, error);
        }
      }
    }
  }

  /**
   * Marks an agent as busy when they answer a call
   * This should be called via Plivo webhook when a call is answered
   */
  async markAgentAsBusy(userId: string, callUuid: string): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        console.error(`❌ [USER-SERVICE] User not found: ${userId}`);
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      const updatedUser = await this.userRepo.edit(userId, {
        isBusy: true,
        currentCallUuid: callUuid
      }, session);

      return updatedUser;
    });
  }

  /**
   * Marks an agent as available when their call ends
   * This should be called via Plivo webhook when a call ends
   */
  async markAgentAsAvailable(userId: string): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      const updatedUser = await this.userRepo.edit(userId, {
        isBusy: false,
        currentCallUuid: null
      }, session);

      return updatedUser;
    });
  }

  /**
   * Finds the next available agent (active + not busy)
   * This should be called when routing an incoming call
   */
  async findAvailableAgent(): Promise<IUser | null> {
    return await this._withTransaction(async (session: ClientSession) => {
      const activeAgents = await this.userRepo.findCallAgents(session);
      // Filter agents that are active, not busy, and have an assigned agent number
      const availableAgents = activeAgents.filter(
        agent => 
          agent.isCallAgentActive === true && 
          agent.isBusy === false && 
          agent.agent && 
          agent.agent !== 'not_available'
      );

      if (availableAgents.length === 0) {
        console.log(`⚠️ [USER-SERVICE] No available agents found`);
        return null;
      }

      // Sort by agent number to get the smallest available number
      availableAgents.sort((a, b) => {
        const numA = parseInt(a.agent?.replace('agent_', '') || '999');
        const numB = parseInt(b.agent?.replace('agent_', '') || '999');
        return numA - numB;
      });

      const selectedAgent = availableAgents[0];
      return selectedAgent;
    });
  }

  /**
   * Atomically find and mark an available agent as busy
   * This prevents race conditions when multiple calls come in simultaneously
   */
  async findAndMarkAvailableAgent(callUuid: string): Promise<IUser | null> {
    return await this.userRepo.findAndMarkAvailableAgent(callUuid);
  }

  //get user history by id
  async getUserHistoryById(query: { userId: string; startDateTime?: string; endDateTime?: string }): Promise<IUserHistory> {
    try {
      const { userId } = query;
      if (!userId) throw new NotFoundError('User ID is required');

      return this._withTransaction(async (session: ClientSession) => {
        let user = await this.userRepo.findById(userId, session);
        if (!user) throw new NotFoundError(`User with ID ${userId} not found`);
        return await this.userRepo.getUserHistory(query, session);
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError(
        `Failed to fetch user history`,
      );
    }
  }

   async updateTrainingUserStatus(userId: string, action: string): Promise<void> {
    return await this._withTransaction(async (session: ClientSession) => {
      await this.userRepo.updateTrainingUserStatus(userId, action, session);
    });
   }

   async getWorkingHours(query: { userId: string; startDateTime: string; endDateTime: string }): Promise<{ workingHours: number }> {
    try {
      const { userId, startDateTime, endDateTime } = query;
      if (!userId) throw new NotFoundError('User ID is required');

      return this._withTransaction(async (session: ClientSession) => {
        const user = await this.userRepo.findById(userId, session);
        if (!user) throw new NotFoundError(`User with ID ${userId} not found`);

        const history = await this.userRepo.getUserHistory({ userId, startDateTime, endDateTime }, session);
        
        let totalMs = 0;
        const startLimit = new Date(startDateTime).getTime();
        const endLimit = new Date(endDateTime).getTime();
        const now = new Date().getTime();

        (history.roleHistory || []).forEach((item) => {
          if (item.isBlocked === true) return;

          const fromTime = item.from ? new Date(item.from).getTime() : null;
          if (!fromTime) return;

          const toTime = item.to ? new Date(item.to).getTime() : now;

          const start = Math.max(fromTime, startLimit);
          const end = Math.min(toTime, endLimit);

          if (end > start) {
            totalMs += end - start;
          }
        });
        const workingHours = Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;
        return { workingHours };
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError(`Failed to calculate working hours: ${error}`);
    }
  }

  async getWorkingHoursTrend(
  query: {
    userId: string;
    startDateTime: string;
    endDateTime: string;
    granularity: TrendGranularity;
  },
): Promise<any> {
  try {
    const { userId } = query;

    if (!userId) {
      throw new NotFoundError('User ID is required');
    }

    return this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId, session);

      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      return await this.userRepo.getWorkingHoursTrend(
        query,
        session,
      );
    });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof BadRequestError
    ) {
      throw error;
    }

    throw new InternalServerError(
      'Failed to fetch working hours trend',
    );
  }
}

  async getUsersByRole(
    roles: UserRole[],
  ): Promise<{ _id: string; name: string; email: string }[]> {
    if (!roles?.length) {
      throw new BadRequestError('At least one role must be provided');
    }

    const users = await this.userRepo.getUsersByRole(roles);

    return users
      .map((user) => ({
        _id: user._id?.toString() ?? '',
        name:
          `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
          user.email ||
          'Unknown',
        email: user.email ?? '',
      }))
      .filter((user) => user._id);
  }

}
