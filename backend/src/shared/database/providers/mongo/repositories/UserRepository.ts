import {IUserRepository} from '#shared/database/interfaces/IUserRepository.js';
import {IUser} from '#shared/interfaces/models.js';
import {instanceToPlain} from 'class-transformer';
import {injectable, inject} from 'inversify';
import {Collection, MongoClient, ClientSession, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {InternalServerError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {User} from '#auth/classes/transformers/User.js';
import {PreferenceDto} from '#root/modules/core/classes/validators/UserValidators.js';

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
          _id: 0,
          firebaseUID: 0,
        },
        session,
      },
    );

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
      {$set: sanitizedData},
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
    return this.usersCollection.find({}, {session}).toArray();
  }

  async findExpertsByPreference(
    details: PreferenceDto,
    session?: ClientSession,
  ): Promise<IUser[]> {
    await this.init();

    //1. Find all expert users who are relevant (at least one preference matches or is "all")
    const baseQuery: any = {
      role: 'expert',
      $or: [
        {'preference.crop': {$in: [details.crop, 'all']}},
        {'preference.state': {$in: [details.state, 'all']}},
        {'preference.domain': {$in: [details.domain, 'all']}},
      ],
    };

    const allUsers = await this.usersCollection
      .find(baseQuery, {session})
      .toArray();

    // Remove duplicate users (in case multiple  emails point to same user)
    const uniqueUsersMap = new Map<string, IUser>();
    for (const user of allUsers) {
      const uniqueKey = user.email || user._id.toString();
      if (!uniqueUsersMap.has(uniqueKey)) {
        uniqueUsersMap.set(uniqueKey, user);
      }
    }
    const uniqueUsers = Array.from(uniqueUsersMap.values());

    //2. Score users based on number of matching preferences
    const scoredUsers = uniqueUsers.map(user => {
      let score = 0;

      if (user.preference?.crop === details.crop) score++;
      if (user.preference?.state === details.state) score++;
      if (user.preference?.domain === details.domain) score++;

      //  if all are 'all', push to the very end
      const isAllSelected =
        user.preference?.crop === 'all' &&
        user.preference?.state === 'all' &&
        user.preference?.domain === 'all';

      return {user, score, isAllSelected};
    });

    //3. Sort users by:
    // - Highest score first (3 → 2 → 1)
    // - Then those who selected "all" for everything go last
    scoredUsers.sort((a, b) => {
      if (a.isAllSelected && !b.isAllSelected) return 1;
      if (!a.isAllSelected && b.isAllSelected) return -1;
      return b.score - a.score;
    });

    //4. Return priority queue of users
    return scoredUsers.map(s => s.user);
  }
}
