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
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';
import {ObjectId} from 'mongodb';
import {QuestionStatus} from '#shared/interfaces/models.js';

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
    description: 'Context (transcript) reference ID',
    example: '64adf92e9e7c3b0987654321',
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

class QuestionResponse {
  @IsString()
  id!: string;

  @IsString()
  text!: string;

  @IsString()
  createdAt!: string;

  @IsString()
  updatedAt!: string;

  @IsNumber()
  totalAnwersCount!: number;

  @IsArray()
  @IsString({each: true})
  currentAnswers?: {answer: string; id: string; isFinalAnswer: boolean}[];
}

class GenerateQuestionsBody {
  @IsString()
  @MinLength(10)
  transcript!: string;
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
    example: "newest",
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
}
export const QUESTION_VALIDATORS = [
  QuestionResponse,
  AddQuestionBody,
  QuestionIdParam,
  GenerateQuestionsBody,
  GetDetailedQuestionsQuery,
];

export {
  QuestionResponse,
  AddQuestionBody,
  QuestionIdParam,
  GenerateQuestionsBody,
  GeneratedQuestionResponse,
  GetDetailedQuestionsQuery,
};
