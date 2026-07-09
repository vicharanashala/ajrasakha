import 'reflect-metadata';
import {
  JsonController,
  Post,
  HttpCode,
  Body,
  HeaderParam,
  HttpError,
} from 'routing-controllers';
import { inject, injectable } from 'inversify';
import { FirebaseAuthService } from '../services/FirebaseAuthService.js';

@injectable()
@JsonController('/auth')
export class AuthController {
  constructor(
    @inject(FirebaseAuthService)
    private readonly authService: FirebaseAuthService,
  ) {}

  @Post('/resend-verification')
  @HttpCode(200)
  async resendVerification(@Body() body: { email: string }) {
    await this.authService.sendVerificationEmail(body.email);
    return { success: true, message: 'Verification email sent successfully' };
  }

  @Post('/forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: { email: string }) {
    await this.authService.sendPasswordResetEmail(body.email);
    return { success: true, message: 'Password reset link sent successfully' };
  }

  @Post('/sync')
  @HttpCode(200)
  async syncAccount(@HeaderParam('Authorization') token: string) {
    if (!token) {
      throw new HttpError(401, 'No authorization token provided.');
    }
    const bearerToken = token.split(' ')[1];
    if (!bearerToken) {
      throw new HttpError(401, 'Invalid authorization token format.');
    }

    try {
      const decodedToken = await (this.authService as any).auth.verifyIdToken(bearerToken);
      const email = decodedToken.email;
      const displayName = decodedToken.name || email.split('@')[0];
      const user = await this.authService.syncUserWithDb(decodedToken.uid, email, displayName);
      return { success: true, user };
    } catch (error: any) {
      throw new HttpError(500, `Account sync failed: ${error.message || error}`);
    }
  }
}
