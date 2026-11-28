import {
  SignUpBody,
  User,
  ChangePasswordBody,
  GoogleSignUpBody,
  AdminCreateReviewUserBody,
  ResetPasswordBody,
} from '#auth/classes/index.js';
import { IAuthService, DecodedAuthToken, LocalLoginResult } from '#auth/interfaces/IAuthService.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { injectable, inject } from 'inversify';
import { ClientSession } from 'mongodb';
import { BadRequestError, HttpError, InternalServerError, UnauthorizedError } from 'routing-controllers';
import { IUser } from '#root/shared/interfaces/models.js';
import { BaseService } from '#root/shared/classes/BaseService.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { getFirebaseAuth } from '#root/config/firebaseAdmin.js';
import { error } from 'console';
import { sendEmailNotification } from '#root/utils/mailer.js';
import { buildPasswordResetEmail } from '#root/utils/passwordResetEmail.js';
import { appConfig } from '#root/config/app.js';
import { NotificationService } from '#root/modules/notification/services/NotificationService.js';
import { COORDINATOR_ROLES } from '#root/shared/constants/roles.js';
import bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { signLocalAuthToken, verifyLocalAuthToken } from '#root/utils/localAuthToken.js';
import { assertPasswordFitsBcrypt, assertStrongPassword } from '#root/utils/passwordPolicy.js';
import { isUserAccessDenied } from '#root/shared/functions/userAccess.js';

const PASSWORD_HASH_ROUNDS = 10;
const RESET_OTP_TTL_MINUTES = 10;
const RESET_OTP_MAX_FAILED_ATTEMPTS = 5;
const RESET_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const INVALID_RESET_CODE_MESSAGE = 'Invalid or expired reset code';

let dummyPasswordHash: string | undefined;

// Hash compared against when an email is unknown, so failed logins take the same time either way.
async function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= await bcrypt.hash(randomUUID(), PASSWORD_HASH_ROUNDS);
  return dummyPasswordHash;
}

// Applies the password rules for accounts whose password is stored in MongoDB.
function assertValidLocalPassword(password: string): void {
  assertStrongPassword(password);
  assertPasswordFitsBcrypt(password);
}

// Removes the password hash and pending reset code so user records can be safely returned to clients.
export function withoutPassword(user: IUser): IUser {
  const { password: _password, passwordReset: _passwordReset, ...safeUser } = user;
  return safeUser;
}

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
    // Firebase Admin is only initialised when Firebase login is enabled, so its credentials are optional otherwise.
    this.auth = appConfig.enableFirebaseLogin ? getFirebaseAuth() : null;
  }

  // Verifies a bearer token from the active login provider and returns its claims.
  async decodeToken(token: string): Promise<DecodedAuthToken> {
    if (appConfig.enableFirebaseLogin) {
      const decoded = await this.auth.verifyIdToken(token);
      return {
        uid: decoded.uid,
        email: decoded.email || '',
        emailVerified: Boolean(decoded.email_verified),
        name: decoded.name || '',
        issuedAt: decoded.iat,
      };
    }

    try {
      const decoded = verifyLocalAuthToken(token);
      return {
        uid: decoded.uid,
        email: decoded.email,
        // Local accounts have no email verification step; admin approval (isVerified) still applies.
        emailVerified: true,
        name: '',
        issuedAt: decoded.iat,
      };
    } catch (err) {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }

  async getCurrentUserFromToken(token: string): Promise<IUser> {
    const decodedToken = await this.decodeToken(token);
    const firebaseUID = decodedToken.uid;

    // Retrieve the user from our database using the Firebase UID
    const user = await this.userRepository.findByFirebaseUID(firebaseUID);
    if (!user) {
      console.warn(`Firebase user ${firebaseUID} not found in DB.`);
      throw new UnauthorizedError("User not found in database");
    }
    // Local tokens issued before the latest password change are revoked, matching Firebase's token revocation.
    if (
      !appConfig.enableFirebaseLogin &&
      user.passwordChangedAt &&
      Math.floor(new Date(user.passwordChangedAt).getTime() / 1000) > decodedToken.issuedAt
    ) {
      throw new UnauthorizedError('Session expired, please log in again');
    }
    user._id = user._id.toString();
    return withoutPassword(user);
  }
  async getUserIdFromReq(req: any): Promise<string> {
    // Extract the token from the request headers
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      throw new InternalServerError('No token provided');
    }
    const decodedToken = await this.decodeToken(token);
    const firebaseUID = decodedToken.uid;
    const user = await this.userRepository.findByFirebaseUID(firebaseUID);
    if (!user) {
      throw new InternalServerError('User not found');
    }
    return user._id.toString();
  }
  async verifyToken(token: string): Promise<boolean> {
    await this.decodeToken(token);
    return true;
  }

  // Checks an email and password against the bcrypt hash stored in MongoDB and issues a local token.
  async loginWithPassword(email: string, password: string): Promise<LocalLoginResult> {
    const user = await this.findUserByLoginEmail(email);

    // Unknown emails are compared against a dummy hash and get the same message, so accounts cannot be enumerated.
    const passwordMatches = await bcrypt.compare(password, user?.password || (await getDummyPasswordHash()));
    // HttpError (not UnauthorizedError) keeps the message: the error handler replaces UnauthorizedError text.
    if (!user?.password || !passwordMatches) {
      throw new HttpError(401, 'Invalid email or password');
    }

    // Checked only after the password matched, so these messages reveal nothing without valid credentials.
    if (user.isVerified === false) {
      throw new HttpError(401, 'Your account is pending admin verification. Please contact an administrator.');
    }
    if (isUserAccessDenied(user)) {
      throw new HttpError(401, 'User marked as Inactive Please Contact Moderator');
    }

    if (!user.firebaseUID) {
      // Older records may lack an identity key; local tokens need one to resolve the user.
      user.firebaseUID = `local_${randomUUID()}`;
      await this.userRepository.edit(user._id.toString(), { firebaseUID: user.firebaseUID });
    }

    const { token, expiresIn } = signLocalAuthToken(user.firebaseUID, user.email);
    user._id = user._id.toString();
    return { idToken: token, expiresIn, user: withoutPassword(user) };
  }

  // Finds the user for a login email: exact match first, then ignoring letter case.
  private async findUserByLoginEmail(email: string): Promise<IUser | null> {
    const trimmedEmail = email.trim();
    return (
      (await this.userRepository.findByEmail(trimmedEmail)) ??
      (await this.userRepository.findByEmailIgnoreCase(trimmedEmail))
    );
  }

  // Registers a MongoDB-only account; the user still needs admin approval before logging in.
  private async signupWithLocalPassword(body: SignUpBody): Promise<{ user: { uid: string; email: string; displayName: string; photoURL: string } }> {
    if (typeof body.firstName !== 'string' || !body.firstName.trim()) {
      throw new BadRequestError("Name cannot be blank or empty spaces");
    }
    assertValidLocalPassword(body.password);
    const email = body.email.trim().toLowerCase();
    const existingUser = await this.findUserByLoginEmail(email);
    if (existingUser) {
      // An existing record without a password must be given one by an admin; signup must not claim it.
      throw new BadRequestError('An account with this email already exists, Please try login!');
    }

    const newUser: Partial<IUser> = {
      firebaseUID: `local_${randomUUID()}`,
      email,
      firstName: body.firstName.trim(),
      lastName: typeof body.lastName === 'string' ? body.lastName.trim() : '',
      role: 'pae_expert',
      isVerified: false,
      password: await bcrypt.hash(body.password, PASSWORD_HASH_ROUNDS),
    };
    await this.createUserAndNotifyAdmins(newUser);

    const displayName = `${newUser.firstName} ${newUser.lastName}`.trim();
    return { user: { uid: newUser.firebaseUID, email, displayName, photoURL: '' } };
  }

  async signup(body: SignUpBody): Promise<{ user: { uid: string; email: string; displayName: string; photoURL: string } } | null> {
    if (!appConfig.enableFirebaseLogin) {
      return this.signupWithLocalPassword(body);
    }
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
    if (!appConfig.enableFirebaseLogin) {
      throw new BadRequestError('Google login is disabled');
    }
    const decodedToken = await this.decodeToken(token);
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
    if (!appConfig.enableFirebaseLogin) {
      assertValidLocalPassword(body.password);
    }
    // Without Firebase the bcrypt hash in MongoDB is the only credential, so it is stored on the user.
    const localCredential: Partial<IUser> = appConfig.enableFirebaseLogin
      ? {}
      : {
        password: await bcrypt.hash(body.password, PASSWORD_HASH_ROUNDS),
        passwordChangedAt: new Date(),
      };

    if (!appConfig.enableFirebaseLogin) {
      const existingUser = await this.findUserByLoginEmail(email);
      firebaseUser = { uid: existingUser?.firebaseUID || `local_${randomUUID()}` };
    } else try {
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
              ...localCredential,
            },
            session,
          );
          if (!updatedUser) {
            throw new InternalServerError('Failed to update review system user');
          }
          return withoutPassword(updatedUser);
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
        await this.saveLocalCredential(createdId, localCredential, session);
        const user = await this.userRepository.findById(createdId, session);
        if (!user) {
          throw new InternalServerError('Failed to create review system user');
        }
        return withoutPassword(user);
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
  ): Promise<{ success: boolean; message: string; idToken?: string; expiresIn?: number }> {
    if (!appConfig.enableFirebaseLogin) {
      return this.changeLocalPassword(body, requestUser);
    }
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

  // Updates the stored bcrypt hash after checking the current password, and issues a fresh token.
  private async changeLocalPassword(
    body: ChangePasswordBody,
    requestUser: IUser,
  ): Promise<{ success: boolean; message: string; idToken: string; expiresIn: number }> {
    if (body.newPassword !== body.newPasswordConfirm) {
      throw new ChangePasswordError('New passwords do not match');
    }
    assertValidLocalPassword(body.newPassword);
    const storedUser = await this.userRepository.findByFirebaseUID(requestUser.firebaseUID);
    if (!storedUser) {
      throw new ChangePasswordError('User not found');
    }
    const currentPasswordMatches =
      Boolean(body.currentPassword && storedUser.password) &&
      (await bcrypt.compare(body.currentPassword, storedUser.password));
    if (!currentPasswordMatches) {
      throw new ChangePasswordError('Incorrect current password');
    }
    if (await bcrypt.compare(body.newPassword, storedUser.password)) {
      throw new ChangePasswordError('New password cannot be the same as the current password');
    }

    // passwordChangedAt revokes older tokens, so the caller receives a new one to stay logged in.
    await this.userRepository.edit(storedUser._id.toString(), {
      password: await bcrypt.hash(body.newPassword, PASSWORD_HASH_ROUNDS),
      passwordChangedAt: new Date(),
    });
    const { token, expiresIn } = signLocalAuthToken(storedUser.firebaseUID, storedUser.email);
    return { success: true, message: 'Password updated successfully', idToken: token, expiresIn };
  }

  async updateFirebaseUser(
    firebaseUID: string,
    body: Partial<IUser>,
  ): Promise<void> {
    if (!appConfig.enableFirebaseLogin) {
      return;
    }
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

      await this.createUserAndNotifyAdmins(newUser);
      user = await this.userRepository.findByFirebaseUID(firebaseUID);
    }

    if (!user) throw new InternalServerError('User syncing failed');
    return withoutPassword(user);
  }

  // Stores the password hash separately because the User transformer only copies profile fields.
  private async saveLocalCredential(
    userId: string,
    credential: Pick<Partial<IUser>, 'password' | 'passwordChangedAt'>,
    session: ClientSession,
  ): Promise<void> {
    if (!credential.password) return;
    await this.userRepository.edit(
      userId,
      { password: credential.password, passwordChangedAt: credential.passwordChangedAt ?? new Date() },
      session,
    );
  }

  // Creates a pending user and notifies every admin that it needs verification.
  private async createUserAndNotifyAdmins(newUser: Partial<IUser>): Promise<void> {
    await this._withTransaction(async (session) => {
      const userObj = new User(newUser as IUser);
      const createdId = await this.userRepository.create(userObj, session);
      if (!createdId) throw new InternalServerError('Failed to create user in database');
      await this.saveLocalCredential(
        createdId,
        { password: newUser.password, passwordChangedAt: newUser.passwordChangedAt },
        session,
      );

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
  }

  async sendVerificationEmail(email: string): Promise<void> {
    try {
      // Local login has no email verification step.
      if (appConfig.isDevelopment || !appConfig.enableFirebaseLogin) return;
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
      if (appConfig.isDevelopment && appConfig.enableFirebaseLogin) return;
      if (!appConfig.enableFirebaseLogin) {
        await this.sendLocalPasswordResetOtp(email);
        return;
      }
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

  // Emails a one-time reset code to a known, active account; unknown emails are silently ignored.
  private async sendLocalPasswordResetOtp(email: string): Promise<void> {
    const user = await this.findUserByLoginEmail(email);
    // The reason is logged on the server only; the API response never reveals it.
    if (!user) {
      console.warn('[password-reset] No account found for the requested email; no code sent.');
      return;
    }
    if (!user.password) {
      console.warn(`[password-reset] ${user.email} has no password stored in MongoDB (Firebase-era account); no code sent.`);
      return;
    }
    if (user.isVerified === false || isUserAccessDenied(user)) {
      console.warn(`[password-reset] ${user.email} is unverified or inactive; no code sent.`);
      return;
    }

    // The cooldown stops the endpoint being used to flood a user's inbox.
    const lastRequestedAt = user.passwordReset?.requestedAt;
    if (lastRequestedAt && Date.now() - new Date(lastRequestedAt).getTime() < RESET_OTP_RESEND_COOLDOWN_MS) {
      console.warn(`[password-reset] A code was sent to ${user.email} less than a minute ago; not resending.`);
      return;
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = new Date();
    await this.userRepository.edit(user._id.toString(), {
      passwordReset: {
        otpHash: await bcrypt.hash(otp, PASSWORD_HASH_ROUNDS),
        requestedAt: now,
        expiresAt: new Date(now.getTime() + RESET_OTP_TTL_MINUTES * 60 * 1000),
        failedAttempts: 0,
      },
    });

    const mail = buildPasswordResetEmail(otp, RESET_OTP_TTL_MINUTES);
    await sendEmailNotification(user.email, mail.subject, mail.text, mail.html);
  }

  // Sets a new password when the emailed code matches, then revokes the code and all older sessions.
  async resetPasswordWithOtp(body: ResetPasswordBody): Promise<void> {
    if (appConfig.enableFirebaseLogin) {
      throw new HttpError(404, 'Not found');
    }
    if (body.newPassword !== body.newPasswordConfirm) {
      throw new HttpError(400, 'New passwords do not match');
    }
    try {
      assertValidLocalPassword(body.newPassword);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Invalid password');
    }

    const user = await this.findUserByLoginEmail(body.email);
    const reset = user?.passwordReset;
    // Same message for every failure so the response does not reveal whether the email exists.
    if (!user || !reset || new Date(reset.expiresAt).getTime() < Date.now() || reset.failedAttempts >= RESET_OTP_MAX_FAILED_ATTEMPTS) {
      throw new HttpError(400, INVALID_RESET_CODE_MESSAGE);
    }

    if (!(await bcrypt.compare(body.otp, reset.otpHash))) {
      await this.userRepository.edit(user._id.toString(), {
        passwordReset: { ...reset, failedAttempts: reset.failedAttempts + 1 },
      });
      throw new HttpError(400, INVALID_RESET_CODE_MESSAGE);
    }

    // passwordChangedAt invalidates tokens issued before the reset.
    await this.userRepository.edit(user._id.toString(), {
      password: await bcrypt.hash(body.newPassword, PASSWORD_HASH_ROUNDS),
      passwordChangedAt: new Date(),
      passwordReset: null,
    });
  }
}
