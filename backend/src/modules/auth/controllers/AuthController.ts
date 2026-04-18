import {
  SignUpBody,
  ChangePasswordBody,
  LoginBody,
  GoogleSignUpBody,
  ResendVerificationBody,
  ForgotPasswordBody,
  SignUpResponse,
  ChangePasswordResponse,
  AuthErrorResponse,
  LoginResponse,
  SyncAccountResponse,
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
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {appConfig} from '#root/config/app.js';

@OpenAPI({
  tags: ['Authentication'],
  description:'Authentication and authorization operations'
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
  @ResponseSchema(SignUpResponse, {
    statusCode: 201,
    description: 'User registered successfully. A verification email has been sent.',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid email format, weak password, or missing required fields',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 409,
    description: 'Conflict - Email already registered',
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
    description:'Registers a new user using Firebase Authentication and stores additional user details in the application database. This is typically the first step for any new user to access the system.',
  })
  @ResponseSchema(ChangePasswordResponse, {
    statusCode: 201,
    description: 'User registered successfully via Google OAuth',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid or expired token',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Missing or invalid Firebase token',
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
  @ResponseSchema(ChangePasswordResponse, {
    statusCode: 200,
    description: 'Password changed successfully',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Password mismatch, weak password, or same as old password',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 500,
    description: 'Internal server error during password change',
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
  @ResponseSchema(ChangePasswordResponse, {
    statusCode: 200,
    description: 'Verification email sent successfully',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid email format or user already verified',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 404,
    description: 'Not found - User with this email does not exist',
  })
  @Post('/resend-verification')
  async resendVerification(@Body() body: ResendVerificationBody) {
    await this.authService.sendVerificationEmail(body.email);
    return { success: true, message: 'Verification email sent successfully' };
  }

  @OpenAPI({
    summary: 'Send password reset email',
    description: 'Sends a password reset link to the provided email address. Always returns success to prevent email enumeration.',
  })
  @ResponseSchema(ChangePasswordResponse, {
    statusCode: 200,
    description: 'If this email is registered, a password reset link has been sent. (Always returns success to prevent email enumeration)',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid email format',
  })
  @Post('/forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordBody) {
    await this.authService.sendPasswordResetEmail(body.email);
    return { success: true, message: 'If this email is registered, a password reset link has been sent.' };
  }

  @OpenAPI({
    summary: 'User login',
    description: 'Authenticates a user with email and password. Returns Firebase ID token and user information on success. Requires email verification in production.',
  })
  @ResponseSchema(LoginResponse, {
    statusCode: 200,
    description: 'Login successful - Returns Firebase tokens and user info',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Missing email or password',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Invalid credentials, unverified email, or disabled account',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 500,
    description: 'Internal server error during login',
  })
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

       if (!userInfo?.emailVerified && !appConfig.isDevelopment) {
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

  @OpenAPI({
    summary: 'Sync account with database',
    description: 'Syncs the Firebase-authenticated user with the application database. Creates or updates the user record.',
  })
  @ResponseSchema(SyncAccountResponse, {
    statusCode: 200,
    description: 'Account synced successfully - Returns user data',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid or expired token',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Missing token, invalid token, or unverified email',
  })
  @ResponseSchema(AuthErrorResponse, {
    statusCode: 500,
    description: 'Internal server error during sync',
  })
  @Post('/sync')
  async syncAccount(@HeaderParam('Authorization') token: string) {
    const firebaseToken = token?.split(' ')[1];
    if (!firebaseToken) throw new HttpError(401, 'No token provided');

    try {
      // Decode the token manually
      const decodedEmail = await admin.auth().verifyIdToken(firebaseToken);

      if (!decodedEmail.email_verified && !appConfig.isDevelopment) {
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
