import { IsNotEmpty, IsString, IsNumber, IsBoolean, IsArray, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

// ─── Error Response ───────────────────────────────────────────────────────────

export class RequestErrorResponse {
  @JSONSchema({
    description: 'The error message',
    example: 'Request not found',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Request Response Entry (IRequestResponse) ──────────────────────────────────

export class RequestResponseEntry {
  @JSONSchema({
    description: 'User ID who reviewed the request',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  reviewedBy: string;

  @JSONSchema({
    description: 'Role of the reviewer',
    example: 'moderator',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  role: string;

  @JSONSchema({
    description: 'Status of the review',
    example: 'approved',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  status: string;

  @JSONSchema({
    description: 'Response message from the reviewer',
    example: 'The flag has been reviewed and approved.',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  response?: string;

  @JSONSchema({
    description: 'Timestamp when the review was completed',
    example: '2025-01-15T10:30:00Z',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  reviewedAt?: string;

  @JSONSchema({
    description: 'Name of the reviewer',
    example: 'John Doe',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  reviewerName?: string;
}

// ─── Request Entry (IRequest) ─────────────────────────────────────────────────

export class RequestEntryResponse {
  @JSONSchema({
    description: 'Unique request identifier',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  _id?: string;

  @JSONSchema({
    description: 'Reason for the request',
    example: 'Question contains incorrect information',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  reason: string;

  @JSONSchema({
    description: 'User ID who created the request',
    example: '64adf92e9e7c3b1234567891',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  requestedBy: string;

  @JSONSchema({
    description: 'Entity ID associated with the request',
    example: '64adf92e9e7c3b1234567892',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  entityId: string;

  @JSONSchema({
    description: 'Array of responses to the request',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequestResponseEntry)
  responses: RequestResponseEntry[];

  @JSONSchema({
    description: 'Current status of the request',
    example: 'pending',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  status: string;

  @JSONSchema({
    description: 'Type of request',
    example: 'question_flag',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  requestType: string;

  @JSONSchema({
    description: 'Details of the request (varies by requestType)',
    type: 'object',
    readOnly: true,
  })
  @IsOptional()
  @IsObject()
  details?: any;

  @JSONSchema({
    description: 'Whether the request has been soft deleted',
    example: false,
    type: 'boolean',
    readOnly: true,
  })
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;

  @JSONSchema({
    description: 'Timestamp when the request was created',
    example: '2025-01-15T10:00:00Z',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  createdAt?: string;

  @JSONSchema({
    description: 'Timestamp when the request was last updated',
    example: '2025-01-15T10:00:00Z',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  updatedAt?: string;
}

// ─── Paginated Requests Response ──────────────────────────────────────────────

export class PaginatedRequestsResponse {
  @JSONSchema({
    description: 'Array of requests',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequestEntryResponse)
  requests: RequestEntryResponse[];

  @JSONSchema({
    description: 'Total number of pages',
    example: 5,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalPages: number;

  @JSONSchema({
    description: 'Total number of requests matching the query',
    example: 50,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalCount: number;
}

// ─── Request Diff Response ────────────────────────────────────────────────────

export class RequestDiffResponse {
  @JSONSchema({
    description: 'Current document with proposed changes applied',
    type: 'object',
    readOnly: true,
  })
  @IsObject()
  currentDoc: any;

  @JSONSchema({
    description: 'Existing document without changes',
    type: 'object',
    readOnly: true,
  })
  @IsObject()
  existingDoc: any;

  @JSONSchema({
    description: 'Array of responses to the request',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequestResponseEntry)
  responses: RequestResponseEntry[];
}

// ─── Request Create Response (IRequest) ─────────────────────────────────────────

export class RequestCreateResponse {
  @JSONSchema({
    description: 'Unique request identifier',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  _id?: string;

  @JSONSchema({
    description: 'Reason for the request',
    example: 'Question contains incorrect information',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  reason: string;

  @JSONSchema({
    description: 'User ID who created the request',
    example: '64adf92e9e7c3b1234567891',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  requestedBy: string;

  @JSONSchema({
    description: 'Entity ID associated with the request',
    example: '64adf92e9e7c3b1234567892',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  entityId: string;

  @JSONSchema({
    description: 'Array of responses to the request',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  responses: any[];

  @JSONSchema({
    description: 'Current status of the request',
    example: 'pending',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  status: string;

  @JSONSchema({
    description: 'Type of request',
    example: 'question_flag',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  requestType: string;

  @JSONSchema({
    description: 'Timestamp when the request was created',
    example: '2025-01-15T10:00:00Z',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  createdAt?: string;
}

// ─── Request Status Update Response (IRequestResponse) ─────────────────────────

export class RequestStatusUpdateResponse {
  @JSONSchema({
    description: 'User ID who reviewed the request',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  reviewedBy: string;

  @JSONSchema({
    description: 'Role of the reviewer',
    example: 'moderator',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  role: string;

  @JSONSchema({
    description: 'Status of the review',
    example: 'approved',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  status: string;

  @JSONSchema({
    description: 'Response message from the reviewer',
    example: 'The flag has been reviewed and approved.',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  response?: string;

  @JSONSchema({
    description: 'Timestamp when the review was completed',
    example: '2025-01-15T10:30:00Z',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  reviewedAt?: string;

  @JSONSchema({
    description: 'Name of the reviewer',
    example: 'John Doe',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  reviewerName?: string;
}

// ─── Export all validators ────────────────────────────────────────────────────

export const REQUEST_RESPONSE_VALIDATORS = [
  RequestErrorResponse,
  RequestResponseEntry,
  RequestEntryResponse,
  PaginatedRequestsResponse,
  RequestDiffResponse,
  RequestCreateResponse,
  RequestStatusUpdateResponse,
];
