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
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      throw new BadRequestError('Email address is required');
    }

    try {
      const link = await this.auth.generateEmailVerificationLink(cleanEmail);

      const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #059669; margin: 0; font-size: 22px;">Annam Call Center</h2>
            <p style="color: #71717a; font-size: 14px; margin-top: 4px;">Email Verification</p>
          </div>
          <p style="color: #27272a; font-size: 15px; line-height: 1.6;">Hello,</p>
          <p style="color: #27272a; font-size: 15px; line-height: 1.6;">
            Thank you for registering with the Annam Call Center portal. Please click the button below to verify your email address:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${link}" style="display: inline-block; background-color: #059669; color: #ffffff; padding: 12px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 2px 4px rgba(5, 150, 105, 0.2);">
              Verify Email Address
            </a>
          </div>
          <p style="color: #71717a; font-size: 13px; line-height: 1.5;">
            If the button doesn't work, copy and paste this link into your browser:<br/>
            <a href="${link}" style="color: #059669; word-break: break-all;">${link}</a>
          </p>
          <hr style="border: none; border-top: 1px solid #f4f4f5; margin: 24px 0;" />
          <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 0;">
            If you did not create an account, you can safely ignore this email.
          </p>
        </div>
      `;

      const sent = await sendEmailNotification(
        cleanEmail,
        'Verify your email - Annam Call Center',
        `Please verify your email by clicking on the link below:\n\n${link}\n\nIf you did not create an account, you can safely ignore this email.`,
        html
      );

      if (!sent) {
        throw new InternalServerError('Failed to dispatch verification email. Please check SMTP configuration.');
      }

      console.log(`✉️ Verification email sent successfully to ${cleanEmail}`);
    } catch (err: any) {
      console.error(`Failed to send verification email to ${cleanEmail}:`, err);
      if (err instanceof BadRequestError || err instanceof InternalServerError) {
        throw err;
      }
      throw new BadRequestError(`Failed to send verification email: ${err.message || 'Unknown error'}`);
    }
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      throw new BadRequestError('Email address is required');
    }

    try {
      const link = await this.auth.generatePasswordResetLink(cleanEmail);

      const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #059669; margin: 0; font-size: 22px;">Annam Call Center</h2>
            <p style="color: #71717a; font-size: 14px; margin-top: 4px;">Password Reset Request</p>
          </div>
          <p style="color: #27272a; font-size: 15px; line-height: 1.6;">Hello,</p>
          <p style="color: #27272a; font-size: 15px; line-height: 1.6;">
            We received a request to reset the password for your Annam Call Center account. Click the button below to set a new password:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${link}" style="display: inline-block; background-color: #059669; color: #ffffff; padding: 12px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 2px 4px rgba(5, 150, 105, 0.2);">
              Reset Password
            </a>
          </div>
          <p style="color: #71717a; font-size: 13px; line-height: 1.5;">
            This link will expire shortly for your security. If the button doesn't work, copy and paste this link into your browser:<br/>
            <a href="${link}" style="color: #059669; word-break: break-all;">${link}</a>
          </p>
          <hr style="border: none; border-top: 1px solid #f4f4f5; margin: 24px 0;" />
          <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 0;">
            If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
      `;

      await sendEmailNotification(
        cleanEmail,
        'Reset your password - Annam Call Center',
        `Reset your password by clicking on the link below:\n\n${link}\n\nThis link will expire shortly. If you did not request this, please ignore this email.`,
        html
      );
      console.log(`✉️ Password reset email sent successfully to ${cleanEmail}`);
    } catch (err: any) {
      console.error(`Failed to send password reset email to ${cleanEmail}:`, err);
      // Security best practice: don't reveal whether the user exists or not
      if (err.code === 'auth/user-not-found' || err.message?.includes('user-not-found')) {
        console.warn(`Password reset requested for non-existent user: ${cleanEmail}`);
        return;
      }
      throw new BadRequestError(`Failed to send password reset email: ${err.message || 'Unknown error'}`);
    }
  }


  async updateFirebaseUser(
    firebaseUID: string,
    body: Partial<IUser>,
  ): Promise<void> {
    await this.auth.updateUser(firebaseUID, {
      displayName: `${body.firstName} ${body.lastName || ''}`,
    });
  }
}
