import {Expose, Type} from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  IsMongoId,
  ValidateNested,
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';

class AddAnswerBody {
  @JSONSchema({
    description: 'ID of the question being answered',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  questionId: string;

  @JSONSchema({
    description: 'Answer text',
    example:
      'The main difference is that supervised learning uses labeled data.',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  answer: string;
}

class AnswerResponse {
  @JSONSchema({
    description: 'Unique answer identifier',
    example: '64adf92e9e7c3babcdef1234',
    type: 'string',
  })
  _id: string;

  @JSONSchema({
    description: 'Iteration number of this answer',
    example: 1,
    type: 'integer',
  })
  @IsInt()
  @Min(1)
  answerIteration: number;

  @JSONSchema({
    description: 'Whether this answer is marked as final',
    example: false,
    type: 'boolean',
  })
  @IsBoolean()
  isFinalAnswer: boolean;

  @JSONSchema({
    description: 'Answer text',
    example:
      'A closure is a function with access to variables from its outer scope.',
    type: 'string',
  })
  @IsString()
  answer: string;
}

class ResponseDto {
  @JSONSchema({
    description: 'Unique answer identifier',
    example: '64adf92e9e7c3babcdef1234',
    type: 'string',
  })
  @IsString()
  id: string;

  @JSONSchema({
    description: 'Answer text',
    example: 'The capital of France is Paris.',
    type: 'string',
  })
  @IsString()
  answer: string;

  @JSONSchema({
    description: 'Whether this answer is marked as final',
    example: true,
    type: 'boolean',
  })
  @IsBoolean()
  isFinalAnswer: boolean;

  @JSONSchema({
    description: 'Answer creation timestamp',
    example: '2025-09-15T10:00:00Z',
    type: 'string',
  })
  @IsString()
  createdAt: string;
}

class SubmissionResponse {
  @JSONSchema({
    description: 'Unique question identifier',
    example: 'q1',
    type: 'string',
  })
  @IsString()
  id: string;

  @JSONSchema({
    description: 'Question text',
    example: 'What is the capital of France?',
    type: 'string',
  })
  @IsString()
  text: string;

  @JSONSchema({
    description: 'Question creation timestamp',
    example: '2025-09-10T10:00:00Z',
    type: 'string',
  })
  @IsString()
  createdAt: string;

  @JSONSchema({
    description: 'Question last updated timestamp',
    example: '2025-09-12T12:00:00Z',
    type: 'string',
  })
  @IsString()
  updatedAt: string;

  @JSONSchema({
    description: 'Total number of answers submitted for this question',
    example: 3,
    type: 'integer',
  })
  @IsInt()
  @Min(0)
  totalAnwersCount: number;

  @JSONSchema({
    description: 'The response for this question',
    type: 'object',
  })
  @ValidateNested()
  @Type(() => ResponseDto)
  reponse: ResponseDto;
}

class AnswerIdParam {
  @JSONSchema({
    description: 'MongoDB ObjectId of the question',
    example: '650e9c0f5f1b2c00sdf2f4d9e',
    type: 'string',
  })
  @IsMongoId()
  answerId: string;
}

class DeleteAnswerParams {
  @IsMongoId()
  @JSONSchema({example: '650e9c0f5f1b2c001c2f4d9e'})
  questionId: string;

  @IsMongoId()
  @JSONSchema({example: '6510a0f25f1b2c001c2f4da0'})
  answerId: string;
}

class UpdateAnswerBody {
  @Expose()
  @IsString()
  @IsNotEmpty()
  answer!: string;
}

export const ANSWER_VALIDATORS = [
  AddAnswerBody,
  AnswerResponse,
  AnswerIdParam,
  DeleteAnswerParams,
  UpdateAnswerBody,
  SubmissionResponse,
];

export {
  AddAnswerBody,
  AnswerResponse,
  AnswerIdParam,
  DeleteAnswerParams,
  UpdateAnswerBody,
  SubmissionResponse,
};
