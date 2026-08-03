import { ClientSession, ObjectId } from 'mongodb';
import { IUser } from '#root/shared/interfaces/models.js';

export interface IUserRepository {
  findById(id: string | ObjectId, session?: ClientSession): Promise<IUser | null>;
  findByEmail(email: string, session?: ClientSession): Promise<IUser | null>;
  findByFirebaseUID(firebaseUID: string, session?: ClientSession): Promise<IUser | null>;
  edit(userId: string, userData: Partial<IUser>, session?: ClientSession): Promise<IUser>;
  findCallAgents(session?: ClientSession): Promise<IUser[]>;
  findActiveCallAgents(session?: ClientSession): Promise<IUser[]>;
  findCallCentreManagers(session?: ClientSession): Promise<IUser[]>;
  findAllAdmins(session?: ClientSession): Promise<IUser[]>;
  findAndMarkAvailableAgent(callUuid: string, session?: ClientSession): Promise<IUser | null>;
  findAllUsers(page?: number, limit?: number, search?: string, session?: ClientSession): Promise<{ users: IUser[]; total: number }>;
}
