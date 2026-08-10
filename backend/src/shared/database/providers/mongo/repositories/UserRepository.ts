import {IUserRepository} from '#shared/database/interfaces/IUserRepository.js';
import {
  IUser,
  IUserRoleHistory,
  UserRole,
  NotificationRetentionType,
  IAnswer,
  ICropRef,
  QuestionStatus,
  QuestionSource,
  IUserHistory,
} from '#shared/interfaces/models.js';
import {instanceToPlain} from 'class-transformer';
import {injectable, inject} from 'inversify';
import {Collection, MongoClient, ClientSession, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {
  InternalServerError,
  NotFoundError,
  BadRequestError,
} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {User} from '#auth/classes/transformers/User.js';
import {PreferenceDto} from '#root/modules/user/validators/UserValidators.js';
import {
  ExpertPerformance,
  ModeratorApprovalRate,
  UserRoleOverview,
} from '#root/modules/dashboard/validators/DashboardValidators.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';

export type TrendGranularity = 'hour' | 'day' | 'week' | 'month';

@injectable()
export class UserRepository implements IUserRepository {
  private usersCollection!: Collection<IUser>;
  private userRoleHistoryCollection!: Collection<IUserRoleHistory>;
  private AnswerCollection: Collection<IAnswer>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  /**
   * Ensures that `usersCollection` is initialized before usage.
   */
  private async init(): Promise<void> {
    if (!this.usersCollection) {
      this.usersCollection = await this.db.getCollection<IUser>('users');
    }
    if (!this.userRoleHistoryCollection) {
      this.userRoleHistoryCollection =
        await this.db.getCollection<IUserRoleHistory>('user_role_history');
    }
    this.AnswerCollection = await this.db.getCollection<IAnswer>('answers');
  }
  private async ensureIndexes() {
    try {
      await this.usersCollection.createIndex({
        role: 1,
        firstName: 1,
        lastName: 1,
        'preference.state': 1,
      });
      await this.AnswerCollection.createIndex({authorId: 1});
      await this.userRoleHistoryCollection.createIndex({userId: 1, from: -1});
      await this.userRoleHistoryCollection.createIndex(
        {userId: 1, to: 1},
        {partialFilterExpression: {to: null}},
      );
    } catch (error) {
      console.error('Failed to create index:', error);
    }
  }

  async getDBClient(): Promise<MongoClient> {
    const client = await this.db.getClient();
    if (!client) {
      throw new Error('MongoDB client is not initialized');
    }
    return client;
  }

  /**
   * Creates a new user in the database.
   * - Generates a MongoDB `_id` internally but uses `firebaseUID` as the external identifier.
   */
  async create(user: IUser, session?: ClientSession): Promise<string> {
    await this.init();
    await this.ensureIndexes();
    const existingUser = await this.usersCollection.findOne(
      {firebaseUID: user.firebaseUID},
      {session},
    );

    if (existingUser) {
      throw new Error('User already exists');
    }
    const result = await this.usersCollection.insertOne(user, {session});
    if (!result.acknowledged) {
      throw new InternalServerError('Failed to create user');
    }

    const now = user.createdAt ?? new Date();
    await this.userRoleHistoryCollection.insertOne(
      {
        userId: result.insertedId,
        role: user.role,
        from: now,
        to: null,
        isVerified: user.isVerified ?? false,
        status: user.status ?? 'active',
        isBlocked: user.isBlocked ?? false,
        special_task_force: user.special_task_force ?? false,
        isTrainingUser: user.isTrainingUser ?? false
      },
      {session},
    );
    return result.insertedId.toString();
  }

  /**
   * Finds a user by email.
   */
  async findByEmail(
    email: string,
    session?: ClientSession,
  ): Promise<IUser | null> {
    await this.init();

    const user = await this.usersCollection.findOne({email}, {session});
    return user;
  }

  /**
   * Finds a user by ID.
   */
  async findById(
    id: string | ObjectId,
    session?: ClientSession,
  ): Promise<IUser | null> {
    await this.init();

    const user = await this.usersCollection.findOne(
      {_id: new ObjectId(id)},
      {
        projection: {
          // _id: 0,
          firebaseUID: 0,
        },
        session,
      },
    );

    // await this.usersCollection.updateMany(
    //   {},
    //   {
    //     $set: {
    //       reputation_score: 0,
    //       incentive: 0,
    //       penalty: 0,
    //       isBlocked: false,
    //       notificationRetention: "never",
    //       preference: {crop: 'all', domain: 'all', state: 'all'},
    //       updatedAt: new Date(),
    //     },
    //   },
    // );
    if (!user) return null;

    return instanceToPlain(new User(user)) as IUser;
  }

  /**
   * Finds a user by Firebase UID.
   */
  async findByFirebaseUID(
    firebaseUID: string,
    session?: ClientSession,
  ): Promise<IUser | null> {
    await this.init();
    const user = await this.usersCollection.findOne({firebaseUID}, {session});
    return user;
  }

  /**
   * Adds a role to a user.
   */
  async makeAdmin(userId: string, session?: ClientSession): Promise<void> {
    await this.init();
    await this.usersCollection.updateOne(
      {_id: new ObjectId(userId)},
      {$set: {roles: 'admin'}},
      {session},
    );
  }

  /**
   * Updates a user's password.
   */
  async updatePassword(
    firebaseUID: string,
    password: string,
  ): Promise<IUser | null> {
    await this.init();
    const result = await this.usersCollection.findOneAndUpdate(
      {firebaseUID},
      {$set: {password}},
      {returnDocument: 'after'},
    );
    return instanceToPlain(new User(result)) as IUser;
  }

  async edit(
    userId: string,
    userData: Partial<IUser>,
    session?: ClientSession,
  ): Promise<IUser> {
    await this.init();
    await this.ensureIndexes();
    const existingUser = await this.usersCollection.findOne(
      {_id: new ObjectId(userId)},
      {session},
    );
    if (!existingUser) return null;

    const roleChanged =
      userData.role !== undefined && userData.role !== existingUser.role;
    const updatedAt = new Date();
    const {_id, ...sanitizedData} = userData;
    const result = await this.usersCollection.updateOne(
      {_id: new ObjectId(userId)},
      {
        $set: {
          ...sanitizedData,
          updatedAt,
        },
      },
      {session},
    );
    if (result.matchedCount === 0) return null;

    if (roleChanged && !existingUser.isBlocked) {
      await Promise.all([
        this.userRoleHistoryCollection.updateOne(
          {
            userId: new ObjectId(userId),
            to: null,
          },
          {
            $set: {
              to: updatedAt,
              updatedAt,
            },
          },
          {session},
        ),
        this.userRoleHistoryCollection.insertOne(
          {
            userId: new ObjectId(userId),
            role: userData.role,
            from: updatedAt,
            to: null,
            isVerified: existingUser.isVerified ?? false,
            status: existingUser.status,
            isBlocked: existingUser.isBlocked,
            special_task_force: existingUser.special_task_force,
            isTrainingUser: existingUser.isTrainingUser ?? false
          },
          {session},
        ),
      ]);
    }

    const updatedUser = await this.usersCollection.findOne(
      {_id: new ObjectId(userId)},
      {session},
    );

    return updatedUser as IUser;
  }

  async getUsersByIds(
    ids: string[],
    session?: ClientSession,
  ): Promise<IUser[]> {
    await this.init();
    const objectIds = ids.map(id => new ObjectId(id));
    const users = await this.usersCollection
      .find({_id: {$in: objectIds}}, {session})
      .toArray();

    return users.map(user => ({
      ...user,
      _id: user._id.toString(),
    }));
  }

  async findAll(session?: ClientSession, isTrainingUser?: boolean, isAdmin?: boolean): Promise<IUser[]> {
    await this.init();
    const allUsers = await this.usersCollection.find(
      {
        ...(
          !isAdmin &&
          (isTrainingUser
            ? { isTrainingUser: true }
            : { isTrainingUser: { $ne: true } })
        ),
      },
      { session }
    ).toArray();

    // Remove duplicate users (in case multiple  emails point to same user)
    const uniqueUsersMap = new Map<string, IUser>();
    for (const user of allUsers) {
      const uniqueKey = user.email || user._id.toString();
      if (!uniqueUsersMap.has(uniqueKey)) {
        uniqueUsersMap.set(uniqueKey, user);
      }
    }
    const uniqueUsers = Array.from(uniqueUsersMap.values());

    return uniqueUsers;
  }

  async findAllUsers(
    page: number,
    limit: number,
    search: string,
    sortOption: string,
    filter: string,
    role?: string,
    isBlockedFilter?: boolean,
    isVerifiedFilter?: boolean,
    isSTFFilter?: boolean,
    session?: ClientSession,
  ): Promise<{
    users: IUser[];
    totalUsers: number;
    totalPages: number;
  }> {
    await this.init();

    try {
      await this.ensureIndexes();
      const skip = (page - 1) * limit;

      const matchQuery: any = {};

      if (search) {
        matchQuery.$or = [
          {firstName: {$regex: search, $options: 'i'}},
          {lastName: {$regex: search, $options: 'i'}},
          {email: {$regex: search, $options: 'i'}},
        ];
      }

      if (filter && filter !== 'ALL') {
        matchQuery['preference.state'] = filter;
      }

      if (role && role !== 'ALL') {
        if (role === 'INTERNAL' || role === 'internal') {
          matchQuery.role = {$ne: 'pae_expert'};
        } else {
          matchQuery.role = role;
        }
      }

      if (isBlockedFilter !== undefined) {
        matchQuery.isBlocked = isBlockedFilter;
      }

      if (isSTFFilter !== undefined) {
        matchQuery.special_task_force = isSTFFilter;
      }

      const sortMap: any = {
        role: {roleOrder: 1},
        workload_asc: {reputation_score: 1},
        workload_desc: {reputation_score: -1},
        incentive_asc: {incentive: 1},
        incentive_desc: {incentive: -1},
        penalty_asc: {penalty: 1},
        penalty_desc: {penalty: -1},
        joined_asc: {createdAt: 1},
        joined_desc: {createdAt: -1},
        default: {rankPosition: 1},
      };

      const selectedSort = sortMap[sortOption] || sortMap.default;

      const result = await this.usersCollection
        .aggregate([
          /** Default isBlocked */
          {
            $addFields: {
              isBlocked: {$ifNull: ['$isBlocked', false]},
            },
          },

          {
            $addFields: {
              status: {$ifNull: ['$status', 'active']},
            },
          },

          /** Answers count */
          {
            $lookup: {
              from: 'answers',
              let: {userId: '$_id'},
              pipeline: [
                {$match: {$expr: {$eq: ['$authorId', '$$userId']}}},
                {$count: 'count'},
              ],
              as: 'answersMeta',
            },
          },

          /** Derived fields */
          {
            $addFields: {
              totalAnswers_Created: {
                $ifNull: [{$arrayElemAt: ['$answersMeta.count', 0]}, 0],
              },
              penalty: {$ifNull: ['$penalty', 0]},
              incentive: {$ifNull: ['$incentive', 0]},
              reputation_score: {$ifNull: ['$reputation_score', 0]},
            },
          },

          /** Penalty percentage */
          {
            $addFields: {
              penaltyPercentage: {
                $cond: [
                  {$gt: ['$totalAnswers_Created', 0]},
                  {
                    $multiply: [
                      {$divide: ['$penalty', '$totalAnswers_Created']},
                      100,
                    ],
                  },
                  0,
                ],
              },
            },
          },

          /** Role priority */
          {
            $addFields: {
              roleOrder: {
                $switch: {
                  branches: [
                    {case: {$eq: ['$role', 'admin']}, then: 1},
                    {case: {$eq: ['$role', 'moderator']}, then: 2},
                    {case: {$eq: ['$role', 'expert']}, then: 3},
                    {case: {$eq: ['$role', 'pae_expert']}, then: 4},
                    {case: {$eq: ['$role', 'district_coordinator']}, then: 5},
                    {case: {$eq: ['$role', 'block_coordinator']}, then: 6},
                    {case: {$eq: ['$role', 'village_volunteer']}, then: 7},
                    {case: {$eq: ['$role', 'tester']}, then: 8},
                  ],
                  default: 99,
                },
              },
            },
          },

          /** Rank value */
          {
            $addFields: {
              rankValue: {
                $cond: [
                  {$eq: ['$role', 'expert']},
                  {
                    $subtract: [
                      {
                        $add: [
                          {$multiply: ['$totalAnswers_Created', 0.5]},
                          {$multiply: ['$incentive', 0.3]},
                        ],
                      },
                      {$multiply: ['$penaltyPercentage', 0.2]},
                    ],
                  },
                  -1,
                ],
              },
            },
          },

          /** Ranking sort (global rank order) */
          {
            $sort: {
              isBlocked: 1,
              roleOrder: 1,
              rankValue: -1,
              reputation_score: -1,
              totalAnswers_Created: -1,
              penalty: 1,
              incentive: -1,
              createdAt: 1,
            },
          },

          /** Assign rankPosition */
          {
            $group: {
              _id: null,
              users: {$push: '$$ROOT'},
            },
          },
          {
            $addFields: {
              users: {
                $map: {
                  input: {$range: [0, {$size: '$users'}]},
                  as: 'idx',
                  in: {
                    $mergeObjects: [
                      {$arrayElemAt: ['$users', '$$idx']},
                      {rankPosition: {$add: ['$$idx', 1]}},
                    ],
                  },
                },
              },
            },
          },
          {
            $unwind: '$users',
          },
          {
            $replaceRoot: {newRoot: '$users'},
          },

          /** Calculate Global Expert Rank */
          {
            $facet: {
              experts: [
                {$match: {role: 'expert'}},
                {
                  $sort: {
                    status: 1,
                    isBlocked: 1,
                    rankValue: -1,
                    reputation_score: -1,
                    totalAnswers_Created: -1,
                    penalty: 1,
                    incentive: -1,
                    createdAt: 1,
                  },
                },
                {$group: {_id: null, list: {$push: '$$ROOT'}}},
                {$unwind: {path: '$list', includeArrayIndex: 'expertRank'}},
                {
                  $replaceRoot: {
                    newRoot: {
                      $mergeObjects: [
                        '$list',
                        {expertRank: {$add: ['$expertRank', 1]}},
                      ],
                    },
                  },
                },
              ],
              others: [
                {$match: {role: {$ne: 'expert'}}},
                {$addFields: {expertRank: null}},
              ],
            },
          },
          {
            $project: {
              allUsers: {$concatArrays: ['$experts', '$others']},
            },
          },
          {$unwind: '$allUsers'},
          {$replaceRoot: {newRoot: '$allUsers'}},

          /** Match users (Applied here for global ranking) */
          {$match: matchQuery},

          /** UI sorting (dropdown) */
          {
            $sort: {
              isBlocked: 1,
              ...selectedSort,
            },
          },

          /** Pagination */
          {
            $facet: {
              users: [{$skip: skip}, {$limit: limit}],
              meta: [{$count: 'totalUsers'}],
            },
          },
        ])
        .toArray();

      const users = result[0]?.users || [];
      const totalUsers = result[0]?.meta[0]?.totalUsers || 0;

      // Convert ObjectId to string
      users.forEach(u => {
        u._id = u._id.toString();
      });

      return {
        users,
        totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
      };
    } catch (error) {
      throw new InternalServerError('Failed to get users');
    }
  }

  async updateReputationScore(
    userId: string,
    isIncrement: boolean,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    const incrementValue = isIncrement ? 1 : -1;
    await this.usersCollection.updateOne(
      {_id: new ObjectId(userId)},
      [
        {
          $set: {
            reputation_score: {
              $max: [0, {$add: ['$reputation_score', incrementValue]}],
            },
            updatedAt: new Date(),
          },
        },
      ],
      {session},
    );
  }

  async recalculateReputationScore(
    userId: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    const submissionCollection = await this.db.getCollection<any>(
      'question_submissions',
    );

    const userObjectId = new ObjectId(userId);
    const userIdStr = userId.toString();

    // Count active assignments:
    // 1. History is empty AND user is at index 0 of queue
    // 2. History is NOT empty AND user is the updatedBy of the last history entry AND status is 'in-review'
    const count = await submissionCollection.countDocuments(
      {
        $or: [
          {
            $and: [
              {history: {$size: 0}},
              {$or: [{'queue.0': userObjectId}, {'queue.0': userIdStr}]},
            ],
          },
          {
            $and: [
              {history: {$not: {$size: 0}}},
              {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        {$arrayElemAt: ['$history.status', -1]},
                        'in-review',
                      ],
                    },
                    {
                      $in: [
                        {$arrayElemAt: ['$history.updatedBy', -1]},
                        [userObjectId, userIdStr],
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      {session},
    );

    await this.usersCollection.updateOne(
      {_id: userObjectId},
      {$set: {reputation_score: count, updatedAt: new Date()}},
      {session},
    );
  }

  async setReputationScore(
    userId: string,
    score: number,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    await this.usersCollection.updateOne(
      {_id: new ObjectId(userId)},
      {
        $set: {
          reputation_score: Math.max(0, score),
          updatedAt: new Date(),
        },
      },
      {session},
    );
  }

  async findExpertsByPreference(
    details: PreferenceDto,
    session?: ClientSession,
  ): Promise<IUser[]> {
    await this.init();

    // 1. Fetch all experts
    const allUsersRaw = await this.usersCollection
      .find({ role: 'expert', isBlocked: false, status: { $ne: 'in-active' } }, { session })
      .toArray();

    // 2. Remove duplicates based on email
    const uniqueUsersMap = new Map<string, IUser>();
    for (const user of allUsersRaw) {
      if (!user.email) continue;
      if (!uniqueUsersMap.has(user.email)) uniqueUsersMap.set(user.email, user);
    }
    let allUsers = Array.from(uniqueUsersMap.values());

    // Shuffle on random basis
    for (let i = allUsers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allUsers[i], allUsers[j]] = [allUsers[j], allUsers[i]];
    }

    // 3. Score users
    const scoredUsers = allUsers
      .map(user => {
        const pref: PreferenceDto = user.preference || {};
        const normalize = (value: string | ICropRef | undefined): string => {
          if (typeof value === 'string') {
            return value.toLowerCase().trim();
          }
          return '';
        };
        const prefState = (pref.state || '').toLowerCase().trim();
        const normalizeDomain = (
          d: string | string[] | undefined,
        ): string[] => {
          if (!d) return [];
          if (Array.isArray(d)) return d.map(v => v.toLowerCase().trim());
          return [d.toLowerCase().trim()];
        };
        const prefDomains = normalizeDomain(pref.domain);
        const prefCrop = normalize(pref.crop);

        const detState = (details.state || '').toLowerCase().trim();
        const detDomains = normalizeDomain(details.domain);
        const detCrop = normalize(details.crop);

        const prefDomainIsAll =
          prefDomains.length === 1 && prefDomains[0] === 'all';
        const isAllSelected =
          prefCrop === 'all' && prefState === 'all' && prefDomainIsAll;

        let score = 0;

        // Preference Weighting
        if (prefState !== 'all' && prefState === detState) score += 3;

        const hasDomainOverlap = prefDomains.some(d => detDomains.includes(d));
        if (!prefDomainIsAll && hasDomainOverlap) score += 2;

        if (prefCrop !== 'all' && prefCrop === detCrop) score += 1;

        const workloadScore =
          typeof user.reputation_score === 'number' ? user.reputation_score : 0;

        return {user, score, isAllSelected, workloadScore};
      })

      .filter(Boolean) as {
      user: IUser;
      score: number;
      isAllSelected: boolean;
      workloadScore: number;
    }[];

    const matched = scoredUsers.filter(x => x.score > 0);
    const unmatched = scoredUsers.filter(x => x.score === 0);

    matched.sort((a, b) => {
      if (a.isAllSelected && !b.isAllSelected) return 1;
      if (!a.isAllSelected && b.isAllSelected) return -1;

      if (b.score !== a.score) return b.score - a.score;

      return a.workloadScore - b.workloadScore;
    });

    unmatched.sort((a, b) => a.workloadScore - b.workloadScore);

    // 4. Sort
    // scoredUsers.sort((a, b) => {
    //   // Users with all = 'all' go last
    //   if (a.isAllSelected && !b.isAllSelected) return 1;
    //   if (!a.isAllSelected && b.isAllSelected) return -1;

    //   // Higher score first
    //   if (b.score !== a.score) return b.score - a.score;

    //   // Lower workload first
    //   return a.workloadScore - b.workloadScore;
    // });

    // return scoredUsers.map(s => s.user);
    let result = [...matched, ...unmatched].map(s => s.user);
    return result;
  }
  async getSpecialTaskForceExperts(
    details: PreferenceDto,
    session: ClientSession,
  ): Promise<IUser[]> {
    await this.init();
    const allUsersRaw = await this.usersCollection
      .find(
        {
          role: 'expert',
          isBlocked: false,
          status: { $ne: 'in-active' },
          special_task_force: true,
        },
        {session},
      )
      .toArray();

    return allUsersRaw;
  }

  async getExpertsWithFallback(
    details: PreferenceDto,
    session: ClientSession,
  ): Promise<IUser[]> {
    // 1. STF users
    const stfUsers = await this.getSpecialTaskForceExperts(details, session);

    // 2. Preference users
    const prefUsers = await this.findExpertsByPreference(details, session);

    return [...stfUsers, ...prefUsers];
  }

  async getSpecialTaskForceModerators(
    session: ClientSession,
  ): Promise<IUser[]> {
    await this.init();
    const allUsersRaw = await this.usersCollection
      .find(
        {
          // role: 'expert',
          isBlocked: false,
          status: { $ne: 'in-active' },
          special_task_force_moderator: true,
        },
        {session},
      )
      .toArray();

    return allUsersRaw;
  }
  async findExpertsByReputationScore(
    details: PreferenceDto,
    session?: ClientSession,
    limit?: number,
  ): Promise<IUser[]> {
    await this.init();

    // 1. Fetch all experts (include role and isBlocked for queue details)
    const query: any = { role: 'expert', isBlocked: false, status: { $ne: 'in-active' }};
    const cursor = this.usersCollection.find(query, { session });
    if (limit) cursor.limit(limit);
    const allUsersRaw = await cursor.toArray();

    // 2. Remove duplicates based on email
    const uniqueUsersMap = new Map<string, IUser>();
    const droppedByDedup: string[] = [];
    const noEmail: string[] = [];
    for (const user of allUsersRaw) {
      if (!user.email) {
        noEmail.push(user._id?.toString());
        continue;
      }
      if (!uniqueUsersMap.has(user.email)) uniqueUsersMap.set(user.email, user);
      else droppedByDedup.push(user._id?.toString());
    }
    let allUsers = Array.from(uniqueUsersMap.values());
    allUsers.sort((a, b) => {
      return a.reputation_score - b.reputation_score;
    });

    // Funnel diagnostic: total unblocked expert docs → eligible after email dedup.
    // Shows how many real experts are dropped (and their ids) so we can tell whether
    // a "missing" available expert is being collapsed away by the dedup.
    /* console.log(
       `[findExpertsByReputationScore] unblockedExpertDocs=${allUsersRaw.length}, ` +
       `eligibleAfterDedup=${allUsers.length}, droppedByEmailDedup=${droppedByDedup.length}, ` +
       `noEmail=${noEmail.length}`,
       JSON.stringify({ droppedByDedup, noEmail }),
     );*/

    return allUsers;
  }
  async findActiveLowReputationExpertsToday(
    session?: ClientSession,
  ): Promise<IUser[]> {
    await this.init();

    // Start & end of today (server time)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfTomorrow = new Date(startOfDay);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const users = await this.usersCollection
      .find(
        {
          role: 'expert',
          isBlocked: false,
          status: 'active',
          lastCheckInAt: {$gte: startOfDay, $lt: startOfTomorrow},
        },
        {session},
      )
      .sort({reputation_score: 1}) // lowest score first
      .toArray();

    return users;
  }

  async findModerators(): Promise<IUser[]> {
    await this.init();
    return await this.usersCollection.find({role: 'moderator'}).toArray();
  }

  /** Statuses that keep a moderator "busy". A held question in any other status
   *  (notably 're-routed', which is handed off to an expert but kept in the array for
   *  history) does NOT block new assignments. 'pae_submitted' blocks too: the moderator
   *  still has to act on it, so they shouldn't be handed another question of that category. */
  static readonly BLOCKING_ASSIGNED_STATUSES: QuestionStatus[] = [
    'in-review',
    'duplicate',
    'pae_submitted',
  ];

  /** Returns non-blocked moderators who can take a new question — i.e. they hold no
   *  assignedQuestionIds entry in a blocking status. A moderator with an empty array,
   *  or one holding only re-routed (or otherwise non-blocking) entries, is available.
   *  `extraMatch` lets callers further restrict the set (e.g. STF only).
   *
   *  When `sources` is provided, availability is scoped to that source group: the
   *  moderator only counts as "busy" if they hold a blocking question whose source is
   *  in `sources`. This lets one moderator hold one time-bound AND one manual question
   *  at the same time (they're available for a category as long as they don't already
   *  hold a blocking question of that category). Omit `sources` for the legacy
   *  "blocked by any blocking question" behaviour. */
  private async findAvailableModeratorsWithMatch(
    extraMatch: Record<string, unknown> = {},
    sources?: QuestionSource[],
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<IUser[]> {
    await this.init();
    const blockingElemMatch: Record<string, unknown> = {
      status: {$in: UserRepository.BLOCKING_ASSIGNED_STATUSES},
    };
    if (sources && sources.length > 0) {
      // Block on entries of this source group. Legacy entries with a missing/null
      // source are treated as blocking too (we can't tell their category), so this
      // is never looser than the original "busy on any blocking question" behaviour.
      blockingElemMatch.$or = [
        {source: {$in: sources}},
        {source: {$exists: false}},
        {source: null},
      ];
    }
    return this.usersCollection
      .find({
        role: 'moderator',
        isBlocked: { $ne: true },
        status: { $ne: 'in-active' },
        ...extraMatch,
        ...(isAdmin !== true &&
          isTrainingUser !== undefined && {
          isTrainingUser: isTrainingUser
            ? true
            : { $ne: true },
        }),
        // No element is in a blocking status (also true for missing/null/empty arrays).
        // Scoped to `sources` when provided.
        assignedQuestionIds: {
          $not: {$elemMatch: blockingElemMatch},
        },
      })
      .toArray();
  }

  /** Returns non-blocked moderators who can take a new question (see
   *  findAvailableModeratorsWithMatch for the "available" definition). */
  async findAvailableModerators(): Promise<IUser[]> {
    return this.findAvailableModeratorsWithMatch();
  }

  /** Same as findAvailableModerators but restricted to Special Task Force moderators. */
  async findAvailableStfModerators(): Promise<IUser[]> {
    return this.findAvailableModeratorsWithMatch({special_task_force: true});
  }

  /** STF moderators available for a specific source group (e.g. time-bound or manual):
   *  they hold no blocking question whose source is in `sources`. Used by the
   *  source-aware moderator-queue cron so a moderator can carry one question of each
   *  category concurrently. */
  async findAvailableStfModeratorsForSources(
    sources: QuestionSource[],
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<IUser[]> {
    return this.findAvailableModeratorsWithMatch(
      {special_task_force: true},
      sources,
      isTrainingUser,
      isAdmin
    );
  }

  /** Users of a given role who can take a new question — not blocked and currently
   *  holding NEITHER an assigned question NOR a feedback-review (one item at a time).
   *  Used by the gate-keeper / auditor queue cron and the feedback allocator to find a
   *  free assignee. Requiring both arrays empty enforces the rule that an auditor holds
   *  either one queue (auditor-level) question OR one feedback — never both. (Gate
   *  keepers never receive feedback, so the feedbacksAssigned clause is a no-op for
   *  them; moderators use findAvailableStfModerators*, not this method.) */
  async findAvailableUsersByRole(role: UserRole): Promise<IUser[]> {
    await this.init();
    return this.usersCollection
      .find({
        role,
        isBlocked: { $ne: true },
        // Only active users. status defaults to 'active' on creation, so treat a
        // missing/null status as active and exclude only explicitly in-active users.
        status: { $ne: 'in-active' },

        $or: [
          { assignedQuestionIds: { $exists: false } },
          { assignedQuestionIds: null },
          { assignedQuestionIds: { $size: 0 } },
        ],

      })
      .toArray();
  }

  /** All active, non-blocked users of the given roles — used to populate the manual
   *  feedback-reviewer picker (shows everyone eligible, busy or not). */
  async findUsersByRoles(roles: UserRole[]): Promise<IUser[]> {
    await this.init();
    return this.usersCollection
      .find({
        role: {$in: roles},
        isBlocked: {$ne: true},
        status: {$ne: 'in-active'},
      })
      .toArray();
  }

  /** Manual claim (admin/moderator override): assign a feedback review to any active,
   *  non-blocked user who isn't already holding a feedback. Unlike claimFeedbackAllocation
   *  this does NOT restrict by role or apply the auditor either-or rule — a person is
   *  chosen explicitly from the picker. Still one feedback at a time. */
  async claimFeedbackAllocationManual(
    userId: string,
    questionId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    await this.init();
    const qid = new ObjectId(questionId);
    const result = await this.usersCollection.updateOne(
      {
        _id: new ObjectId(userId),
        isBlocked: {$ne: true},
        status: {$ne: 'in-active'},
        $or: [
          {feedbacksAssigned: {$exists: false}},
          {feedbacksAssigned: null},
          {feedbacksAssigned: {$size: 0}},
        ],
      },
      [
        {
          $set: {
            feedbacksAssigned: {
              $concatArrays: [
                {
                  $filter: {
                    input: {$ifNull: ['$feedbacksAssigned', []]},
                    as: 'q',
                    cond: {$ne: ['$$q', qid]},
                  },
                },
                [qid],
              ],
            },
            updatedAt: new Date(),
          },
        },
      ],
      {session},
    );
    return result.modifiedCount > 0;
  }

  /** Moderators/auditors currently free to take a NEW feedback review — active, not
   *  blocked, with an empty feedbacksAssigned. Auditors must ALSO have an empty
   *  assignedQuestionIds (either one feedback OR one auditor question); moderators may
   *  hold queue work alongside a feedback. Used by the feedback queue's "available"
   *  section and mirrors the availability the feedback allocator uses. */
  async findAvailableFeedbackReviewers(): Promise<IUser[]> {
    await this.init();
    const emptyFeedbacks = [
      {feedbacksAssigned: {$exists: false}},
      {feedbacksAssigned: null},
      {feedbacksAssigned: {$size: 0}},
    ];
    const emptyQueue = [
      {assignedQuestionIds: {$exists: false}},
      {assignedQuestionIds: null},
      {assignedQuestionIds: {$size: 0}},
    ];
    return this.usersCollection
      .find({
        isBlocked: {$ne: true},
        status: {$ne: 'in-active'},
        $and: [
          {$or: emptyFeedbacks},
          {
            $or: [
              {role: 'moderator'},
              {$and: [{role: 'auditor'}, {$or: emptyQueue}]},
            ],
          },
        ],
      } as any)
      .toArray();
  }

  /** Atomically claim a feedback-review assignment for a user only when they are an
   *  active moderator/auditor with an empty feedback array. Auditors must ALSO have an
   *  empty assignedQuestionIds array — an auditor holds either one feedback OR one
   *  auditor-level question, never both. Moderators may hold a feedback alongside their
   *  queue work, so they are exempt from the assignedQuestionIds check. */
  async claimFeedbackAllocation(
    userId: string,
    questionId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    await this.init();
    const qid = new ObjectId(questionId);
    // const emptyAssignedQuestions = [
    //   {assignedQuestionIds: {$exists: false}},
    //   {assignedQuestionIds: null},
    //   {assignedQuestionIds: {$size: 0}},
    // ];
    const result = await this.usersCollection.updateOne(
      {
        _id: new ObjectId(userId),
        isBlocked: { $ne: true },
        status: { $ne: 'in-active' },
        $or: [
          { feedbacksAssigned: { $exists: false } },
          { feedbacksAssigned: null },
          { feedbacksAssigned: { $size: 0 } },
        ],
      } as any,
      [
        {
          $set: {
            feedbacksAssigned: {
              $concatArrays: [
                {
                  $filter: {
                    input: {$ifNull: ['$feedbacksAssigned', []]},
                    as: 'q',
                    cond: {$ne: ['$$q', qid]},
                  },
                },
                [qid],
              ],
            },
            updatedAt: new Date(),
          },
        },
      ],
      {session},
    );
    return result.modifiedCount > 0;
  }

  /** Appends a question (with its current status) to a moderator's assigned-questions
   *  array. Pulls any stale entry for the same question first so the questionId is never
   *  duplicated and the stored status is fresh. The cron passes 'in-review'; manual
   *  allocation passes the question's current status. */
  async addAssignedQuestion(
    moderatorId: string,
    questionId: string,
    status: QuestionStatus,
    source?: QuestionSource,
    session?: ClientSession,
  ): Promise<boolean> {
    await this.init();
    const qid = new ObjectId(questionId);
    // Aggregation-pipeline update so it's null-safe: `$ifNull` coerces a null/missing
    // `assignedQuestionIds` to [] (a plain $push/$pull throws on a non-array/null field),
    // `$filter` de-dupes any existing entry for this question, then we append the new one.
    // Auditors must NOT already hold a feedback-review (one item at a time — either a
    // feedback OR an auditor-level question). Non-auditors (moderators/gate keepers) are
    // unconstrained here, so their behaviour is unchanged.
    const result = await this.usersCollection.updateOne(
      {
        _id: new ObjectId(moderatorId),
      },
      [
        {
          $set: {
            assignedQuestionIds: {
              $concatArrays: [
                {
                  $filter: {
                    input: {$ifNull: ['$assignedQuestionIds', []]},
                    as: 'a',
                    cond: {$ne: ['$$a.questionId', qid]},
                  },
                },
                [{questionId: qid, status, source: source ?? null}],
              ],
            },
            updatedAt: new Date(),
          },
        },
      ],
      {session},
    );
    return result.modifiedCount > 0;
  }

  /** Removes a single question's entry from a moderator's assigned-questions array.
   *  Called when the moderator acts on the question (answers/closes), or when the
   *  question is manually removed/reassigned. */
  async removeAssignedQuestion(
    moderatorId: string,
    questionId: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    await this.usersCollection.updateOne(
      {_id: new ObjectId(moderatorId)},
      {
        $pull: {assignedQuestionIds: {questionId: new ObjectId(questionId)}},
        $set: {updatedAt: new Date()},
      },
      {session},
    );
  }

  /** Pulls a question's entry from whichever moderator(s) hold it, regardless of the
   *  moderatorId stored on the question. Used when a question is deleted so no orphan
   *  entry is left behind keeping a moderator wrongly "busy". */
  async removeAssignedQuestionFromAllModerators(
    questionId: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    const qid = new ObjectId(questionId);
    await this.usersCollection.updateMany(
      {'assignedQuestionIds.questionId': qid},
      {
        $pull: {assignedQuestionIds: {questionId: qid}},
        $set: {updatedAt: new Date()},
      },
      {session},
    );
  }

  async findAdmins(session?: ClientSession): Promise<IUser[]> {
    await this.init();
    return await this.usersCollection
      .find({role: 'admin'}, {session})
      .toArray();
  }

  async updateAutoDeleteNotificationPreference(
    preference: NotificationRetentionType,
    userId: string,
    session?: ClientSession,
  ) {
    await this.init();
    try {
      const user = await this.usersCollection.findOne({
        _id: new ObjectId(userId),
      });
      if (!user) {
        throw new NotFoundError('user not found');
      }
      await this.usersCollection.findOneAndUpdate(
        {_id: new ObjectId(userId)},
        {$set: {notificationRetention: preference}},
        {upsert: true, session},
      );
    } catch (error) {
      console.log(error);
      throw new InternalServerError(`Failed to update notification Preference`);
    }
  }

  async updatePenaltyAndIncentive(
    userId: string,
    field: 'incentive' | 'penalty',
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    try {
      const user = await this.usersCollection.findOne({
        _id: new ObjectId(userId),
      });
      if (!user) {
        throw new NotFoundError('User not found');
      }
      await this.usersCollection.findOneAndUpdate(
        {_id: new ObjectId(userId)},
        {$inc: {[field]: 1}},
        {upsert: true, session},
      );
    } catch (error) {
      throw new InternalServerError(`Failed to update incentive`);
    }
  }

  /* async findAllExperts(
    page: number,
    limit: number,
    search: string,
    sortOption: string,
    filter: string,
    session?: ClientSession,
  ): Promise<{experts: IUser[]; totalExperts: number; totalPages: number}> {
    await this.init();
    try {
      const skip = (page - 1) * limit;
      let query: any = {role: 'expert'};
      let sort: any = {};
      if (search) {
        query.$or = [
          {firstName: {$regex: search, $options: 'i'}},
          {lastName: {$regex: search, $options: 'i'}},
        ];
      }
      if (filter && filter !== 'ALL') {
        query['preference.state'] = filter;
      }
      switch (sortOption) {
        case 'reputation_score':
          sort = {reputation_score: -1};
          break;
        case 'incentive':
          sort = {incentive: -1};
          break;
        case 'penalty':
          sort = {penalty: -1};
          break;
        case 'createdAt':
          sort = {createdAt: -1};
          break;
        default:
          sort = {firstName: 1};
      }
      const users = await this.usersCollection
        .find(query, {session})
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();
      const totalExperts = await this.usersCollection.countDocuments(query, {
        session,
      });
      const totalPages = Math.ceil(totalExperts / limit);
     
      const userIds = users.map(u => u._id);

    const answerCounts = await this.AnswerCollection
      .aggregate([
        { $match: { authorId: { $in: userIds } } },
        {
          $group: {
            _id: "$authorId",
            totalAnswers_Created: { $sum: 1 }
          }
        }
      ])
      .toArray();

    // convert to map for fast lookup
    const answersMap = new Map(
      answerCounts.map(a => [a._id.toString(), a.totalAnswers_Created])
    );

    // -----------------------------------------
    // ⭐ ADDED: Append totalAnswers_Created to each expert
    // -----------------------------------------
    const mappedExperts = users.map(u => {
      const totalAnswers = answersMap.get(u._id.toString()) || 0;
      const penalty = u.penalty || 0;
      const incentive = u.incentive || 0;

      const penaltyPercentage =
        totalAnswers > 0 ? (penalty / totalAnswers) * 100 : 0;

      const rank =
        totalAnswers * 0.5 + incentive * 0.3 - penaltyPercentage * 0.2;

      return {
        ...u,
        _id: u._id.toString(),
        totalAnswers_Created: totalAnswers,
        penaltyPercentage,
        rank,
        rankPosition: 0,
      };
    });

    // Sort experts by rank descending
    if(!sortOption)
    {
      mappedExperts.sort((a, b) => (b.rank || 0) - (a.rank || 0));
    }
   else if(sortOption==="penalty")
   {
    mappedExperts.sort((a, b) => (b.penaltyPercentage || 0) - (a.penaltyPercentage || 0));
   }
   
    mappedExperts.forEach((u, index) => {
      u.rankPosition = index + 1; // 1 = highest rank
    });

    return { experts: mappedExperts, totalExperts, totalPages };
  } catch (error) {
    throw new InternalServerError(`Failed to get experts`);
  }

  }*/
  /*async findAllExperts(
    page: number,
    limit: number,
    search: string,
    sortOption: string,
    filter: string,
    session?: ClientSession,
  ): Promise<{ experts: any[]; totalExperts: number; totalPages: number }> {
    await this.init();
    try {
      const skip = (page - 1) * limit;
  
      let matchQuery: any = { role: "expert" };
      if (search) {
        matchQuery.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
        ];
      }
      if (filter && filter !== "ALL") {
        matchQuery["preference.state"] = filter;
      }
  
      // 1. Fetch all users matching the query
      const users = await this.usersCollection.aggregate([
        { $match: matchQuery },
        {
          $lookup: {
            from: "answers",
            localField: "_id",
            foreignField: "authorId",
            as: "answers",
          },
        },
        {
          $addFields: {
            totalAnswers_Created: { $size: "$answers" },
            penalty: { $ifNull: ["$penalty", 0] },
            incentive: { $ifNull: ["$incentive", 0] },
            penaltyPercentage: {
              $cond: [
                { $gt: [{ $size: "$answers" }, 0] },
                { $multiply: [{ $divide: ["$penalty", { $size: "$answers" }] }, 100] },
                0,
              ],
            },
            rank: {
              $let: {
                vars: {
                  totalAnswers: { $size: "$answers" },
                  penalty: { $ifNull: ["$penalty", 0] },
                  incentive: { $ifNull: ["$incentive", 0] },
                },
                in: {
                  $subtract: [
                    {
                      $add: [
                        { $multiply: ["$$totalAnswers", 0.5] },
                        { $multiply: ["$$incentive", 0.3] },
                      ],
                    },
                    {
                      $multiply: [
                        {
                          $cond: [
                            { $gt: ["$$totalAnswers", 0] },
                            { $multiply: [{ $divide: ["$$penalty", "$$totalAnswers"] }, 100] },
                            0,
                          ],
                        },
                        0.2,
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ]).toArray();
  
      // 2. Assign global rankPosition based on calculated rank
      users.sort((a, b) => (b.rank || 0) - (a.rank || 0));
      users.forEach((u, index) => {
        u.rankPosition = index + 1;
        u._id = u._id.toString();
      });
  
      // 3. Apply UI sorting if requested (does NOT change rankPosition)
      let sortedUsers = [...users];
      if (sortOption === "penalty") {
        sortedUsers.sort((a, b) => (b.penaltyPercentage || 0) - (a.penaltyPercentage || 0));
      } else if (sortOption === "reputation_score") {
        sortedUsers.sort((a, b) => (b.reputation_score || 0) - (a.reputation_score || 0));
      } else if (sortOption === "incentive") {
        sortedUsers.sort((a, b) => (b.incentive || 0) - (a.incentive || 0));
      } else if (sortOption === "createdAt") {
        sortedUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      // default = rank descending (already sorted globally)
  
      // 4. Pagination
      const paginatedUsers = sortedUsers.slice(skip, skip + limit);
  
      return {
        experts: paginatedUsers,
        totalExperts: users.length,
        totalPages: Math.ceil(users.length / limit),
      };
    } catch (error) {
      throw new InternalServerError("Failed to get experts");
    }
  }*/
  async findAllExperts(
    page: number,
    limit: number,
    search: string,
    sortOption: string,
    filter: string,
    isTrainingUserFilter?: boolean,
    session?: ClientSession,
  ): Promise<{experts: any[]; totalExperts: number; totalPages: number}> {
    await this.init();

    try {
      await this.ensureIndexes();
      const skip = (page - 1) * limit;

      const matchQuery: any = {};

      if (search) {
        matchQuery.$or = [
          {firstName: {$regex: search, $options: 'i'}},
          {lastName: {$regex: search, $options: 'i'}},
        ];
      }

      if (filter && filter !== 'ALL') {
        matchQuery['preference.state'] = filter;
      }

      if (isTrainingUserFilter !== undefined) {
        matchQuery.isTrainingUser = isTrainingUserFilter;
      }

      const sortMap: any = {
        workload_asc: {reputation_score: 1},
        workload_desc: {reputation_score: -1},
        incentive_asc: {incentive: 1},
        incentive_desc: {incentive: -1},
        penalty_asc: {penaltyPercentage: 1},
        penalty_desc: {penaltyPercentage: -1},
        joined_asc: {createdAt: 1},
        joined_desc: {createdAt: -1},
        default: {rankPosition: 1},
      };

      const selectedSort = sortMap[sortOption] || sortMap.default;

      const result = await this.usersCollection
        .aggregate([
          /** Match experts */
          {$match: {role: 'expert'}},

          /** Default isBlocked */
          {
            $addFields: {
              isBlocked: {$ifNull: ['$isBlocked', false]},
            },
          },

          /** Answers count */
          {
            $lookup: {
              from: 'answers',
              let: {userId: '$_id'},
              pipeline: [
                {$match: {$expr: {$eq: ['$authorId', '$$userId']}}},
                {$count: 'count'},
              ],
              as: 'answersMeta',
            },
          },

          /** Derived fields */
          {
            $addFields: {
              totalAnswers_Created: {
                $ifNull: [{$arrayElemAt: ['$answersMeta.count', 0]}, 0],
              },
              penalty: {$ifNull: ['$penalty', 0]},
              incentive: {$ifNull: ['$incentive', 0]},
              reputation_score: {$ifNull: ['$reputation_score', 0]},
            },
          },

          /** Penalty percentage */
          {
            $addFields: {
              penaltyPercentage: {
                $cond: [
                  {$gt: ['$totalAnswers_Created', 0]},
                  {
                    $multiply: [
                      {$divide: ['$penalty', '$totalAnswers_Created']},
                      100,
                    ],
                  },
                  0,
                ],
              },
            },
          },

          /** Rank value */
          {
            $addFields: {
              rankValue: {
                $subtract: [
                  {
                    $add: [
                      {$multiply: ['$totalAnswers_Created', 0.5]},
                      {$multiply: ['$incentive', 0.3]},
                    ],
                  },
                  {$multiply: ['$penaltyPercentage', 0.2]},
                ],
              },
            },
          },

          /** Ranking sort (global rank order) */
          {
            $sort: {
              status: 1,
              isBlocked: 1,
              rankValue: -1,
              reputation_score: -1,
              totalAnswers_Created: -1,
              penalty: 1,
              incentive: -1,
              createdAt: 1,
            },
          },

          /** Assign rankPosition */
          {
            $group: {
              _id: null,
              experts: {$push: '$$ROOT'},
            },
          },
          {
            $unwind: {
              path: '$experts',
              includeArrayIndex: 'rankPosition',
            },
          },
          {
            $addFields: {
              'experts.rankPosition': {$add: ['$rankPosition', 1]},
            },
          },
          {
            $replaceRoot: {newRoot: '$experts'},
          },

          /** UI sorting (dropdown) */
          {
            $sort: {
              isBlocked: 1,
              ...selectedSort,
            },
          },
          {$match: matchQuery},

          /** Pagination */
          {
            $facet: {
              experts: [{$skip: skip}, {$limit: limit}],
              meta: [{$count: 'totalExperts'}],
            },
          },
        ])
        .toArray();

      const experts = result[0]?.experts || [];
      const totalExperts = result[0]?.meta[0]?.totalExperts || 0;

      // Convert ObjectId to string
      experts.forEach(u => {
        u._id = u._id.toString();
      });

      return {
        experts,
        totalExperts,
        totalPages: Math.ceil(totalExperts / limit),
      };
    } catch (error) {
      throw new InternalServerError('Failed to get experts');
    }
  }

  async countActiveExperts(session?: ClientSession): Promise<number> {
    await this.init();

    return this.usersCollection.countDocuments(
      {
        role: 'expert',
        status: 'active',
      },
      {session},
    );
  }

  async countNonBlockedExperts(session?: ClientSession): Promise<number> {
    await this.init();

    return this.usersCollection.countDocuments(
      {
        role: 'expert',
        isBlocked: {$ne: true},
      },
      {session},
    );
  }

  async updateIsBlocked(
    userId: string,
    action: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    try {
      const updatedAt = new Date();
      const isBlocked = action === 'block';
      const result = await this.usersCollection.findOneAndUpdate(
        {_id: new ObjectId(userId)},
        {$set: {isBlocked}},
        {upsert: true, returnDocument: 'after', session},
      );
      await Promise.all([
        this.userRoleHistoryCollection.updateOne(
          {
            userId: new ObjectId(userId),
            to: null,
          },
          {
            $set: {
              to: updatedAt,
              updatedAt,
            },
          },
          {session},
        ),
        this.userRoleHistoryCollection.insertOne(
          {
            userId: new ObjectId(userId),
            role: result.role,
            from: updatedAt,
            to: null,
            isVerified: result.isVerified ?? false,
            status: result.status,
            isBlocked: result.isBlocked,
            special_task_force: result.special_task_force,
            isTrainingUser: result.isTrainingUser ?? false
          },
          {session},
        ),
      ]);
    } catch (error) {
      throw new InternalServerError(`Failed to update IsBlock`);
    }
  }

  async updateSTFStatus(
    userId: string,
    action: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    try {
      const special_task_force = action === 'assign';
      const updatedAt = new Date();
      const updatedUser = await this.usersCollection.findOneAndUpdate(
        {_id: new ObjectId(userId)},
        {
          $set: {
            special_task_force,
            updatedAt,
          },
        },
        {upsert: true, returnDocument: 'after', session},
      );

      await Promise.all([
        this.userRoleHistoryCollection.updateOne(
          {
            userId: new ObjectId(userId),
            to: null,
          },
          {
            $set: {
              to: updatedAt,
              updatedAt,
            },
          },
          {session},
        ),
        this.userRoleHistoryCollection.insertOne(
          {
            userId: new ObjectId(userId),
            role: updatedUser.role,
            from: updatedAt,
            to: null,
            isVerified: updatedUser.isVerified ?? false,
            status: updatedUser.status,
            isBlocked: updatedUser.isBlocked,
            special_task_force: updatedUser.special_task_force,
            isTrainingUser: updatedUser.isTrainingUser ?? false
          },
          {session},
        ),
      ]);
    } catch (error) {
      throw new InternalServerError(`Failed to update STF status`);
    }
  }

  async updateActivityStatus(
    userId: string,
    status: 'active' | 'in-active',
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    try {
      const updatedAt = new Date();
      const result = await this.usersCollection.findOneAndUpdate(
        {_id: new ObjectId(userId)},
        {
          $set: {
            status,
            updatedAt: new Date(),
            isBlocked: status === 'active' ? false : true,
          },
        },
        {returnDocument: 'after', session},
      );

      await Promise.all([
        this.userRoleHistoryCollection.updateOne(
          {
            userId: new ObjectId(userId),
            to: null,
          },
          {
            $set: {
              to: updatedAt,
              updatedAt,
            },
          },
          {session},
        ),
        this.userRoleHistoryCollection.insertOne(
          {
            userId: new ObjectId(userId),
            role: result.role,
            from: updatedAt,
            to: null,
            isVerified: result.isVerified ?? false,
            status: result.status,
            isBlocked: result.isBlocked,
            special_task_force: result.special_task_force,
            isTrainingUser: result.isTrainingUser ?? false
          },
          {session},
        ),
      ]);
    } catch (error) {
      throw new InternalServerError(`Failed to update activity status`);
    }
  }

  async getUserRoleCount(
    startDateTime?:string,
    endDateTime?:string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    userType?: 'all' | 'tmu' | 'normal',
    session?: ClientSession,
  ): Promise<{
    userRoleOverview: UserRoleOverview[];
    stfExpertCount: number;
    stfModeratorCount: number;
  }> {
    try {
      await this.init();

      // Default to today's full UTC day if values are not provided
      const start =
        startDateTime != null
          ? new Date(startDateTime)
          : new Date(new Date().setUTCHours(0, 0, 0, 0));

      const end =
        endDateTime != null
          ? new Date(endDateTime)
          : new Date(new Date().setUTCHours(23, 59, 59, 999));

      const result = await this.userRoleHistoryCollection
        .aggregate(
          [
            // -------------------------------------------------------------------------
            // Step 1:
            // Get all history records that were active during the selected period.
            //
            // Example:
            // Expert     : 10:00 -> 11:00
            // Moderator  : 11:00 -> null
            //
            // Filter:
            // 10:00 -> 14:00
            //
            // Both records are returned.
            // -------------------------------------------------------------------------
            {
              $match: {
                $and: [
                  {
                    from: {$lte: end},
                  },
                  {
                    $or: [{to: null}, {to: {$gt: start}}],
                  },
                ],
              },
            },

            // -------------------------------------------------------------------------
            // Step 2:
            // Keep ONLY the latest history record for each user within the
            // selected period.
            //
            // Example:
            //
            // Expert     10:00
            // Moderator  11:00
            //
            // => Keeps Moderator
            // -------------------------------------------------------------------------
            {
              $sort: {
                userId: 1,
                from: -1,
                updatedAt: -1,
              },
            },
            {
              $group: {
                _id: '$userId',
                latest: {
                  $first: '$$ROOT',
                },
              },
            },

            {
              $replaceRoot: {
                newRoot: '$latest',
              },
            },

            // -------------------------------------------------------------------------
            // Step 3:
            // Filter based on the latest snapshot only.
            // This ensures we evaluate the user's latest status/block state
            // within the selected period.
            // -------------------------------------------------------------------------
            {
              $match: {
                isBlocked: false,
                $or: [
                  {status: 'active'},
                  {status: null},
                  {status: {$exists: false}},
                ],
                ...(
                  isAdmin
                    ? userType === 'tmu'
                      ? {isTrainingUser: true}
                      : userType === 'normal'
                        ? {isTrainingUser: {$ne: true}}
                        : {}
                    : (isTrainingUser
                        ? {isTrainingUser: true}
                        : {isTrainingUser: {$ne: true}})
                ),
              },
            },

            // -------------------------------------------------------------------------
            // Step 4:
            // Count users by role.
            // -------------------------------------------------------------------------
            {
              $group: {
                _id: '$role',

                count: {
                  $sum: 1,
                },

                stfCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $in: ['$role', ['expert', 'moderator']],
                          },
                          {
                            $eq: ['$special_task_force', true],
                          },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },

            // -------------------------------------------------------------------------
            // Step 5:
            // Convert role values into display names.
            // -------------------------------------------------------------------------
            {
              $project: {
                _id: 0,

                role: {
                  $switch: {
                    branches: [
                      {case: {$eq: ['$_id', 'expert']}, then: 'Experts'},
                      {case: {$eq: ['$_id', 'moderator']}, then: 'Moderators'},
                      {case: {$eq: ['$_id', 'admin']}, then: 'Admins'},
                      {
                        case: {$eq: ['$_id', 'pae_expert']},
                        then: 'PAE Experts',
                      },
                      {
                        case: {
                          $eq: ['$_id', 'district_coordinator'],
                        },
                        then: 'District Coordinators',
                      },
                      {
                        case: {
                          $eq: ['$_id', 'block_coordinator'],
                        },
                        then: 'Block Coordinators',
                      },
                      {
                        case: {
                          $eq: ['$_id', 'village_volunteer'],
                        },
                        then: 'Village Volunteers',
                      },
                      {case: {$eq: ['$_id', 'tester']}, then: 'Testers'},
                      {
                        case: {$eq: ['$_id', 'call_agent']},
                        then: 'Call Agents',
                      },
                    ],
                    default: 'Others',
                  },
                },

                count: 1,
                stfCount: 1,
              },
            },

            // -------------------------------------------------------------------------
            // Step 6:
            // Sort alphabetically.
            // -------------------------------------------------------------------------
            {
              $sort: {
                role: 1,
              },
            },
          ],
          {session},
        )
        .toArray();

      const userRoleOverview = result.map(({role, count}) => ({
        role,
        count,
      })) as UserRoleOverview[];
      return {
        userRoleOverview,
        stfExpertCount:
          result.find(item => item.role === 'Experts')?.stfCount ?? 0,
        stfModeratorCount:
          result.find(item => item.role === 'Moderators')?.stfCount ?? 0,
      };
    } catch (error) {
      console.error('Error fetching user role count:', error);
      throw new InternalServerError('Failed to fetch user role count');
    }
  }

  async getExpertPerformance(
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<ExpertPerformance[]> {
    await this.init();

    const experts = await this.usersCollection
      .find(
        {
          role: 'expert',
          ...(
            !isAdmin && isTrainingUser === true
              ? { isTrainingUser: true }
              : !isAdmin && isTrainingUser === false
                ? { isTrainingUser: { $ne: true } }
                : {}
          ),
        },
        {
          session,
          projection: {
            firstName: 1,
            reputation_score: 1,
            incentive: 1,
            penalty: 1,
          },
        },
      )
      .toArray();

    const performance: ExpertPerformance[] = experts.map(expert => {
      const name = expert.firstName || 'Unknown';
      const truncatedName = name.length > 18 ? name.slice(0, 18) + '...' : name;

      return {
        expert: truncatedName,
        reputation: expert.reputation_score || 0,
        incentive: expert.incentive || 0,
        penalty: expert.penalty || 0,
      };
    });
    return performance;
  }

  async updateCheckInTime(userId: string, time: Date) {
    await this.init();
    await this.usersCollection.updateOne(
      {_id: new ObjectId(userId)},
      {
        $set: {
          lastCheckInAt: time,
          updatedAt: new Date(),
        },
      },
    );
  }

  async findUnblockedUsers(session?: ClientSession): Promise<IUser[]> {
    try {
      await this.init();
      const experts = await this.usersCollection
        .find(
          {
            role: 'expert',
            isBlocked: {$ne: true},
          },
          session,
        )
        .toArray();
      return experts;
    } catch (error) {
      throw new InternalServerError('Failed to fetch users');
    }
  }

  async blockExperts(
    expertIds: string[],
    session: ClientSession,
  ): Promise<void> {
    try {
      await this.init();
      await this.usersCollection.updateMany(
        {_id: {$in: expertIds.map(id => new ObjectId(id))}},
        {$set: {isBlocked: true}},
        session,
      );
    } catch (error) {
      throw new InternalServerError('Failed to block users');
    }
  }
  async unBlockExperts(): Promise<void> {
    try {
      await this.init();
      await this.usersCollection.updateMany(
        {inactive: {$ne: true}},
        {$set: {isBlocked: false}},
      );
    } catch (error) {
      throw new InternalServerError('Failed to unblock experts');
    }
  }

  async findInactiveOrBlockedExperts(
    session?: ClientSession,
  ): Promise<IUser[]> {
    try {
      await this.init();
      return await this.usersCollection
        .find(
          {
            role: 'expert',
            $or: [{status: 'in-active'}, {isBlocked: true}],
          },
          {session},
        )
        .toArray();
    } catch (error) {
      throw new InternalServerError(
        'Failed to find inactive or blocked experts',
      );
    }
  }

  async findCallAgents(session?: ClientSession): Promise<IUser[]> {
    try {
      await this.init();

      const agents = await this.usersCollection
        .find(
          {
            role: 'call_agent' as any,
          },
          {session},
        )
        .toArray();

      // Convert ObjectId to string and return minimal data
      return agents.map(agent => ({
        ...agent,
        _id: agent._id.toString(),
      })) as IUser[];
    } catch (error) {
      throw new InternalServerError('Failed to find call agents');
    }
  }

  async findActiveCallAgents(session?: ClientSession): Promise<IUser[]> {
    try {
      await this.init();

      const agents = await this.usersCollection
        .find(
          {
            role: 'call_agent' as any,
            isCallAgentActive: true,
          },
          {session},
        )
        .toArray();

      return agents.map(agent => ({
        ...agent,
        _id: agent._id.toString(),
      })) as IUser[];
    } catch (error) {
      throw new InternalServerError('Failed to find active call agents');
    }
  }

  async setCallAgentStatus(
    userId: string,
    isCallAgent: boolean,
    isCallAgentActive: boolean,
    session?: ClientSession,
  ): Promise<IUser> {
    try {
      await this.init();

      // When setting as call agent, change role from expert to call_agent
      // When removing call agent, change role from call_agent back to expert
      const newRole = isCallAgent ? ('call_agent' as any) : 'expert';

      const result = await this.usersCollection.findOneAndUpdate(
        {_id: new ObjectId(userId)},
        {
          $set: {
            role: newRole,
            isCallAgentActive,
            updatedAt: new Date(),
          },
          $unset: {
            isCallAgent: 1,
          },
        },
        {returnDocument: 'after', session},
      );
      if (!result) {
        throw new NotFoundError('User not found');
      }
      const plainResult = JSON.parse(JSON.stringify(result));
      return {
        ...plainResult,
        _id: result._id.toString(),
      } as IUser;
    } catch (error) {
      console.error('setCallAgentStatus - error:', error);
      throw new InternalServerError('Failed to set call agent status');
    }
  }

  async toggleCallAgentActive(
    userId: string,
    session?: ClientSession,
  ): Promise<IUser> {
    try {
      await this.init();
      const user = await this.usersCollection.findOne(
        {_id: new ObjectId(userId)},
        {session},
      );
      if (!user) {
        throw new NotFoundError('User not found');
      }
      // Only allow toggling active status for call_agent role
      if (user.role !== ('call_agent' as any)) {
        throw new BadRequestError('User is not a call agent');
      }
      const newStatus = !user.isCallAgentActive;
      const result = await this.usersCollection.findOneAndUpdate(
        {_id: new ObjectId(userId)},
        {
          $set: {
            isCallAgentActive: newStatus,
            updatedAt: new Date(),
          },
        },
        {returnDocument: 'after', session},
      );
      const plainResult = JSON.parse(JSON.stringify(result));
      return {
        ...plainResult,
        _id: result._id.toString(),
      } as IUser;
    } catch (error) {
      throw new InternalServerError(
        'Failed to toggle call agent active status',
      );
    }
  }

  async findAndMarkAvailableAgent(
    callUuid: string,
    session?: ClientSession,
  ): Promise<IUser | null> {
    try {
      await this.init();
      // Atomically find and update an available agent
      // Query: active, not busy, has agent number assigned
      // Sort by agent number (smallest first)
      // Update: mark as busy and set currentCallUuid
      const result = await this.usersCollection.findOneAndUpdate(
        {
          role: 'call_agent' as any,
          isCallAgentActive: true,
          isBusy: false,
          agent: {$exists: true, $ne: 'not_available'},
        },
        {
          $set: {
            isBusy: true,
            currentCallUuid: callUuid,
            updatedAt: new Date(),
          },
        },
        {
          returnDocument: 'after',
          session,
          sort: {agent: 1}, // Sort by agent number to get smallest first
        },
      );

      if (!result) {
        return null;
      }

      const plainResult = JSON.parse(JSON.stringify(result));
      return {
        ...plainResult,
        _id: result._id.toString(),
      } as IUser;
    } catch (error) {
      console.error('findAndMarkAvailableAgent - error:', error);
      throw new InternalServerError('Failed to find and mark available agent');
    }
  }

  //get user history by userId
  async getUserHistory(
    query: {userId: string; startDateTime?: string; endDateTime?: string},
    session?: ClientSession,
  ): Promise<IUserHistory> {
    try {
      const {userId, startDateTime, endDateTime} = query;
      await this.init();

      // Default to today's full UTC day if values are not provided
      const start =
        startDateTime != null
          ? new Date(startDateTime)
          : new Date(new Date().setUTCHours(0, 0, 0, 0));

      const end =
        endDateTime != null
          ? new Date(endDateTime)
          : new Date(new Date().setUTCHours(23, 59, 59, 999));

      const result = await this.usersCollection
        .aggregate<IUserHistory>(
          [
            // -------------------------------------------------------------------------
            // Step 1:
            // Find the requested user.
            // -------------------------------------------------------------------------
            {
              $match: {
                _id: new ObjectId(userId),
              },
            },

            // -------------------------------------------------------------------------
            // Step 2:
            // Lookup all role history records that overlap the selected period.
            // -------------------------------------------------------------------------
            {
              $lookup: {
                from: 'user_role_history',
                let: {
                  userId: '$_id',
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ['$userId', '$$userId'],
                      },
                      from: {
                        $lte: end,
                      },
                      $or: [
                        {
                          to: null,
                        },
                        {
                          to: {
                            $gt: start,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $sort: {
                      from: 1,
                    },
                  },
                ],
                as: 'roleHistory',
              },
            },

            // -------------------------------------------------------------------------
            // Step 3:
            // Shape the response.
            // roleHistory will always be an array ([] if no history exists).
            // -------------------------------------------------------------------------
            {
              $project: {
                _id: 0,

                roleHistory: 1,

                userDetails: {
                  name: {
                    $trim: {
                      input: {
                        $concat: [
                          {$ifNull: ['$firstName', '']},
                          ' ',
                          {$ifNull: ['$lastName', '']},
                        ],
                      },
                    },
                  },
                  email: '$email',
                  firstName: '$firstName',
                  lastName: '$lastName',
                  role: '$role',
                  status: '$status',
                  isBlocked: '$isBlocked',
                  special_task_force: '$special_task_force',
                },
              },
            },
          ],
          {session},
        )
        .toArray();

      const userHistory = result[0];

      // console.log("History:", userHistory?.roleHistory);

      return {
        roleHistory: userHistory?.roleHistory ?? [],
        userDetails: userHistory?.userDetails ?? null,
      };
    } catch (error) {
      console.error('Error fetching user history:', error);
      throw new InternalServerError('Failed to fetch user history');
    }
  }

  async updateTrainingUserStatus(
    userId: string,
    action: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    try {
      const isTrainingUser = action === 'assign';
      const updatedAt = new Date();
      const updatedUser =await this.usersCollection.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        {
          $set: {
            isTrainingUser,
            updatedAt,
          },
        },
        { upsert: true, returnDocument: 'after', session },
      );

      
      await Promise.all([
        this.userRoleHistoryCollection.updateOne(
          {
            userId: new ObjectId(userId),
            to: null,
          },
          {
            $set: {
              to: updatedAt,
              updatedAt,
            },
          },
          { session },
        ),
        this.userRoleHistoryCollection.insertOne(
          {
            userId: new ObjectId(userId),
            role: updatedUser.role,
            from: updatedAt,
            to: null,
            isVerified: updatedUser.isVerified ?? false,
            status: updatedUser.status,
            isBlocked: updatedUser.isBlocked,
            special_task_force: updatedUser.special_task_force,
            isTrainingUser: updatedUser.isTrainingUser,
          },
          { session },
        )])
    } catch (error) {
      throw new InternalServerError(`Failed to update training user status`);
    }
  }
  /**
   * Clears all assigned question IDs for a user by setting assignedQuestionIds to null.
   * @param userId - The ID of the user whose assigned questions should be cleared
   */
  async clearAssignedQuestions(
    userId: string,
  ): Promise<{modifiedCount: number}> {
    await this.init();
    const result = await this.usersCollection.updateOne(
      {_id: new ObjectId(userId)},
      {
        $set: {
          // Empty array, NOT null — a null field can't be $push/$pull-ed, which would
          // make the user look "available" but block every future auto-assignment.
          assignedQuestionIds: [],
          updatedAt: new Date(),
        },
      },
    );
    return {modifiedCount: result.modifiedCount};
  }

  /**
   * Removes a questionId from a specific user's feedbacksAssigned array.
   * @param userId - The user ID whose feedbacksAssigned array should be updated
   * @param questionId - The question ID to remove from feedbacksAssigned array
   * @returns The updated user or null if not found
   */
  async removeFeedbacksAssigned(
    userId: string,
    questionId: string,
    session?: ClientSession,
  ): Promise<IUser | null> {
    await this.init();
    // feedbacksAssigned stores ObjectIds (claimFeedbackAllocation pushes
    // `new ObjectId(questionId)`), so pulling the raw string never matched and the
    // entry was never removed. Pull both forms to be safe against legacy string data.
    const pullValues: (string | ObjectId)[] = [questionId];
    if (ObjectId.isValid(questionId)) {
      pullValues.push(new ObjectId(questionId));
    }
    const result = await this.usersCollection.findOneAndUpdate(
      {_id: new ObjectId(userId)},
      {
        $pull: {
          feedbacksAssigned: {$in: pullValues} as any,
        },
        $set: {
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: 'after',
        session,
      },
    );
    return result;
  }

  private getBucketKey(date: Date, granularity: TrendGranularity): string {
    switch (granularity) {
      case 'hour':
        return (
          [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0'),
          ].join('-') + ` ${String(date.getHours()).padStart(2, '0')}:00`
        );

      case 'day':
        return [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, '0'),
          String(date.getDate()).padStart(2, '0'),
        ].join('-');

      case 'week': {
        const d = new Date(date);

        d.setHours(0, 0, 0, 0);

        d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));

        const week1 = new Date(d.getFullYear(), 0, 4);

        const week =
          1 +
          Math.round(
            ((d.getTime() - week1.getTime()) / 86400000 -
              3 +
              ((week1.getDay() + 6) % 7)) /
              7,
          );

        return `${d.getFullYear()}-W${week}`;
      }

      case 'month':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          '0',
        )}`;
    }
  }

  private getBucketEnd(date: Date, granularity: TrendGranularity): Date {
    const end = new Date(date);

    switch (granularity) {
      case 'hour':
        end.setMinutes(59, 59, 999);
        break;

      case 'day':
        end.setHours(23, 59, 59, 999);
        break;

      case 'week': {
        const day = end.getDay();
        const diff = day === 0 ? 0 : 7 - day;

        end.setDate(end.getDate() + diff);

        end.setHours(23, 59, 59, 999);

        break;
      }

      case 'month':
        end.setMonth(end.getMonth() + 1);

        end.setDate(0);

        end.setHours(23, 59, 59, 999);

        break;
    }

    return end;
  }

  async getWorkingHoursTrend(
    query: {
      userId: string;
      startDateTime: string;
      endDateTime: string;
      granularity: TrendGranularity;
    },
    session?: ClientSession,
  ): Promise<
    {
      label: string;
      workingHours: number;
    }[]
  > {
    try {
      const {userId, startDateTime, endDateTime, granularity} = query;

      await this.init();

      const start = new Date(startDateTime);
      const end = new Date(endDateTime);

      const sessions = await this.userRoleHistoryCollection
        .aggregate<{
          from: Date;
          to: Date | null;
        }>(
          [
            {
              $match: {
                userId: new ObjectId(userId),
                isBlocked: false,
                from: {
                  $lte: end,
                },
                $or: [
                  {
                    to: null,
                  },
                  {
                    to: {
                      $gt: start,
                    },
                  },
                ],
              },
            },
            {
              $project: {
                _id: 0,
                from: 1,
                to: 1,
              },
            },
            {
              $sort: {
                from: 1,
              },
            },
          ],
          {session},
        )
        .toArray();

      // console.log("Sessions:", sessions);

      const now = new Date();

      const buckets = new Map<string, number>();

      for (const sessionItem of sessions) {
        let sessionStart = new Date(sessionItem.from);
        let sessionEnd = sessionItem.to ? new Date(sessionItem.to) : now;

        // Restrict session to selected range
        if (sessionStart < start) {
          sessionStart = new Date(start);
        }

        if (sessionEnd > end) {
          sessionEnd = new Date(end);
        }

        if (sessionEnd <= sessionStart) {
          continue;
        }

        let current = new Date(sessionStart);

        while (current < sessionEnd) {
          const bucketEnd = this.getBucketEnd(current, granularity);

          const chunkEnd = sessionEnd < bucketEnd ? sessionEnd : bucketEnd;

          const hours =
            (chunkEnd.getTime() - current.getTime()) / (1000 * 60 * 60);

          const key = this.getBucketKey(current, granularity);

          buckets.set(key, (buckets.get(key) ?? 0) + hours);

          current = new Date(chunkEnd.getTime() + 1);
        }
      }

      const result: {
        label: string;
        workingHours: number;
      }[] = [];

      const cursor = new Date(start);

      while (cursor <= end) {
        const key = this.getBucketKey(cursor, granularity);

        result.push({
          label: key,
          workingHours: Math.round((buckets.get(key) ?? 0) * 10) / 10,
        });

        switch (granularity) {
          case 'hour':
            cursor.setHours(cursor.getHours() + 1);
            break;

          case 'day':
            cursor.setDate(cursor.getDate() + 1);
            break;

          case 'week':
            cursor.setDate(cursor.getDate() + 7);
            break;

          case 'month':
            cursor.setMonth(cursor.getMonth() + 1);
            break;
        }
      }

      console.log('result', result);

      return result;
    } catch (error) {
      console.error(error);
      throw new InternalServerError('Failed to fetch working hours trend');
    }
  }

  //find all auditors
   async findAuditors(): Promise<IUser[]> {
    await this.init();
    return await this.usersCollection.find({role: 'auditor'}).toArray();
  }

  async getUsersByRole(roles: UserRole[]) {
    await this.init();

    return this.usersCollection.find(
      {
        role: { $in: roles },
      },
      {
        projection: {
          _id: 1,
          email: 1,
          firstName: 1,
          lastName: 1,
        },
      },
    ).toArray();
  }

}
