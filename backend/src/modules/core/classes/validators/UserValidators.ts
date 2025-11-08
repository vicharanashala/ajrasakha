import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {Type} from 'class-transformer';
import { NotificationRetentionType } from '#root/shared/index.js';

class PreferenceDto {
  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  crop?: string;

  @IsOptional()
  @IsString()
  domain?: string;
}

// User DTO
class UserDto {
  @IsString()
  _id: string;

  @IsString()
  userName: string;

  @IsString()
  email: string;
  
  @IsString()
  role: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PreferenceDto)
  preference: PreferenceDto;
}

// Main Response DTO
class UsersNameResponseDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PreferenceDto)
  myPreference: PreferenceDto;

  @IsArray()
  @ValidateNested({each: true})
  @Type(() => UserDto)
  users: UserDto[];
}

class NotificationDeletePreferenceDTO{
  @IsOptional()
  @IsEnum(["3d", "1w", "2w", "1m", "never"], {
    message:
      'retention must be one of the following values: 3d, 1w, 2w, 1m, never',
  })
  preference?: NotificationRetentionType;
}

export const USER_VALIDATORS = [PreferenceDto, UsersNameResponseDto, UserDto,NotificationDeletePreferenceDTO];

export {PreferenceDto, UsersNameResponseDto, UserDto,NotificationDeletePreferenceDTO};
