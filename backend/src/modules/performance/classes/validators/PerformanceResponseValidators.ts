import { IsNotEmpty, IsString, IsNumber, IsBoolean, IsArray, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

// ─── Error Response ───────────────────────────────────────────────────────────

export class PerformanceErrorResponse {
  @JSONSchema({
    description: 'The error message',
    example: 'Failed to fetch performance data',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Workload Response ────────────────────────────────────────────────────────

export class WorkloadResponse {
  @JSONSchema({
    description: 'Number of answers by current user',
    example: 15,
    type: 'number',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsNumber()
  currentUserAnswersCount: number;

  @JSONSchema({
    description: 'Total number of questions',
    example: 100,
    type: 'number',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsNumber()
  totalQuestionsCount: number;

  @JSONSchema({
    description: 'Total number of questions in review',
    example: 20,
    type: 'number',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsNumber()
  totalInreviewQuestionsCount: number;
}

// ─── Reviewer Heatmap Row ─────────────────────────────────────────────────────

export class ReviewerHeatmapRowResponse {
  @JSONSchema({
    description: 'Reviewer user ID',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  reviewerId: string;

  @JSONSchema({
    description: 'Reviewer display name',
    example: 'John Doe',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  reviewerName: string;

  @JSONSchema({
    description: 'Counts of reviews by date',
    example: { '2025-01-15': 5, '2025-01-16': 3 },
    type: 'object',
    readOnly: true,
  })
  @IsObject()
  counts: Record<string, number>;
}

// ─── Reviewer Heatmap Response ─────────────────────────────────────────────────

export class ReviewerHeatmapResponse {
  @JSONSchema({
    description: 'Array of reviewer heatmap data',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewerHeatmapRowResponse)
  data: ReviewerHeatmapRowResponse[];

  @JSONSchema({
    description: 'Total number of reviewers',
    example: 10,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  total: number;
}

// ─── Check-in Response ────────────────────────────────────────────────────────

export class CheckInResponse {
  @JSONSchema({
    description: 'Success status indicator',
    example: true,
    type: 'boolean',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  success: boolean;

  @JSONSchema({
    description: 'Last check-in timestamp',
    example: '2025-01-15T10:30:00.000Z',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  lastCheckInAt: string;
}

// ─── Cron Snapshot Report Response ──────────────────────────────────────────

export class CronSnapshotReportResponse {
  @JSONSchema({
    description: 'Success message',
    example: 'Cron snapshot report email sent successfully.',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Level Report Error Response ────────────────────────────────────────────

export class LevelReportErrorResponse {
  @JSONSchema({
    description: 'Success status indicator',
    example: false,
    type: 'boolean',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  success: boolean;

  @JSONSchema({
    description: 'Error message',
    example: 'startDate and endDate are required',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Export all validators ────────────────────────────────────────────────────

export const PERFORMANCE_RESPONSE_VALIDATORS = [
  PerformanceErrorResponse,
  WorkloadResponse,
  ReviewerHeatmapRowResponse,
  ReviewerHeatmapResponse,
  CheckInResponse,
  CronSnapshotReportResponse,
  LevelReportErrorResponse,
];
