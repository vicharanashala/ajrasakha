import { GLOBAL_TYPES } from '#root/types.js';
import { injectable, inject } from 'inversify';
import { InternalServerError, UnauthorizedError, BadRequestError } from 'routing-controllers';
import { IUser } from '#shared/interfaces/models.js';
import { BaseService } from '#shared/classes/BaseService.js';
import { IUserRepository } from '#shared/database/interfaces/IUserRepository.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';
import { getFirebaseAuth } from '#root/config/firebaseAdmin.js';
import { ClientSession } from 'mongodb';
import { sendEmailNotification } from '#root/utils/mailer.js';

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

  async syncUserWithDb(firebaseUID: string, email: string, displayName: string): Promise<IUser> {
    let user = await this.userRepository.findByFirebaseUID(firebaseUID);

    if (!user) {
      const existingUserByEmail = await this.userRepository.findByEmail(email);
      if (existingUserByEmail) {
        await this.userRepository.edit(existingUserByEmail._id.toString(), {
          firebaseUID,
        });
        user = await this.userRepository.findByFirebaseUID(firebaseUID);
      }
    }

    if (!user) {
      console.log(`User ${firebaseUID} not found in DB, creating as call_agent...`);
      const names = displayName.split(' ');
      const newUser: Partial<IUser> = {
        firebaseUID: firebaseUID,
        email: email,
        firstName: names[0] || email.split('@')[0],
        lastName: names.slice(1).join(' ') || '',
        role: 'call_agent',
      };

      await this._withTransaction(async (session: ClientSession) => {
        const collection = await this.database.getCollection('users');
        const result = await collection.insertOne({
          ...newUser,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any, { session });
        if (!result.insertedId) throw new InternalServerError('Failed to create user in database');
      });

      user = await this.userRepository.findByFirebaseUID(firebaseUID);
    }

    if (!user) throw new InternalServerError('User syncing failed');
    return user;
  }

  async sendVerificationEmail(email: string): Promise<void> {
    try {
      const link = await this.auth.generateEmailVerificationLink(email);
      console.log(`\n==================================================`);
      console.log(`✉️ [VERIFICATION EMAIL LINK FOR ${email}]:`);
      console.log(`${link}`);
      console.log(`==================================================\n`);

      await sendEmailNotification(
        email,
        'Verify your email',
        `Please verify your email by clicking on the link below: ${link}`,
        `
          <p>Please verify your email by clicking on the link below:</p>
          <p><a href="${link}">${link}</a></p>
        `
      );
    } catch (err: any) {
      console.error(`Failed to send verification email to ${email}:`, err);
      throw new BadRequestError(`Failed to send verification email: ${err.message || 'Unknown error'}`);
    }
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      const link = await this.auth.generatePasswordResetLink(email);
      console.log(`\n==================================================`);
      console.log(`✉️ [PASSWORD RESET EMAIL LINK FOR ${email}]:`);
      console.log(`${link}`);
      console.log(`==================================================\n`);

      await sendEmailNotification(
        email,
        'Reset your password',
        `Reset your password by clicking on the link below: ${link}`,
        `
          <p>Click the link below to set a new password. This link will expire shortly.</p>
          <p><a href="${link}">${link}</a></p>
        `
      );
    } catch (err: any) {
      console.error(`Failed to send password reset email to ${email}:`, err);
      throw new BadRequestError(`Failed to send password reset email: ${err.message || 'Unknown error'}`);
    }
  }
}
