import {
  SignUpBody,
  User,
  ChangePasswordBody,
  GoogleSignUpBody,
  AdminCreateReviewUserBody,
} from '#auth/classes/index.js';
import { IAuthService } from '#auth/interfaces/IAuthService.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { injectable, inject } from 'inversify';
import { BadRequestError, InternalServerError, UnauthorizedError } from 'routing-controllers';
import { IUser } from '#root/shared/interfaces/models.js';
import { BaseService } from '#root/shared/classes/BaseService.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { getFirebaseAuth } from '#root/config/firebaseAdmin.js';
import { error } from 'console';
import { sendEmailNotification } from '#root/utils/mailer.js';
import { appConfig } from '#root/config/app.js';
import { NotificationService } from '#root/modules/notification/services/NotificationService.js';
import { COORDINATOR_ROLES } from '#root/shared/constants/roles.js';

/**
 * Custom error thrown during password change operations.
 *
 * @category Auth/Errors
 */
export class ChangePasswordError extends Error {
  /**
   * Creates a new ChangePasswordError instance.
   *
   * @param message - The error message describing what went wrong
   */
  constructor(message: string) {
    super(message);
    this.name = 'ChangePasswordError';
  }
}

@injectable()
export class FirebaseAuthService extends BaseService implements IAuthService {
  private auth: any;
  constructor(
    @inject(GLOBAL_TYPES.UserRepository)
    private userRepository: IUserRepository,
    @inject(GLOBAL_TYPES.Database)
    private database: MongoDatabase,
    @inject(GLOBAL_TYPES.NotificationService)
    private notificationService: NotificationService,
  ) {
    super(database);
    if (!appConfig.isDevelopment) {
      this.auth = getFirebaseAuth();
    }
  }
  async getCurrentUserFromToken(token: string): Promise<IUser> {
    let decodedToken: any;

    if (appConfig.isDevelopment) {
      const { verifyIdToken } = await import('#auth/dev-auth.js');
      decodedToken = verifyIdToken(token);
      if (!decodedToken) {
        throw new UnauthorizedError('Invalid or expired token');
      }
    } else {
      decodedToken = await this.auth.verifyIdToken(token);
    }

    const firebaseUID = decodedToken.uid;

    let user: any;
    try {
      user = await this.userRepository.findByFirebaseUID(firebaseUID);
    } catch (e) {
      if (appConfig.isDevelopment) {
        return {
          _id: decodedToken.uid,
          firebaseUID: decodedToken.uid,
          email: decodedToken.email || '',
          firstName: decodedToken.displayName || decodedToken.email?.split('@')[0] || 'Dev User',
          lastName: '',
          role: 'pae_expert',
        } as any;
      }
      throw e;
    }

    if (!user) {
      if (appConfig.isDevelopment) {
        return {
          _id: decodedToken.uid,
          firebaseUID: decodedToken.uid,
          email: decodedToken.email || '',
          firstName: decodedToken.displayName || decodedToken.email?.split('@')[0] || 'Dev User',
          lastName: '',
          role: 'pae_expert',
        } as any;
      }
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

    let decodedToken: any;
    if (appConfig.isDevelopment) {
      const { verifyIdToken } = await import('#auth/dev-auth.js');
      decodedToken = verifyIdToken(token);
    } else {
      decodedToken = await this.auth.verifyIdToken(token);
    }

    const firebaseUID = decodedToken.uid;

    let user: any;
    try {
      user = await this.userRepository.findByFirebaseUID(firebaseUID);
    } catch (e) {
      if (appConfig.isDevelopment) {
        return decodedToken.uid;
      }
      throw new InternalServerError('User not found');
    }

    if (!user) {
      if (appConfig.isDevelopment) {
        return decodedToken.uid;
      }
      throw new InternalServerError('User not found');
    }
    return user._id.toString();
  }
  async verifyToken(token: string): Promise<boolean> {
    if (appConfig.isDevelopment) {
      const { verifyIdToken } = await import('#auth/dev-auth.js');
      const decoded = verifyIdToken(token);
      return !!decoded;
    }
    const decodedToken = await this.auth.verifyIdToken(token);
    if (!decodedToken) {
      return false;
    }
    return true;
  }

  async signup(body: SignUpBody): Promise<{ user: { uid: string; email: string; displayName: string; photoURL: string } } | null> {
    let userRecord: any;
    try {
      if (!body.firstName.trim()) {
        throw new Error("Name cannot be blank or empty spaces");
      }
      userRecord = await this.auth.createUser({
        email: body.email,
        emailVerified: false,
        password: body.password,
        displayName: `${body.firstName} ${body.lastName || ''}`,
        disabled: false,
      });
    } catch (error: any) {
      if (error.code === 'auth/email-already-exists') {
        const existingUser = await this.auth.getUserByEmail(body.email);
        if (!existingUser.emailVerified) {
          // If unverified, update details and allow re-signup
          userRecord = await this.auth.updateUser(existingUser.uid, {
            password: body.password,
            displayName: `${body.firstName} ${body.lastName || ''}`,
          });
        } else {
          throw new BadRequestError('An account with this email already exists, Please try login!');
        }
      } else {
        let message = error.message || 'Failed to create user';
        if (error.code === 'auth/invalid-password') {
          message = 'The password does not meet Firebase requirements.';
        } else if (error.code === 'auth/invalid-email') {
          message = 'Invalid email format.';
        }
        throw new BadRequestError(message);
      }
    }

    // Prepare user object for storage in our database
    const user: Partial<IUser> = {
      firebaseUID: userRecord.uid,
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName || '',
      role: 'pae_expert',
    };

    // create the user in the database will happen on the first successful login after email verification.
    await this.sendVerificationEmail(body.email);

    return {
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName || `${body.firstName} ${body.lastName || ''}`,
        photoURL: userRecord.photoURL || '',
      }
    }
  }
  async googleSignup(body: GoogleSignUpBody, token: string): Promise<any> {
    await this.verifyToken(token);
    // Decode the token to get the Firebase UID
    const decodedToken = await this.auth.verifyIdToken(token);
    const firebaseUID = decodedToken.uid;
    const user: Partial<IUser> = {
      firebaseUID: firebaseUID,
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      role: 'pae_expert',
    };

    let createdUserId: string;

    await this._withTransaction(async session => {
      const newUser = new User(user);
      createdUserId = await this.userRepository.create(newUser, session);
      if (!createdUserId) {
        throw new InternalServerError('Failed to create the user');
      }

      // Notify admins
      const admins = await this.userRepository.findAdmins(session);
      const notificationMessage = `A new user ${body.firstName} ${body.lastName || ''} (${body.email}) created and needs to be verified`;
      const notificationTitle = 'New User Created';

      for (const admin of admins) {
        await this.notificationService.saveTheNotifications(
          notificationMessage,
          notificationTitle,
          createdUserId,
          admin._id.toString(),
          'user_verification',
          session
        );
      }
    });
  }

  async adminCreateReviewUser(body: AdminCreateReviewUserBody): Promise<IUser> {
    const email = body.email.trim().toLowerCase();
    const fullName = body.name.trim();

    if (!fullName) {
      throw new BadRequestError('Name is required');
    }

    if (!COORDINATOR_ROLES.includes(body.role)) {
      throw new BadRequestError('Invalid review system role');
    }

    const names = fullName.split(/\s+/);
    const firstName = names[0] || email.split('@')[0];
    const lastName = names.slice(1).join(' ');
    const isVerified = body.isVerified ?? true;
    let firebaseUser: any;
    let createdFirebaseUser = false;

    try {
      firebaseUser = await this.auth.getUserByEmail(email);
      await this.auth.updateUser(firebaseUser.uid, {
        password: body.password,
        displayName: fullName,
        emailVerified: true,
        disabled: false,
      });
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') {
        throw new BadRequestError(error.message || 'Failed to prepare Firebase user');
      }

      firebaseUser = await this.auth.createUser({
        email,
        password: body.password,
        displayName: fullName,
        emailVerified: true,
        disabled: false,
      });
      createdFirebaseUser = true;
    }

    try {
      const createdUser = await this._withTransaction(async session => {
        const existingUserByUid = await this.userRepository.findByFirebaseUID(
          firebaseUser.uid,
          session,
        );
        if (existingUserByUid) {
          throw new BadRequestError('Review system user with this email already exists');
        }

        const existingUserByEmail = await this.userRepository.findByEmail(
          email,
          session,
        );
        if (existingUserByEmail) {
          if (
            existingUserByEmail.firebaseUID &&
            existingUserByEmail.firebaseUID !== firebaseUser.uid
          ) {
            throw new BadRequestError(
              'Review system user with this email is already linked to another Firebase account',
            );
          }

          const updatedUser = await this.userRepository.edit(
            existingUserByEmail._id.toString(),
            {
              firebaseUID: firebaseUser.uid,
              email,
              firstName,
              lastName,
              role: body.role,
              isVerified,
              isBlocked: false,
              status: 'active',
            },
            session,
          );
          if (!updatedUser) {
            throw new InternalServerError('Failed to update review system user');
          }
          return updatedUser;
        }

        const newUser = new User({
          firebaseUID: firebaseUser.uid,
          email,
          firstName,
          lastName,
          role: body.role,
          isVerified,
        });

        const createdId = await this.userRepository.create(newUser, session);
        const user = await this.userRepository.findById(createdId, session);
        if (!user) {
          throw new InternalServerError('Failed to create review system user');
        }
        return user;
      });

      return createdUser;
    } catch (error) {
      if (createdFirebaseUser) {
        await this.auth.deleteUser(firebaseUser.uid).catch((deleteError: any) => {
          console.error('Failed to rollback Firebase user creation:', deleteError);
        });
      }
      throw error;
    }
  }

  async changePassword(
    body: ChangePasswordBody,
    requestUser: IUser,
  ): Promise<{ success: boolean; message: string }> {
    // Verify user exists in Firebase
    const firebaseUser = await this.auth.getUser(requestUser.firebaseUID);
    if (!firebaseUser) {
      throw new ChangePasswordError('User not found');
    }

    // Check password confirmation
    if (body.newPassword !== body.newPasswordConfirm) {
      throw new ChangePasswordError('New passwords do not match');
    }

    // Update password in Firebase Auth
    await this.auth.updateUser(firebaseUser.uid, {
      password: body.newPassword,
    });

    return { success: true, message: 'Password updated successfully' };
  }

  async updateFirebaseUser(
    firebaseUID: string,
    body: Partial<IUser>,
  ): Promise<void> {
    // Update user in Firebase Auth
    await this.auth.updateUser(firebaseUID, {
      displayName: `${body.firstName} ${body.lastName}`,
    });
  }

  async findByFirebaseUID(uid: string): Promise<IUser> {
    return await this.userRepository.findByFirebaseUID(uid)
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
      console.log(`User ${firebaseUID} not found in DB, creating...`);
      const names = displayName.split(' ');
      const newUser: Partial<IUser> = {
        firebaseUID: firebaseUID,
        email: email,
        firstName: names[0] || email.split('@')[0],
        lastName: names.slice(1).join(' ') || '',
        role: 'pae_expert',
        isVerified: false,
      };

      await this._withTransaction(async (session) => {
        const userObj = new User(newUser as IUser); // Assuming User class takes Partial<IUser>
        const createdId = await this.userRepository.create(userObj, session);
        if (!createdId) throw new InternalServerError('Failed to create user in database');

        // Notify admins
        const admins = await this.userRepository.findAdmins(session);
        const notificationMessage = `A new user ${newUser.firstName} ${newUser.lastName || ''} (${newUser.email}) created and needs to be verified`;
        const notificationTitle = 'New User Created';

        for (const adminUser of admins) {
          await this.notificationService.saveTheNotifications(
            notificationMessage,
            notificationTitle,
            createdId,
            adminUser._id.toString(),
            'user_verification',
            session
          );
        }
      });

      user = await this.userRepository.findByFirebaseUID(firebaseUID);
    }

    if (!user) throw new InternalServerError('User syncing failed');
    return user;
  }

  async sendVerificationEmail(email: string): Promise<void> {
    try {
      if (appConfig.isDevelopment) return;
      const link = await this.auth.generateEmailVerificationLink(email);

      await sendEmailNotification(
        email,
        'Verify your email',
        `Please verify your email by clicking on the link below: ${link}

Once your email is verified, your account will require admin approval before you can access and log in to the platform.

If you face any issues, please contact the admin.`,
        `
    <p>Please verify your email by clicking on the link below:</p>
    <p>
      <a href="${link}">${link}</a>
    </p>

    <p>
      Once your email is verified, your account will require admin approval
      before you can access and log in to the platform.
    </p>

    <p>
      If you face any issues, please contact the admin.
    </p>
  `,
      );
      console.log(`Verification email sent successfully to ${email}`);
    } catch (err: any) {
      console.error(`Failed to send verification email to ${email}:`, err);
      throw new BadRequestError(`Failed to send verification email: ${err.message || 'Unknown error'}`);
    }
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      if (appConfig.isDevelopment) return;
      const link = await this.auth.generatePasswordResetLink(email);

      await sendEmailNotification(
        email,
        'Reset your password',
        `Reset your password by clicking on the link below: ${link}`,
        `<p>We received a request to reset your password.</p>
         <p>Click the link below to set a new password. This link will expire shortly.</p>
         <p><a href="${link}">Reset Password</a></p>
         <p>If you didn't request this, you can safely ignore this email.</p>`,
      );
      console.log(`Password reset email sent successfully to ${email}`);
    } catch (err: any) {
      // Silently fail — don't reveal whether the email exists
      console.error(`Failed to send password reset email to ${email}:`, err);
    }
  }
}
