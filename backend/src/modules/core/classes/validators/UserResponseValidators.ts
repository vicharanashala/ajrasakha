import { IsNotEmpty, IsString, IsNumber, IsBoolean, IsArray, ValidateNested, IsOptional, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

// ─── Error Response ───────────────────────────────────────────────────────────

export class UserErrorResponse {
  @JSONSchema({
    description: 'The error message',
    example: 'User not found',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Success Message Response ─────────────────────────────────────────────────

export class UserSuccessMessageResponse {
  @JSONSchema({
    description: 'Success message',
    example: 'User updated successfully',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── User Preference ──────────────────────────────────────────────────────────

export class UserPreferenceResponse {
  @JSONSchema({
    description: 'Preferred state',
    example: 'Karnataka',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  state?: string;

  @JSONSchema({
    description: 'Preferred crop',
    example: 'Rice',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  crop?: string;

  @JSONSchema({
    description: 'Preferred domain',
    example: 'Agriculture',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  domain?: string;
}

// ─── User Entry ───────────────────────────────────────────────────────────────

export class UserEntryResponse {
  @JSONSchema({
    description: 'Unique user identifier',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  _id: string;

  @JSONSchema({
    description: 'User display name',
    example: 'john_doe',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  userName: string;

  @JSONSchema({
    description: 'User email address',
    example: 'john@example.com',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  email: string;

  @JSONSchema({
    description: 'User role',
    example: 'expert',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  role: string;

  @JSONSchema({
    description: 'User preferences',
    type: 'object',
    readOnly: true,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => UserPreferenceResponse)
  preference: UserPreferenceResponse;

  @JSONSchema({
    description: 'Whether the user is blocked',
    example: false,
    type: 'boolean',
    readOnly: true,
  })
  @IsBoolean()
  isBlocked: boolean;

  @JSONSchema({
    description: 'Whether user is in special task force',
    example: false,
    type: 'boolean',
    readOnly: true,
  })
  @IsBoolean()
  special_task_force: boolean;

  @JSONSchema({
    description: 'Whether user is a special task force moderator',
    example: false,
    type: 'boolean',
    readOnly: true,
  })
  @IsBoolean()
  special_task_force_moderator: boolean;
}

// ─── Paginated Users Response ─────────────────────────────────────────────────

export class PaginatedUsersResponse {
  @JSONSchema({
    description: 'Current user preferences',
    type: 'object',
    readOnly: true,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UserPreferenceResponse)
  myPreference?: UserPreferenceResponse;

  @JSONSchema({
    description: 'Array of users',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserEntryResponse)
  users: UserEntryResponse[];

  @JSONSchema({
    description: 'Total number of users',
    example: 100,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalUsers: number;

  @JSONSchema({
    description: 'Total number of pages',
    example: 10,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalPages: number;
}

// ─── Toggle User Role Response ──────────────────────────────────────────────────

export class ToggleUserRoleResponse {
  @JSONSchema({
    description: 'Success message',
    example: 'User promoted to moderator',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;

  @JSONSchema({
    description: 'Updated user object',
    type: 'object',
    readOnly: true,
  })
  @IsObject()
  user: any;
}

// ─── Notification Count ───────────────────────────────────────────────────────

export class UserNotificationCountResponse {
  @JSONSchema({
    description: 'Count of unread notifications',
    example: 5,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  count: number;
}

// ─── Expert Search AutoComplete Response ─────────────────────────────────────────────
export class ExpertAutoCompleteResponse {
  @JSONSchema({
    description: 'Unique user identifier',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  _id: string;

  @JSONSchema({
    description: 'User display name',
    example: 'John Doe',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  userName: string;
}

// ─── Export all validators ────────────────────────────────────────────────────

export const USER_RESPONSE_VALIDATORS = [
  UserErrorResponse,
  UserSuccessMessageResponse,
  UserPreferenceResponse,
  UserEntryResponse,
  PaginatedUsersResponse,
  ToggleUserRoleResponse,
  UserNotificationCountResponse,
  ExpertAutoCompleteResponse,
];
