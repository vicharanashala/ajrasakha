import { Expose, Type } from 'class-transformer';
import { IsString, IsEmail, IsBoolean, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { UserResponseDto } from '#root/modules/user/dtos/UserResponseDto.js';

export class SignUpResponseDto {
  @Expose()
  @IsString()
  uid: string;

  @Expose()
  @IsEmail()
  email: string;

  @Expose()
  @IsString()
  firstName: string;

  @Expose()
  @IsString()
  lastName: string;
}

export class LoginResponseDto {
  @Expose()
  @IsString()
  idToken: string;

  @Expose()
  @IsString()
  refreshToken: string;

  @Expose()
  @Type(() => Number)
  @IsNumber()
  expiresIn: number;

  @Expose()
  @IsString()
  localId: string;

  @Expose()
  @IsEmail()
  email: string;

  @Expose()
  @IsOptional()
  @IsString()
  displayName?: string;

  @Expose()
  @IsBoolean()
  emailVerified: boolean;
}

export class SyncAccountResponseDto {
  @Expose()
  @IsBoolean()
  success: boolean;

  @Expose()
  @Type(() => UserResponseDto)
  @ValidateNested()
  user: UserResponseDto;
}

export class AuthMessageResponseDto {
  @Expose()
  @IsBoolean()
  success: boolean;

  @Expose()
  @IsString()
  message: string;
}
