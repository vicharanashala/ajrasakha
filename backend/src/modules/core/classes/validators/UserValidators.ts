import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {Type} from 'class-transformer';

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

export const USER_VALIDATORS = [PreferenceDto, UsersNameResponseDto, UserDto];

export {PreferenceDto, UsersNameResponseDto, UserDto};
