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
  ArrayNotEmpty,
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';
import {ObjectId} from 'mongodb';
import {IQuestionPriority, QuestionStatus} from '#shared/interfaces/models.js';
import {Type} from 'class-transformer';

class AddQuestionBody {
  @JSONSchema({
    description: 'ID of the user asking the question',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  userId: string | ObjectId;

  @JSONSchema({
    description: 'The question text',
    example:
      'What is the difference between supervised and unsupervised learning?',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  question: string;

  @JSONSchema({
    description: 'Context (transcript)/ reference ',
    example: 'example text',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  context: string | ObjectId;
}

// class QuestionResponse {
//   @JSONSchema({
//     description: 'Unique question identifier',
//     example: '64adf92e9e7c3b1234567890',
//     type: 'string',
//   })
//   _id: string;

//   @JSONSchema({
//     description: 'The actual question text',
//     example: 'Explain closures in JavaScript',
//     type: 'string',
//   })
//   question: string;

//   @JSONSchema({
//     description: 'Total number of answers for the question',
//     example: 3,
//     type: 'integer',
//   })
//   @IsInt()
//   @Min(0)
//   totalAnwersCount: number;
// }

class QuestionIdParam {
  @JSONSchema({
    description: 'MongoDB ObjectId of the question',
    example: '650e9c0f5f1b2c00sdf2f4d9e',
    type: 'string',
  })
  @IsMongoId()
  questionId: string;
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

// class QuestionResponse {
//   @IsString()
//   id!: string;

//   @IsString()
//   text!: string;

//   @IsString()
//   priority?: string;

//   @IsString()
//   createdAt!: string;

//   @IsString()
//   updatedAt!: string;

//   @IsNumber()
//   totalAnwersCount!: number;

//   @IsArray()
//   @IsString({each: true})
//   currentAnswers?: {answer: string; id: string; isFinalAnswer: boolean}[];
// }

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

  @IsOptional()
  @IsString()
  context?: string;
}
class AddQuestionBodyDto {
  @IsString()
  @IsOptional()
  question!: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  priority!: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsEnum(['AJRASAKHA', 'AGRI_EXPERT'])
  source!: 'AJRASAKHA' | 'AGRI_EXPERT';

  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionDetailsDto)
  details?: QuestionDetailsDto;

  @IsString()
  @IsOptional()
  context?: string;

  @IsString()
  @IsOptional()
  aiInitialAnswer?: string;

  @IsString()
  @IsOptional()
  createdAt?: string;
}

class GenerateQuestionsBody {
  @IsString()
  @MinLength(10)
  transcript!: string;
}
class ExpertInput {
  @IsString()
  _id!: string;

  @IsString()
  userName!: string;
}

class AllocateExpertsRequest {
  experts!: string[];
}
class RemoveAllocateBody {
  @IsNumber()
  index!: number;
}
class GeneratedQuestionResponse {
  @IsString()
  id!: string;

  @IsString()
  question!: string;

  @IsString()
  agri_specialist!: string;

  @IsString()
  answer!: string;
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

  @JSONSchema({
    description: 'Start time for closedAt date range filter',
    example: '2025-11-12T18:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsOptional()
  closedAtStart?: string;

  @JSONSchema({
    description: 'End time for closedAt date range filter',
    example: '2025-11-27T18:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsOptional()
  closedAtEnd?: string;

  @JSONSchema({
    description: 'consecutive approvals',
    example: '1',
    type: 'string',

  })
  @IsOptional()
  consecutiveApprovals?: string;
}

export interface IQuestionWithAnswerTexts {
  question_id: string;
  question_text: string;
  answers: string[];
}

export interface IQuestionAnalysis {
  question_id: string;
  num_answers: number;
  mean_similarity: number;
  std_similarity: number;
  recent_similarity: number;
  collusion_score: number;
  status: 'CONTINUE' | 'FLAGGED_FOR_REVIEW' | 'CONVERGED';
  message: string;
}

class BulkDeleteQuestionDto {
  questionIds: string[];
}

export const QUESTION_VALIDATORS = [
  QuestionResponse,
  AddQuestionBody,
  QuestionIdParam,
  GenerateQuestionsBody,
  GetDetailedQuestionsQuery,
  AddQuestionBodyDto,
  AllocateExpertsRequest,
  ExpertInput,
  RemoveAllocateBody,
  UpdatedBy,
  HistoryItem,
  BulkDeleteQuestionDto
];

export {
  QuestionResponse,
  AddQuestionBody,
  QuestionIdParam,
  GenerateQuestionsBody,
  GeneratedQuestionResponse,
  GetDetailedQuestionsQuery,
  AddQuestionBodyDto,
  AllocateExpertsRequest,
  ExpertInput,
  RemoveAllocateBody,
  UpdatedBy,
  HistoryItem,
  BulkDeleteQuestionDto
};
