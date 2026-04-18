import { IsNotEmpty, IsString, IsNumber, IsDate, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

// ─── Error Response ───────────────────────────────────────────────────────────

export class CommentErrorResponse {
  @JSONSchema({
    description: 'The error message',
    example: 'Failed to fetch comments: Database connection error',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Comment Entry ──────────────────────────────────────────────────────────

export class CommentEntryResponse {
  @JSONSchema({
    description: 'Unique identifier for the comment',
    example: '64adf92e9e7c3b1234567892',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  _id?: string;

  @JSONSchema({
    description: 'ID of the question this comment belongs to',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  questionId: string;

  @JSONSchema({
    description: 'ID of the answer this comment belongs to',
    example: '64adf92e9e7c3b1234567891',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  answerId: string;

  @JSONSchema({
    description: 'ID of the user who created this comment',
    example: '64adf92e9e7c3b1234567893',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @JSONSchema({
    description: 'Display name of the user who created this comment',
    example: 'John Smith',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  userName?: string;

  @JSONSchema({
    description: 'The comment text content',
    example: 'This is a great answer! Thanks for sharing.',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  text: string;

  @JSONSchema({
    description: 'Timestamp when the comment was created',
    example: '2025-01-15T10:30:00.000Z',
    type: 'string',
    format: 'date-time',
    readOnly: true,
  })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  createdAt: Date;
}

// ─── Get Comments Response ──────────────────────────────────────────────────

export class GetCommentsResponse {
  @JSONSchema({
    description: 'Array of comments for the specified answer',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsNotEmpty()
  comments: CommentEntryResponse[];

  @JSONSchema({
    description: 'Total number of comments for this answer',
    example: 42,
    type: 'number',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsNumber()
  total: number;
}

// ─── Add Comment Response ───────────────────────────────────────────────────

export class AddCommentResponse {
  @JSONSchema({
    description: 'Indicates whether the comment was successfully added',
    example: true,
    type: 'boolean',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  success: boolean;
}

// ─── Export all validators ────────────────────────────────────────────────────

export const COMMENT_RESPONSE_VALIDATORS = [
  CommentErrorResponse,
  CommentEntryResponse,
  GetCommentsResponse,
  AddCommentResponse,
];
