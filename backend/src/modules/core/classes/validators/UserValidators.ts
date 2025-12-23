import {
  IsArray,
  isBoolean,
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

  isBlocked:boolean
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

class UpdatePenaltyAndIncentive{
  @IsEnum(['penalty','incentive'],{
    message:"type must be either penalty or incentive"
  })
  type:'penalty' | 'incentive'

  @IsString()
  userId: string;
}

class BlockUnblockBody{
  @IsString()
  action:string

  @IsOptional()
  userId:string
}
class ExpertReviewLevelDto{
  @IsOptional()
  userId:string

  
  @IsOptional()
  startTime?: string;

 
  @IsOptional()
  endTime?: string;

  @IsOptional()
  crop:string

  @IsOptional()
  season:string

  @IsOptional()
  state:string

  @IsOptional()
  district:string

  @IsOptional()
  status:string
  @IsOptional()
  domain:string
  @IsOptional()
  role:string
}

export const USER_VALIDATORS = [PreferenceDto, UsersNameResponseDto, UserDto,NotificationDeletePreferenceDTO,UpdatePenaltyAndIncentive,BlockUnblockBody];

export {PreferenceDto, UsersNameResponseDto, UserDto,NotificationDeletePreferenceDTO,UpdatePenaltyAndIncentive,BlockUnblockBody,ExpertReviewLevelDto};
