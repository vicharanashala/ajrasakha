import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsAlpha,
  IsString,
  Matches,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';

class SignUpBody {
  @JSONSchema({
    title: 'Email Address',
    description: 'Email address of the user, used as login identifier',
    example: 'user@example.com',
    type: 'string',
    format: 'email',
  })
  @IsEmail()
  email: string;

  @JSONSchema({
    title: 'Password',
    description:
      'Password for account authentication (minimum 8 characters). Must contain: <br />\
1. **Uppercase letters** (A–Z)  <br /> \
2. **Lowercase letters** (a–z)  <br /> \
3. **Numbers** (0–9)   <br />\
4. **Special symbols** (`! @ # $ % ^ & * ( ) – _ = + [ ] { } | ; : , . ? /`) ',
    example: 'SecureP@ssw0rd',
    type: 'string',
    minLength: 8,
    format: 'password',
    writeOnly: true,
  })
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @JSONSchema({
    title: 'First Name',
    description: "User's first name (alphabetic characters only)",
    example: 'John',
    type: 'string',
  })
  // @Matches(/^[A-Za-z ]+$/)
  firstName: string;

  @JSONSchema({
    title: 'Last Name',
    description: "User's last name (alphabetic characters only)",
    example: 'Smith',
    type: 'string',
  })
  // @Matches(/^[A-Za-z ]+$/)
  @IsOptional()
  lastName?: string;
}

class GoogleSignUpBody {
  @JSONSchema({
    title: 'Email Address',
    description: 'Email address of the user, used as login identifier',
    example: 'user@example.com',
    type: 'string',
    format: 'email',
  })
  @IsEmail()
  email: string;

  @JSONSchema({
    title: 'First Name',
    description: "User's first name (alphabetic characters only)",
    example: 'John',
    type: 'string',
  })
  // @Matches(/^[A-Za-z ]+$/)
  firstName: string;

  @JSONSchema({
    title: 'Last Name',
    description: "User's last name (alphabetic characters only)",
    example: 'Smith',
    type: 'string',
  })
  // @Matches(/^[A-Za-z ]+$/)
  @IsOptional()
  lastName?: string;
}

class VerifySignUpProviderBody {
  @JSONSchema({
    title: 'Firebase Auth Token',
    description: 'Firebase Auth Token',
    example: '43jdlsaksla;f328e9fjhsda',
    type: 'string',
  })
  @IsString()
  token: string;
}

class ChangePasswordBody {
  @JSONSchema({
    title: 'New Password',
    description:
      'New password that meets security requirements.  Must contain: <br />\
1. **Uppercase letters** (A–Z)  <br /> \
2. **Lowercase letters** (a–z)  <br /> \
3. **Numbers** (0–9)   <br />\
4. **Special symbols** (`! @ # $ % ^ & * ( ) – _ = + [ ] { } | ; : , . ? /`) ',
    example: 'SecureP@ssw0rd',
    type: 'string',
    format: 'password',
    minLength: 8,
    writeOnly: true,
  })
  newPassword: string;

  @JSONSchema({
    title: 'Confirm New Password',
    description:
      'Confirmation of the new password (must match exactly). Must contain: <br />\
1. **Uppercase letters** (A–Z)  <br /> \
2. **Lowercase letters** (a–z)  <br /> \
3. **Numbers** (0–9)   <br />\
4. **Special symbols** (`! @ # $ % ^ & * ( ) – _ = + [ ] { } | ; : , . ? /`) ',
    example: 'SecureP@ssw0rd',
    type: 'string',
    format: 'password',
    minLength: 8,
    writeOnly: true,
  })
  newPasswordConfirm: string;
}

class SignUpResponse {
  @JSONSchema({
    description: 'Unique identifier for the user',
    example: 'cKy6H2O04PgTh8O3DpUXjgJYUr53',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  uid: string;

  @JSONSchema({
    description: 'Email address of the registered user',
    example: 'user@example.com',
    type: 'string',
    format: 'email',
    readOnly: true,
  })
  @IsEmail()
  email: string;

  @JSONSchema({
    description: "User's first name",
    example: 'John',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  firstName: string;

  @JSONSchema({
    description: "User's last name",
    example: 'Smith',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  lastName: string;
}

class ChangePasswordResponse {
  @JSONSchema({
    description: 'Indicates the operation was successful',
    example: true,
    type: 'boolean',
    readOnly: true,
  })
  @IsNotEmpty()
  success: boolean;

  @JSONSchema({
    description: 'Success message',
    example: 'Password changed successfully',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  message: string;
}

class TokenVerificationResponse {
  @JSONSchema({
    description: 'Confirmation message for valid token',
    example: 'Token is valid',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  message: string;
}

class AuthErrorResponse {
  @JSONSchema({
    description: 'The error message',
    example: 'Invalid credentials. Please check your email and password.',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

class LoginResponse {
  @JSONSchema({
    description: 'Firebase ID token for authentication',
    example: 'eyJhbGciOiJSUzI1NiIs...',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  idToken: string;

  @JSONSchema({
    description: 'Firebase refresh token for obtaining new ID tokens',
    example: 'AOvuKvS...',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  refreshToken: string;

  @JSONSchema({
    description: 'Expiration time of the ID token in seconds',
    example: 3600,
    type: 'number',
    readOnly: true,
  })
  @IsNotEmpty()
  expiresIn: number;

  @JSONSchema({
    description: 'Firebase local ID (user unique identifier)',
    example: 'cKy6H2O04PgTh8O3DpUXjgJYUr53',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  localId: string;

  @JSONSchema({
    description: 'User email address',
    example: 'user@example.com',
    type: 'string',
    format: 'email',
    readOnly: true,
  })
  @IsEmail()
  email: string;

  @JSONSchema({
    description: 'Display name of the user',
    example: 'John Smith',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  displayName?: string;

  @JSONSchema({
    description: 'Whether the email has been verified',
    example: true,
    type: 'boolean',
    readOnly: true,
  })
  @IsBoolean()
  emailVerified: boolean;
}

class SyncAccountResponse {
  @JSONSchema({
    description: 'Indicates the sync operation was successful',
    example: true,
    type: 'boolean',
    readOnly: true,
  })
  @IsNotEmpty()
  success: boolean;

  @JSONSchema({
    description: 'User data object',
    type: 'object',
    readOnly: true,
  })
  @IsNotEmpty()
  user: {
    uid: string;
    email: string;
    displayName: string;
    emailVerified: boolean;
  };
}


class ResendVerificationBody {
  @JSONSchema({
    title: 'Email Address',
    description: 'Email address of the user to resend verification to',
    example: 'user@example.com',
    type: 'string',
    format: 'email',
  })
  @IsEmail()
  email: string;
}

class LoginBody {
  @JSONSchema({
    title: 'Email Address',
    description: 'Email address of the user'
  })
  @IsEmail()
  email: string;

  @JSONSchema({
    title: 'Password',
    description: 'Password for account authentication',
    example:'SecureP@ssw0rd',
    minLength: 8,
    writeOnly: true
  })
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

class ForgotPasswordBody {
  @JSONSchema({
    title: 'Email Address',
    description: 'Email address to send the password reset link to',
    example: 'user@example.com',
    type: 'string',
    format: 'email',
  })
  @IsEmail()
  email: string;
}

export const AUTH_VALIDATORS = [
  SignUpBody,
  GoogleSignUpBody,
  ChangePasswordBody,
  SignUpResponse,
  VerifySignUpProviderBody,
  ChangePasswordResponse,
  TokenVerificationResponse,
  AuthErrorResponse,
  LoginBody,
  ResendVerificationBody,
  ForgotPasswordBody,
  LoginResponse,
  SyncAccountResponse,
];

export {
  SignUpBody,
  GoogleSignUpBody,
  ChangePasswordBody,
  SignUpResponse,
  VerifySignUpProviderBody,
  ChangePasswordResponse,
  TokenVerificationResponse,
  AuthErrorResponse,
  LoginBody,
  ResendVerificationBody,
  ForgotPasswordBody,
  LoginResponse,
  SyncAccountResponse,
};
