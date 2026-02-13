import {
  SignUpBody,
  User,
  ChangePasswordBody,
  GoogleSignUpBody,
} from '#auth/classes/index.js';
import {IAuthService} from '#auth/interfaces/IAuthService.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {injectable, inject} from 'inversify';
import {BadRequestError, InternalServerError, UnauthorizedError} from 'routing-controllers';
import admin from 'firebase-admin';
import {IUser} from '#root/shared/interfaces/models.js';
import {BaseService} from '#root/shared/classes/BaseService.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import path from 'path';
import {fileURLToPath} from 'url';
import serviceAccount from '../../../../agriai-a2fba-firebase-adminsdk-fbsvc-452072d744.json' with {type: 'json'};
import { error } from 'console';
import { sendEmailNotification } from '#root/utils/mailer.js';

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
  ) {
    super(database);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          serviceAccount as admin.ServiceAccount,
        ),
      });
    }
    this.auth = admin.auth();
  }
  async getCurrentUserFromToken(token: string): Promise<IUser> {
    // Verify the token and decode it to get the Firebase UID
    const decodedToken = await this.auth.verifyIdToken(token);
    const firebaseUID = decodedToken.uid;

    // Retrieve the user from our database using the Firebase UID
    const user = await this.userRepository.findByFirebaseUID(firebaseUID);
    if(!user){
      console.warn(`Firebase user ${firebaseUID} not found in DB.`);
      throw new UnauthorizedError("User not found in database");
    }
    user._id = user._id.toString();
    return user;
  }
  async getUserIdFromReq(req: any): Promise<string> {
    // Extract the token from the request headers
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      throw new InternalServerError('No token provided');
    }
    await this.verifyToken(token);
    // Decode the token to get the Firebase UID
    const decodedToken = await this.auth.verifyIdToken(token);
    const firebaseUID = decodedToken.uid;
    const user = await this.userRepository.findByFirebaseUID(firebaseUID);
    if (!user) {
      throw new InternalServerError('User not found');
    }
    return user._id.toString();
  }
  async verifyToken(token: string): Promise<boolean> {
    // Decode and verify the Firebase token
    const decodedToken = await this.auth.verifyIdToken(token);
    // // Retrieve the full user record from Firebase
    // const userRecord = await this.auth.getUser(decodedToken.uid);

    // Map Firebase user data to our application user model
    if (!decodedToken) {
      return false;
    }
    return true;
  }

  async signup(body: SignUpBody): Promise<{ user: { uid: string; email: string; displayName: string; photoURL: string }} | null>{
    let userRecord: any;
    try {
      if(!/^[^\s@]+@annam\.ai$/.test(body.email)){
        throw new Error("Please enter a valid email")
      }
      if(!body.firstName.trim()){
        throw new Error("Name cannot be blank or empty spaces");
      }
      // Create the user in Firebase Auth
      userRecord = await this.auth.createUser({
        email: body.email,
        emailVerified: false,
        password: body.password,
        displayName: `${body.firstName} ${body.lastName || ''}`,
        disabled: false,
      });
    } catch (error) {
      let message = "Failed to create user";

      if (error.code === "auth/email-already-exists") {
        message = "An account with this email already exists, Please try login!";
      }
      else if (error.code === "auth/invalid-password") {
        message = "The password does not meet Firebase requirements.";
      }
      else if (error.code === "auth/invalid-email") {
        message = "Invalid email format.";
      }

      throw new BadRequestError(message);
    }

    // Prepare user object for storage in our database
    const user: Partial<IUser> = {
      firebaseUID: userRecord.uid,
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName || '',
      role: 'expert',
    };

    // create the user in the database will happen on the first successful login after email verification.
    try {
      
      const link = await this.auth.generateEmailVerificationLink(body.email);

      await sendEmailNotification(
        body.email,
        'Verify your email',
        `Please verify your email by clicking on the link below: ${link}`,
        `<p>Please verify your email by clicking on the link below:</p><a href="${link}">${link}</a>`,
      );
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }

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
      role: 'expert',
    };

    let createdUserId: string;

    await this._withTransaction(async session => {
      const newUser = new User(user);
      createdUserId = await this.userRepository.create(newUser, session);
      if (!createdUserId) {
        throw new InternalServerError('Failed to create the user');
      }
    });
  }

  async changePassword(
    body: ChangePasswordBody,
    requestUser: IUser,
  ): Promise<{success: boolean; message: string}> {
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

    return {success: true, message: 'Password updated successfully'};
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

  async findByFirebaseUID(uid:string):Promise<IUser>{
    return await this.userRepository.findByFirebaseUID(uid)
  }

  async syncUserWithDb(firebaseUID: string, email: string, displayName: string): Promise<IUser> {
    let user = await this.userRepository.findByFirebaseUID(firebaseUID);

    if (!user) {
      console.log(`User ${firebaseUID} not found in DB, creating...`);
      const names = displayName.split(' ');
      const newUser: Partial<IUser> = {
        firebaseUID: firebaseUID,
        email: email,
        firstName: names[0] || email.split('@')[0],
        lastName: names.slice(1).join(' ') || '',
        role: 'expert',
      };

      await this._withTransaction(async (session) => {
        const userObj = new User(newUser as IUser); // Assuming User class takes Partial<IUser>
        const createdId = await this.userRepository.create(userObj, session);
        if (!createdId) throw new InternalServerError('Failed to create user in database');
      });

      user = await this.userRepository.findByFirebaseUID(firebaseUID);
    }

    if (!user) throw new InternalServerError('User syncing failed');
    return user;
  }
}
