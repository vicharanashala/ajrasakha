import { IsNotEmpty, IsString, IsNumber, IsBoolean, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

// ─── Error Response ───────────────────────────────────────────────────────────

export class NotificationErrorResponse {
  @JSONSchema({
    description: 'The error message',
    example: 'Failed to fetch notifications',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Inserted ID Response ────────────────────────────────────────────────────

export class InsertedIdResponse {
  @JSONSchema({
    description: 'Unique identifier of the created resource',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  insertedId: string;
}

// ─── Deleted Count Response ───────────────────────────────────────────────────

export class DeletedCountResponse {
  @JSONSchema({
    description: 'Number of documents deleted',
    example: 1,
    type: 'number',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsNumber()
  deletedCount: number;
}

// ─── Modified Count Response ──────────────────────────────────────────────────

export class ModifiedCountResponse {
  @JSONSchema({
    description: 'Number of documents modified',
    example: 5,
    type: 'number',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsNumber()
  modifiedCount: number;
}

// ─── Notification Entry ───────────────────────────────────────────────────────

export class NotificationEntryResponse {
  @JSONSchema({
    description: 'Unique notification identifier',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  _id: string;

  @JSONSchema({
    description: 'ID of the related entity',
    example: '64adf92e9e7c3b1234567891',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  enitity_id: string;

  @JSONSchema({
    description: 'Notification message text',
    example: 'A new question has been assigned to you',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  message: string;

  @JSONSchema({
    description: 'Notification title',
    example: 'New Question Assigned',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  title: string;

  @JSONSchema({
    description: 'Type of notification',
    example: 'answer_creation',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  type: string;

  @JSONSchema({
    description: 'Whether the notification has been read',
    example: false,
    type: 'boolean',
    readOnly: true,
  })
  @IsBoolean()
  is_read: boolean;

  @JSONSchema({
    description: 'Timestamp when notification was created',
    example: '2025-01-15T10:30:00Z',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  createdAt: string;
}

// ─── Paginated Notifications Response ─────────────────────────────────────────

export class PaginatedNotificationsResponse {
  @JSONSchema({
    description: 'Array of notifications',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationEntryResponse)
  notifications: NotificationEntryResponse[];

  @JSONSchema({
    description: 'Current page number',
    example: 1,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  page: number;

  @JSONSchema({
    description: 'Total number of notifications',
    example: 50,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalCount: number;

  @JSONSchema({
    description: 'Total number of pages',
    example: 5,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalPages: number;
}

// ─── Success Message Response ─────────────────────────────────────────────────

export class SuccessMessageResponse {
  @JSONSchema({
    description: 'Success message',
    example: 'Operation completed successfully',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Export all validators ────────────────────────────────────────────────────

export const NOTIFICATION_RESPONSE_VALIDATORS = [
  NotificationErrorResponse,
  InsertedIdResponse,
  DeletedCountResponse,
  ModifiedCountResponse,
  NotificationEntryResponse,
  PaginatedNotificationsResponse,
  SuccessMessageResponse,
];
