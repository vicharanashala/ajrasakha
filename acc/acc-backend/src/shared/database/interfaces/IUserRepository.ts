import { ClientSession, ObjectId } from 'mongodb';
import { IUser } from '#root/shared/interfaces/models.js';

export interface IUserRepository {
  findById(id: string | ObjectId, session?: ClientSession): Promise<IUser | null>;
  findByEmail(email: string, session?: ClientSession): Promise<IUser | null>;
  findByFirebaseUID(firebaseUID: string, session?: ClientSession): Promise<IUser | null>;
  edit(userId: string, userData: Partial<IUser>, session?: ClientSession): Promise<IUser>;
  findCallAgents(session?: ClientSession): Promise<IUser[]>;
  findAndMarkAvailableAgent(callUuid: string, session?: ClientSession): Promise<IUser | null>;
}
