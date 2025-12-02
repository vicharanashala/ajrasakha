import {IUserRepository} from '#shared/database/interfaces/IUserRepository.js';
import {IUser, NotificationRetentionType} from '#shared/interfaces/models.js';
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

@injectable()
export class UserRepository implements IUserRepository {
  private usersCollection!: Collection<IUser>;

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

  async getUsersByIds(ids: string[]): Promise<IUser[]> {
    await this.init();
    const objectIds = ids.map(id => new ObjectId(id));
    const users = await this.usersCollection
      .find({_id: {$in: objectIds}})
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
    return [...matched, ...unmatched].map(s => s.user);
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

  async findAllExperts(
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
      const mappedExperts = users.map(u => ({
        ...u,
        _id: u._id.toString(),
      }));
      return {experts: mappedExperts, totalExperts, totalPages};
    } catch (error) {
      throw new InternalServerError(`Failed to get experts`);
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
          projection: {firstName: 1, reputation_score: 1, incentive: 1, penalty: 1},
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
}
