import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsMongoId,
  IsArray,
  IsNumber,
  MinLength,
  Max,
  ValidateNested,
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';
import {ObjectId} from 'mongodb';
import {IQuestionPriority, QuestionStatus} from '#shared/interfaces/models.js';
import {Type} from 'class-transformer';

class QuestionIdParam {
  @JSONSchema({
    description: 'MongoDB ObjectId of the question',
    example: '650e9c0f5f1b2c00sdf2f4d9e',
    type: 'string',
  })
  @IsMongoId()
  questionId: string;
}
class AllocateReRouteExpertsRequest {
  @JSONSchema({
    description: 'answer Id',
    example: '650e9c0f5f1b2c00sdf2f4d9e',
    type: 'string',
  })
 
  @IsString()
  answerId: string;

  @JSONSchema({
    description: 'Expert Id',
    example: '650e9c0f5f1b2c00sdf2f4d9e',
    type: 'string',
  })
 
  @IsString()
  expertId: string;

  @JSONSchema({
    description: 'moderator Id',
    example: '650e9c0f5f1b2c00sdf2f4d9e',
    type: 'string',
  })
 
  @IsString()
  moderatorId: string;

  @JSONSchema({
    description: 'status',
    example: 'pending',
    type: 'string',
  })
 
  @IsString()
  status: string;

  @JSONSchema({
    description: 'comment',
    example: 'new answer',
    type: 'string',
  })
 
  @IsString()
  comment: string;
  
}
class UpdatedBy {
  @IsString()
  _id!: string;

  @IsString()
  userName!: string;

  // @IsString()
  // email!: string;
}

class AnswerDetails {
  @IsString()
  _id!: string;

  @IsString()
  answer!: string;

  @IsString()
  approvalCount!: string;

  @IsArray()
  @IsString({each: true})
  sources!: string[];
}
class HistoryItem {
  @ValidateNested()
  @Type(() => UpdatedBy)
  updatedBy!: UpdatedBy;

  @IsOptional()
  @ValidateNested()
  @Type(() => AnswerDetails)
  answer?: AnswerDetails;

  @IsOptional()
  @IsEnum(['approved', 'rejected'])
  status?: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  reasonForRejection?: string;

  @IsOptional()
  @IsString()
  approvedAnswer?: string;

  @Type(() => Date)
  createdAt!: Date;

  @Type(() => Date)
  updatedAt!: Date;
}
class QuestionDetailsDto {
  @IsString()
  state!: string;

  @IsString()
  district!: string;

  @IsString()
  crop!: string;

  @IsString()
  season!: string;

  @IsString()
  domain!: string;
}
class QuestionResponse {
  @IsString()
  id!: string;

  @IsString()
  text!: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  priority?: IQuestionPriority;

  @IsString()
  createdAt!: string;

  @IsString()
  updatedAt!: string;

  @IsNumber()
  totalAnswersCount!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionDetailsDto)
  details?: QuestionDetailsDto;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsEnum(['open', 'answered', 'closed'])
  status?: QuestionStatus;

  @IsEnum(['AJRASAKHA', 'AGRI_EXPERT'])
  source!: 'AJRASAKHA' | 'AGRI_EXPERT';

  @IsOptional()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => Object)
  currentAnswers?: {answer: string; id: string; isFinalAnswer: boolean}[];

  @IsOptional()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => HistoryItem)
  history?: HistoryItem[];
}
class GetDetailedQuestionsQuery {
  @JSONSchema({description: 'Search term', example: 'wheat', type: 'string'})
  @IsOptional()
  @IsString()
  search?: string;

  @JSONSchema({
    description: 'Question status filter',
    example: 'OPEN',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @JSONSchema({
    description: 'Source filter',
    example: 'AGRI_EXPERT',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @JSONSchema({
    description: 'State/region filter',
    example: 'Karnataka',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  state?: string;

  @JSONSchema({
    description: 'Priority filter',
    example: 'high',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  priority?: string;

  @JSONSchema({description: 'Crop filter', example: 'Wheat', type: 'string'})
  @IsOptional()
  @IsString()
  crop?: string;

  @JSONSchema({
    description: 'Domain filter',
    example: 'Agriculture',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  domain?: string;

  @JSONSchema({
    description: 'Filter based on userId',
    example: '1234567890',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  user?: string;

  @JSONSchema({
    description: 'Minimum number of answers',
    example: 0,
    type: 'number',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  answersCountMin?: number;

  @JSONSchema({
    description: 'Maximum number of answers',
    example: 100,
    type: 'number',
  })
  @IsOptional()
  @IsInt()
  @Max(1000)
  answersCountMax?: number;

  @JSONSchema({
    description: 'Basic filter options',
    example: 'newest',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  filter?: 'newest' | 'oldest' | 'leastResponses' | 'mostResponses';

  @JSONSchema({
    description: 'Date range filter',
    example: 'week',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  dateRange?: string;

  @JSONSchema({
    description: 'Page number for pagination',
    example: 1,
    type: 'number',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @JSONSchema({description: 'Items per page', example: 10, type: 'number'})
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @JSONSchema({
    description: 'Start time for custom date range filter',
    example: '2025-11-12T18:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsOptional()
  startTime?: string;

  @JSONSchema({
    description: 'End time for custom date range filter',
    example: '2025-11-27T18:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsOptional()
  endTime?: string;

  @JSONSchema({
    description: 'Review Level filter',
    example: 'Level 1',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  review_level?: string;
}
export const QUESTION_VALIDATORS = [
 
  QuestionIdParam,
  AllocateReRouteExpertsRequest,
  QuestionResponse,
  GetDetailedQuestionsQuery
];

export{QuestionIdParam,AllocateReRouteExpertsRequest,QuestionResponse,GetDetailedQuestionsQuery}