import { GLOBAL_TYPES } from '#root/types.js';
import { injectable, inject } from 'inversify';
import { InternalServerError, UnauthorizedError } from 'routing-controllers';
import { IUser } from '#shared/interfaces/models.js';
import { BaseService } from '#shared/classes/BaseService.js';
import { IUserRepository } from '#shared/database/interfaces/IUserRepository.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';
import { getFirebaseAuth } from '#root/config/firebaseAdmin.js';

@injectable()
export class FirebaseAuthService extends BaseService {
  private auth: any;

  constructor(
    @inject(GLOBAL_TYPES.UserRepository)
    private userRepository: IUserRepository,
    @inject(GLOBAL_TYPES.Database)
    private database: MongoDatabase,
  ) {
    super(database);
    this.auth = getFirebaseAuth();
  }

  async getCurrentUserFromToken(token: string): Promise<IUser> {
    const decodedToken = await this.auth.verifyIdToken(token);
    const firebaseUID = decodedToken.uid;

    const user = await this.userRepository.findByFirebaseUID(firebaseUID);
    if (!user) {
      console.warn(`Firebase user ${firebaseUID} not found in DB.`);
      throw new UnauthorizedError("User not found in database");
    }
    user._id = user._id.toString();
    return user;
  }

  async getUserIdFromReq(req: any): Promise<string> {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      throw new InternalServerError('No token provided');
    }
    await this.verifyToken(token);
    const decodedToken = await this.auth.verifyIdToken(token);
    const firebaseUID = decodedToken.uid;
    const user = await this.userRepository.findByFirebaseUID(firebaseUID);
    if (!user) {
      throw new InternalServerError('User not found');
    }
    return user._id.toString();
  }

  async verifyToken(token: string): Promise<boolean> {
    const decodedToken = await this.auth.verifyIdToken(token);
    if (!decodedToken) {
      return false;
    }
    return true;
  }

  async findByFirebaseUID(uid: string): Promise<IUser | null> {
    return await this.userRepository.findByFirebaseUID(uid);
  }
}
