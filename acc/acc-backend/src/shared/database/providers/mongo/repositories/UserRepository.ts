import { injectable, inject } from 'inversify';
import { Collection, Db, ObjectId, ClientSession } from 'mongodb';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '../MongoDatabase.js';
import { IUserRepository } from '#shared/database/interfaces/IUserRepository.js';
import { IUser } from '#shared/interfaces/models.js';

@injectable()
export class UserRepository implements IUserRepository {
  private usersCollection: Collection<any>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly database: MongoDatabase,
  ) {}

  private async init() {
    if (!this.usersCollection) {
      const db = await this.database.init();
      this.usersCollection = db.collection('users');
    }
  }

  async findById(
    id: string | ObjectId,
    session?: ClientSession,
  ): Promise<IUser | null> {
    await this.init();
    const user = await this.usersCollection.findOne(
      { _id: new ObjectId(id) },
      { session },
    );
    if (!user) return null;
    return {
      ...user,
      _id: user._id.toString(),
    } as IUser;
  }

  async findByFirebaseUID(
    firebaseUID: string,
    session?: ClientSession,
  ): Promise<IUser | null> {
    await this.init();
    const user = await this.usersCollection.findOne({ firebaseUID }, { session });
    if (!user) return null;
    return {
      ...user,
      _id: user._id.toString(),
    } as IUser;
  }

  async edit(
    userId: string,
    userData: Partial<IUser>,
    session?: ClientSession,
  ): Promise<IUser> {
    await this.init();
    const { _id, ...sanitizedData } = userData;
    const updatedAt = new Date();
    await this.usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          ...sanitizedData,
          updatedAt,
        },
      },
      { session },
    );

    const updatedUser = await this.usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { session },
    );
    return {
      ...updatedUser,
      _id: updatedUser._id.toString(),
    } as IUser;
  }

  async findCallAgents(session?: ClientSession): Promise<IUser[]> {
    await this.init();
    const agents = await this.usersCollection
      .find(
        {
          role: 'call_agent',
        },
        { session },
      )
      .toArray();

    return agents.map((agent) => ({
      ...agent,
      _id: agent._id.toString(),
    })) as IUser[];
  }

  async findAndMarkAvailableAgent(
    callUuid: string,
    session?: ClientSession,
  ): Promise<IUser | null> {
    await this.init();
    const result = await this.usersCollection.findOneAndUpdate(
      {
        role: 'call_agent',
        isCallAgentActive: true,
        isBusy: false,
        agent: { $exists: true, $ne: 'not_available' },
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
        sort: { agent: 1 },
      },
    );

    if (!result) {
      return null;
    }

    return {
      ...result,
      _id: result._id.toString(),
    } as IUser;
  }
}
