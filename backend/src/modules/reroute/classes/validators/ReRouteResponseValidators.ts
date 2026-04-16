import { IsNotEmpty, IsString, IsNumber, IsBoolean, IsArray, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

// ─── Error Response ───────────────────────────────────────────────────────────

export class ReRouteErrorResponse {
  @JSONSchema({
    description: 'The error message',
    example: 'Failed to allocate expert',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Success Message Response ─────────────────────────────────────────────────

export class ReRouteSuccessResponse {
  @JSONSchema({
    description: 'Success message',
    example: 'Re routed successfully',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Reject Request Response ──────────────────────────────────────────────────

export class RejectRequestResponse {
  @JSONSchema({
    description: 'Success message after rejection',
    example: 'Rejected the request successfully',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Reroute History Entry ────────────────────────────────────────────────────

export class RerouteHistoryEntry {
  @JSONSchema({
    description: 'Moderator ID who rerouted',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  reroutedBy: string;

  @JSONSchema({
    description: 'Expert ID who was assigned',
    example: '64adf92e9e7c3b1234567891',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  reroutedTo: string;

  @JSONSchema({
    description: 'Timestamp when rerouted',
    example: '2025-01-15T10:30:00Z',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  reroutedAt: string;

  @JSONSchema({
    description: 'Answer ID associated with the reroute',
    example: '64adf92e9e7c3b1234567892',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  answerId?: string;

  @JSONSchema({
    description: 'Current status of the reroute',
    example: 'pending',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  status: string;

  @JSONSchema({
    description: 'Moderator rejection reason',
    example: 'Expert not available',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  moderatorRejectionReason?: string;

  @JSONSchema({
    description: 'Expert rejection reason',
    example: 'Cannot answer this question',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @JSONSchema({
    description: 'Comment from moderator',
    example: 'Please review this answer',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  comment?: string;

  @JSONSchema({
    description: 'Last updated timestamp',
    example: '2025-01-15T10:30:00Z',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  updatedAt: string;
}

// ─── Reroute History Array Response ───────────────────────────────────────────

export class RerouteHistoryArrayResponse {
  @JSONSchema({
    description: 'Array of reroute history entries',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RerouteHistoryEntry)
  history: RerouteHistoryEntry[];
}

// ─── Allocated Question Entry ───────────────────────────────────────────────

export class AllocatedQuestionEntry {
  @JSONSchema({
    description: 'Question ID',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  _id: string;

  @JSONSchema({
    description: 'Question text',
    example: 'What is the best fertilizer for rice?',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  question: string;

  @JSONSchema({
    description: 'Question status',
    example: 're-routed',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  status: string;

  @JSONSchema({
    description: 'Question priority',
    example: 'high',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  priority: string;

  @JSONSchema({
    description: 'Question source',
    example: 'AGRI_EXPERT',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  source: string;

  @JSONSchema({
    description: 'Total answers count',
    example: 3,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalAnswersCount: number;

  @JSONSchema({
    description: 'Timestamp when question was created',
    example: '2025-01-15T10:00:00Z',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  createdAt?: string;
}

// ─── Allocated Questions Array Response ─────────────────────────────────────

export class AllocatedQuestionsArrayResponse {
  @JSONSchema({
    description: 'Array of allocated questions',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  questions: any[];
}

// ─── Question Details DTO ─────────────────────────────────────────────────────

export class QuestionDetailsDto {
  @JSONSchema({
    description: 'State name',
    example: 'Karnataka',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  state?: string;

  @JSONSchema({
    description: 'District name',
    example: 'Bangalore',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  district?: string;

  @JSONSchema({
    description: 'Crop name',
    example: 'Rice',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  crop?: string;

  @JSONSchema({
    description: 'Season name',
    example: 'Kharif',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  season?: string;

  @JSONSchema({
    description: 'Domain name',
    example: 'Agriculture',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  domain?: string;
}

// ─── Question By ID Response ────────────────────────────────────────────────

export class QuestionByIdResponse {
  @JSONSchema({
    description: 'Question ID',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  id: string;

  @JSONSchema({
    description: 'Question text',
    example: 'What is the best fertilizer for rice?',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  text: string;

  @JSONSchema({
    description: 'Question source',
    example: 'AGRI_EXPERT',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  source: string;

  @JSONSchema({
    description: 'Question details (state, district, crop, etc.)',
    type: 'object',
    readOnly: true,
  })
  @IsOptional()
  @IsObject()
  details?: any;

  @JSONSchema({
    description: 'Question status',
    example: 're-routed',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  status: string;

  @JSONSchema({
    description: 'Question priority',
    example: 'high',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  priority: string;

  @JSONSchema({
    description: 'AI initial answer (empty for re-route)',
    example: '',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  aiInitialAnswer: string;

  @JSONSchema({
    description: 'Timestamp when question was created',
    example: '15/01/2025, 10:00:00 AM',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  createdAt: string;

  @JSONSchema({
    description: 'Timestamp when question was last updated',
    example: '15/01/2025, 10:30:00 AM',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  updatedAt: string;

  @JSONSchema({
    description: 'Total number of answers',
    example: 3,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalAnswersCount: number;

  @JSONSchema({
    description: 'Reroute history for the question',
    type: 'object',
    readOnly: true,
  })
  @IsOptional()
  @IsObject()
  history?: any;
}

// ─── Export all validators ────────────────────────────────────────────────────

export const REROUTE_RESPONSE_VALIDATORS = [
  ReRouteErrorResponse,
  ReRouteSuccessResponse,
  RejectRequestResponse,
  RerouteHistoryEntry,
  RerouteHistoryArrayResponse,
  AllocatedQuestionEntry,
  AllocatedQuestionsArrayResponse,
  QuestionDetailsDto,
  QuestionByIdResponse,
];
