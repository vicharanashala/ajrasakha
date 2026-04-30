import {Expose, Type} from 'class-transformer';
import {IsString, IsEmail, IsBoolean, IsNumber, IsOptional, ValidateNested, IsObject} from 'class-validator';
import {PaginationMetaDto} from '#root/shared/dtos/PaginationDto.js';

export class UserPreferenceDto {
  @Expose()
  @IsString()
  @IsOptional()
  state?: string;

  @Expose()
  @IsString()
  @IsOptional()
  crop?: string;

  @Expose()
  @IsString()
  @IsOptional()
  domain?: string;
}

export class UserResponseDto {
  @Expose()
  @IsString()
  _id: string;

  @Expose()
  @IsString()
  firstName: string;

  @Expose()
  @IsString()
  @IsOptional()
  lastName?: string;

  @Expose()
  @IsEmail()
  email: string;

  @Expose()
  @IsString()
  role: string;

  @Expose()
  @IsObject()
  @ValidateNested()
  @Type(() => UserPreferenceDto)
  @IsOptional()
  preference?: UserPreferenceDto;

  @Expose()
  @IsNumber()
  @IsOptional()
  reputation_score?: number;

  @Expose()
  @IsNumber()
  @IsOptional()
  incentive?: number;

  @Expose()
  @IsNumber()
  @IsOptional()
  penalty?: number;

  @Expose()
  @IsBoolean()
  @IsOptional()
  isBlocked?: boolean;

  @Expose()
  @IsString()
  @IsOptional()
  status?: string;

  @Expose()
  @IsBoolean()
  @IsOptional()
  special_task_force?: boolean;

  @Expose()
  @IsBoolean()
  @IsOptional()
  special_task_force_moderator?: boolean;

  @Expose()
  @IsString()
  @IsOptional()
  avatar?: string;

  @Expose()
  @IsNumber()
  @IsOptional()
  notifications?: number;

  @Expose()
  @IsString()
  @IsOptional()
  createdAt?: string | Date;

  @Expose()
  @IsNumber()
  @IsOptional()
  expertRank?: number;

  @Expose()
  @IsNumber()
  @IsOptional()
  rankPosition?: number;

  @Expose()
  @IsNumber()
  @IsOptional()
  penaltyPercentage?: number;

  @Expose()
  @IsNumber()
  @IsOptional()
  totalAnswers_Created?: number;

  @Expose()
  @IsString()
  @IsOptional()
  updatedAt?: string | Date;

  // Derived fields often used in UI
  @Expose()
  @IsString()
  @IsOptional()
  get userName(): string {
    return `${this.firstName} ${this.lastName || ''}`.trim();
  }
}

export class PaginatedUsersResponseDto {
  @Expose()
  @ValidateNested({each: true})
  @Type(() => UserResponseDto)
  users: UserResponseDto[];

  @Expose()
  @ValidateNested()
  @Type(() => PaginationMetaDto)
  meta: PaginationMetaDto;

  @Expose()
  @IsObject()
  @ValidateNested()
  @Type(() => UserPreferenceDto)
  @IsOptional()
  myPreference?: UserPreferenceDto;
}
