import {IUserRepository} from '#shared/database/interfaces/IUserRepository.js';
import {
  IUser,
  NotificationRetentionType,
  IAnswer,
} from '#shared/interfaces/models.js';
import {instanceToPlain} from 'class-transformer';
import {injectable, inject} from 'inversify';
import {Collection, MongoClient, ClientSession, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {InternalServerError, NotFoundError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {User} from '#auth/classes/transformers/User.js';
import {PreferenceDto} from '#root/modules/core/classes/validators/UserValidators.js';
import {
  ExpertPerformance,
  ModeratorApprovalRate,
  UserRoleOverview,
} from '#root/modules/core/classes/validators/DashboardValidators.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';

@injectable()
export class UserRepository implements IUserRepository {
  private usersCollection!: Collection<IUser>;
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
    const {_id, ...sanitizedData} = userData;
    const result = await this.usersCollection.updateOne(
      {_id: new ObjectId(userId)},
      {
        $set: {
          ...sanitizedData,
          updatedAt: new Date(),
        },
      },
      {session},
    );
    if (result.matchedCount === 0) return null;

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

  async findAll(session?: ClientSession): Promise<IUser[]> {
    await this.init();
    const allUsers = await this.usersCollection.find({}, {session}).toArray();

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
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (filter && filter !== 'ALL') {
      matchQuery['preference.state'] = filter;
    }

    const sortMap: any = {
      role: { roleOrder: 1 },
      workload_asc: { reputation_score: 1 },
      workload_desc: { reputation_score: -1 },
      incentive_asc: { incentive: 1 },
      incentive_desc: { incentive: -1 },
      penalty_asc: { penalty: 1 },
      penalty_desc: { penalty: -1 },
      joined_asc: { createdAt: 1 },
      joined_desc: { createdAt: -1 },
      default: { rankPosition: 1 },
    };

    const selectedSort = sortMap[sortOption] || sortMap.default;

    const result = await this.usersCollection
      .aggregate([
        /** Match users */
        { $match: matchQuery },

        /** Default isBlocked */
        {
          $addFields: {
            isBlocked: { $ifNull: ['$isBlocked', false] },
          },
        },

        /** Answers count */
        {
          $lookup: {
            from: 'answers',
            let: { userId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$authorId', '$$userId'] } } },
              { $count: 'count' },
            ],
            as: 'answersMeta',
          },
        },

        /** Derived fields */
        {
          $addFields: {
            totalAnswers_Created: {
              $ifNull: [{ $arrayElemAt: ['$answersMeta.count', 0] }, 0],
            },
            penalty: { $ifNull: ['$penalty', 0] },
            incentive: { $ifNull: ['$incentive', 0] },
            reputation_score: { $ifNull: ['$reputation_score', 0] },
          },
        },

        /** Penalty percentage */
        {
          $addFields: {
            penaltyPercentage: {
              $cond: [
                { $gt: ['$totalAnswers_Created', 0] },
                {
                  $multiply: [
                    { $divide: ['$penalty', '$totalAnswers_Created'] },
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
                  { case: { $eq: ['$role', 'admin'] }, then: 1 },
                  { case: { $eq: ['$role', 'moderator'] }, then: 2 },
                  { case: { $eq: ['$role', 'expert'] }, then: 3 },
                ],
                default: 99,
              },
            },
          },
        },

        /** Ranking sort (global rank order) */
        {
          $sort: {
            isBlocked: 1,
            roleOrder: 1,
            createdAt: 1,
          },
        },

        /** Assign rankPosition */
        {
          $group: {
            _id: null,
            users: { $push: '$$ROOT' },
          },
        },
        {
          $unwind: {
            path: '$users',
            includeArrayIndex: 'rankPosition',
          },
        },
        {
          $addFields: {
            'users.rankPosition': { $add: ['$rankPosition', 1] },
          },
        },
        {
          $replaceRoot: { newRoot: '$users' },
        },

        /** UI sorting (dropdown) */
        {
          $sort: {
            isBlocked: 1,
            ...selectedSort,
          },
        },
        {
          $project:{
            firebaseUID:0
          }
        },

        /** Pagination */
        {
          $facet: {
            users: [{ $skip: skip }, { $limit: limit }],
            meta: [{ $count: 'totalUsers' }],
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

  async findExpertsByPreference(
    details: PreferenceDto,
    session?: ClientSession,
  ): Promise<IUser[]> {
    await this.init();

    // 1. Fetch all experts
    const allUsersRaw = await this.usersCollection
      .find({role: 'expert', isBlocked: false}, {session})
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

        const prefState = (pref.state || '').toLowerCase().trim();
        const prefDomain = (pref.domain || '').toLowerCase().trim();
        const prefCrop = (pref.crop || '').toLowerCase().trim();

        const detState = (details.state || '').toLowerCase().trim();
        const detDomain = (details.domain || '').toLowerCase().trim();
        const detCrop = (details.crop || '').toLowerCase().trim();

        const isAllSelected =
          prefCrop === 'all' && prefState === 'all' && prefDomain === 'all';

        let score = 0;

        // Preference Weighting
        if (prefState !== 'all' && prefState === detState) score += 3;

        if (prefDomain !== 'all' && prefDomain === detDomain) score += 2;

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
  async findExpertsByReputationScore(
    details: PreferenceDto,
    session?: ClientSession,
  ): Promise<IUser[]> {
    await this.init();

    // 1. Fetch all experts
    const allUsersRaw = await this.usersCollection
      .find({role: 'expert', isBlocked: false}, {session})
      .toArray();

    // 2. Remove duplicates based on email
    const uniqueUsersMap = new Map<string, IUser>();
    for (const user of allUsersRaw) {
      if (!user.email) continue;
      if (!uniqueUsersMap.has(user.email)) uniqueUsersMap.set(user.email, user);
    }
    let allUsers = Array.from(uniqueUsersMap.values());
    allUsers.sort((a, b) => {
      return a.reputation_score - b.reputation_score;
    });

    return allUsers;
  }

  async findModerators(): Promise<IUser[]> {
    await this.init();
    return await this.usersCollection.find({role: 'moderator'}).toArray();
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
      
      const result = await this.usersCollection.aggregate([
      /** Match experts */
      { $match: {role:"expert"} },
     

      /** Default isBlocked */
      {
        $addFields: {
          isBlocked: { $ifNull: ['$isBlocked', false] },
        },
      },

      /** Answers count */
      {
        $lookup: {
          from: 'answers',
          let: { userId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$authorId', '$$userId'] } } },
            { $count: 'count' },
          ],
          as: 'answersMeta',
        },
      },

      /** Derived fields */
      {
        $addFields: {
          totalAnswers_Created: {
            $ifNull: [{ $arrayElemAt: ['$answersMeta.count', 0] }, 0],
          },
          penalty: { $ifNull: ['$penalty', 0] },
          incentive: { $ifNull: ['$incentive', 0] },
          reputation_score: { $ifNull: ['$reputation_score', 0] },
        },
      },

      /** Penalty percentage */
      {
        $addFields: {
          penaltyPercentage: {
            $cond: [
              { $gt: ['$totalAnswers_Created', 0] },
              {
                $multiply: [
                  { $divide: ['$penalty', '$totalAnswers_Created'] },
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
                  { $multiply: ['$totalAnswers_Created', 0.5] },
                  { $multiply: ['$incentive', 0.3] },
                ],
              },
              { $multiply: ['$penaltyPercentage', 0.2] },
            ],
          },
        },
      },

      /** Ranking sort (global rank order) */
      {
        $sort: {
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
          experts: { $push: '$$ROOT' },
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
          'experts.rankPosition': { $add: ['$rankPosition', 1] },
        },
      },
      {
        $replaceRoot: { newRoot: '$experts' },
      },

      /** UI sorting (dropdown) */
      {
        $sort: {
          isBlocked: 1,
          ...selectedSort,
        },
      },
      { $match: matchQuery },

      {
            $project: {
              firebaseUID: 0,
            },
      },

      /** Pagination */
      {
        $facet: {
          experts: [{ $skip: skip }, { $limit: limit }],
          meta: [{ $count: 'totalExperts' }],
        },
      },
    ]).toArray();


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

  async updateIsBlocked(
    userId: string,
    action: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    try {
      const isBlocked = action === 'block';
      await this.usersCollection.updateOne(
        {_id: new ObjectId(userId)},
        {$set: {isBlocked}},
        {upsert: true, session},
      );
    } catch (error) {
      throw new InternalServerError(`Failed to update IsBlock`);
    }
  }

  async getUserRoleCount(session?: ClientSession): Promise<UserRoleOverview[]> {
    try {
      await this.init();

      const result = await this.usersCollection
        .aggregate(
          [
            {$match: {isBlocked: false}},
            {
              $group: {
                _id: '$role',
                count: {$sum: 1},
              },
            },
            {
              $project: {
                _id: 0,
                role: {
                  $switch: {
                    branches: [
                      {case: {$eq: ['$_id', 'expert']}, then: 'Experts'},
                      {case: {$eq: ['$_id', 'moderator']}, then: 'Moderators'},
                    ],
                    default: 'Others',
                  },
                },
                count: 1,
              },
            },
          ],
          {session},
        )
        .toArray();

      return result as UserRoleOverview[];
    } catch (error) {
      console.error('Error fetching user role count:', error);
      throw new InternalServerError('Failed to fetch user role count');
    }
  }

  async getExpertPerformance(
    session?: ClientSession,
  ): Promise<ExpertPerformance[]> {
    await this.init();

    const experts = await this.usersCollection
      .find(
        {role: 'expert'},
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
    { _id: new ObjectId(userId) },
    {
      $set: {
        lastCheckInAt: time,
        updatedAt: new Date(),
      },
    }
  );
}

async findUnblockedUsers(session?:ClientSession):Promise<IUser[]>{
  try {
    await this.init()
    const experts = await this.usersCollection.find(
      {
        role: 'expert',
        isBlocked: { $ne: true },
      },
      session,
    ).toArray()
    return experts
  } catch (error) {
    throw new InternalServerError('Failed to fetch users');
  }
}

async blockExperts(expertIds:string[],session:ClientSession):Promise<void>{
  try {
    await this.init()
      await this.usersCollection.updateMany(
      { _id: { $in: expertIds.map(id => new ObjectId(id)) } },
      { $set: { isBlocked: true } },
      session,
    );
  } catch (error) {
    throw new InternalServerError('Failed to block users');
  }
}

async unBlockExperts():Promise<void>{
  try {
    await this.init()
      await this.usersCollection.updateMany(
      { inactive: { $ne: true } },
      { $set: { isBlocked: false } },
    );
  } catch (error) {
    throw new InternalServerError('Failed to block users');
  }
}
}
