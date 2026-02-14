import {
  SignUpBody,
  ChangePasswordBody,
  LoginBody,
  GoogleSignUpBody,
  ResendVerificationBody,
} from '#auth/classes/validators/AuthValidators.js';
import {
  IAuthService,
  AuthenticatedRequest,
} from '#auth/interfaces/IAuthService.js';
import {ChangePasswordError} from '#auth/services/FirebaseAuthService.js';
import {injectable, inject} from 'inversify';
import admin from 'firebase-admin';
import {
  JsonController,
  Post,
  HttpCode,
  Body,
  Authorized,
  Patch,
  Req,
  HeaderParam,
  HttpError,
  OnUndefined,
} from 'routing-controllers';
import {AUTH_TYPES} from '#auth/types.js';
import {OpenAPI} from 'routing-controllers-openapi';
import {appConfig} from '#root/config/app.js';

@OpenAPI({
  tags: ['Authentication'],
})
@JsonController('/auth')
@injectable()
export class AuthController {
  constructor(
    @inject(AUTH_TYPES.AuthService)
    private readonly authService: IAuthService,
  ) {}

  @OpenAPI({
    summary: 'Register a new user account',
    description:
      'Registers a new user using Firebase Authentication and stores additional user details in the application database. This is typically the first step for any new user to access the system.',
  })
  @Post('/signup')
  @HttpCode(201)
  @OnUndefined(201)
  async signup(@Body() body: SignUpBody) {
    const result = await this.authService.signup(body);
    return { success: true, message:' Please check your email to verify your account.', ...result };
  }

  @OpenAPI({
    summary: 'Register a new user account',
    description:
      'Registers a new user using Firebase Authentication and stores additional user details in the application database. This is typically the first step for any new user to access the system.',
  })
  @Post('/signup/google')
  @HttpCode(201)
  async googleSignup(@Body() body: GoogleSignUpBody, @Req() req: any) {
    await this.authService.googleSignup(
      body,
      req.headers.authorization?.split(' ')[1],
    );
    return {success: true, message: 'User registered successfully'};
  }

  @OpenAPI({
    summary: 'Change user password',
    description:
      'Allows an authenticated user to update their password. This action is performed via Firebase Authentication and requires the current credentials to be valid.',
  })
  @Authorized()
  @Patch('/change-password')
  async changePassword(
    @Body() body: ChangePasswordBody,
    @Req() request: AuthenticatedRequest,
  ) {
    try {
      const result = await this.authService.changePassword(body, request.user);
      return {success: true, message: result.message};
    } catch (error) {
      if (error instanceof ChangePasswordError) {
        throw new HttpError(400, error.message);
      }
      if (error instanceof Error) {
        throw new HttpError(500, error.message);
      }
      throw new HttpError(500, 'Internal server error');
    }
  }

  @OpenAPI({
    summary: 'Resend verification email',
    description: 'Resends the verification email to the provided email address.',
  })
  @Post('/resend-verification')
  async resendVerification(@Body() body: ResendVerificationBody) {
    await this.authService.sendVerificationEmail(body.email);
    return { success: true, message: 'Verification email sent successfully' };
  }

  @Post('/login')
  async login(@Body() body: LoginBody) {
    try {
      const {email, password} = body;
      const data = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${appConfig.firebase.apiKey}`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        },
      );

      const result:any = await data.json();
      if (!result.idToken) {
        const errorMessage = result.error?.message || 'Invalid email or password';
        throw new HttpError(401, errorMessage);
      }

      //alternative 
      //   const decoded = await admin.auth().verifyIdToken(result.idToken);

      // if (!decoded.email_verified) {
      //   throw new Error('Please verify your email before logging in.');
      // }

      // 2️⃣ Verify email status
      const lookup = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${appConfig.firebase.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: result.idToken }),
        }
      );

      const lookupData:any = await lookup.json();
      const userInfo = lookupData.users?.[0];

      if (!userInfo?.emailVerified) {
        await this.authService.sendVerificationEmail(userInfo.email);
        throw new HttpError(
          401,
          'Please verify your email before logging in. A new verification link has been sent to your email.'
        );
      }

      // Ensure the user exists in database
      await this.authService.syncUserWithDb(
        userInfo.localId,
        userInfo.email,
        userInfo.displayName || ''
      );

      return result;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(500, 'Internal server error during login');
    }
  }

  @Post('/sync')
  async syncAccount(@HeaderParam('Authorization') token: string) {
    const firebaseToken = token?.split(' ')[1];
    if (!firebaseToken) throw new HttpError(401, 'No token provided');

    try {
      // Decode the token manually
      const decodedEmail = await admin.auth().verifyIdToken(firebaseToken);

      if (!decodedEmail.email_verified) {
        throw new HttpError(401, 'Please verify your email before syncing account.');
      }

      const user = await this.authService.syncUserWithDb(
        decodedEmail.uid,
        decodedEmail.email || '',
        decodedEmail.name || ''
      );

      return { success: true, user };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(500, error.message || 'Sync failed');
    }
  }
}
