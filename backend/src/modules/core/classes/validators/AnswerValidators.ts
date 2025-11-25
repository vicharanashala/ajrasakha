import {Expose, Type} from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  IsMongoId,
  ValidateNested,
  IsArray,
  ArrayNotEmpty,
  IsUrl,
  ValidateIf,
  IsIn,
  IsOptional,
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';

class SourceItem {
  @JSONSchema({
    description: 'Source URL for the answer',
    example: 'https://example.com',
    format: 'uri',
  })
  @IsString()
  source: string;

  @JSONSchema({
    description: 'Page number of the source reference',
    example: 12,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}
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

  @JSONSchema({
    description: 'List of sources with page numbers',
    example: [
      {source: 'https://example.com', page: 1},
      {source: 'https://docs.example.com', page: 5},
    ],
    type: 'array',
    items: {$ref: '#/definitions/SourceItem'},
  })
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => SourceItem)
  sources: SourceItem[];
}
// class AddAnswerBody {
//   @JSONSchema({
//     description: 'ID of the question being answered',
//     example: '64adf92e9e7c3b1234567890',
//     type: 'string',
//   })
//   @IsNotEmpty()
//   @IsString()
//   questionId: string;

//   @JSONSchema({
//     description: 'Answer text',
//     example:
//       'The main difference is that supervised learning uses labeled data.',
//     type: 'string',
//   })
//   @IsNotEmpty()
//   @IsString()
//   answer: string;

//   @JSONSchema({
//     description: 'Source URLs for the answer',
//     example: ['https://example.com', 'https://docs.example.com'],
//     type: 'array',
//     items: {type: 'string', format: 'uri'},
//   })
//   @IsArray()
//   @ArrayNotEmpty()
//   @IsString({each: true})
//   // @IsUrl({}, {each: true})
//   sources: string[];
// }

export class ReviewParametersDto {
  @IsBoolean()
  @IsNotEmpty()
  contextRelevance!: boolean;

  @IsBoolean()
  @IsNotEmpty()
  technicalAccuracy!: boolean;

  @IsBoolean()
  @IsNotEmpty()
  practicalUtility!: boolean;

  @IsBoolean()
  @IsNotEmpty()
  valueInsight!: boolean;

  @IsBoolean()
  @IsNotEmpty()
  credibilityTrust!: boolean;

  @IsBoolean()
  @IsNotEmpty()
  readabilityCommunication!: boolean;
}

class ReviewAnswerBody {
  @JSONSchema({
    description: 'ID of the question being answered',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  questionId!: string;

  @JSONSchema({
    description: 'Status of the review (accepted, rejected, or modified)',
    example: 'accepted',
    enum: ['accepted', 'rejected', 'modified'],
  })
  @ValidateIf(o => o.status !== undefined)
  @IsIn(['accepted', 'rejected', 'modified'])
  status?: 'accepted' | 'rejected' | 'modified';

  @ValidateIf(o => o.status === 'rejected' || o.status === undefined)
  @IsNotEmpty()
  @IsString()
  @JSONSchema({
    description:
      'Answer text (required if status = rejected or status is not provided)',
    example:
      'The main difference is that supervised learning uses labeled data.',
  })
  answer?: string;

  @ValidateIf(o => o.status === 'rejected' || o.status === undefined)
  @JSONSchema({
    description: 'List of sources with page numbers',
    example: [
      {source: 'https://example.com', page: 1},
      {source: 'https://docs.example.com', page: 5},
    ],
    type: 'array',
    items: {$ref: '#/definitions/SourceItem'},
  })
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => SourceItem)
  sources: SourceItem[];

  @ValidateIf(o => o.status === 'accepted')
  @IsNotEmpty()
  @IsString()
  @JSONSchema({
    description: 'Approved answer ID (required only if status = accepted)',
    example: '652ef12345abcf7890123456',
  })
  approvedAnswer?: string;

  @ValidateIf(o => o.status === 'rejected')
  @IsNotEmpty()
  @IsString()
  @JSONSchema({
    description: 'Approved answer ID (required only if status = accepted)',
    example: '652ef12345abcf7890123456',
  })
  rejectedAnswer?: string;

  @ValidateIf(o => o.status === 'rejected')
  @IsNotEmpty()
  @IsString()
  @JSONSchema({
    description: 'Reason for rejection (required only if status = rejected)',
    example: 'Insufficient factual accuracy and poor structure.',
  })
  reasonForRejection?: string;

  @ValidateIf(o => o.status === 'modified')
  @IsNotEmpty()
  @IsString()
  @JSONSchema({
    description:
      'ID of the answer that is being modified (required only when status = modified)',
    example: '67b1f3d8c45a9e12f3a9d02b',
  })
  modifiedAnswer?: string;
  
  @ValidateIf(o => o.status === 'rejected' || o.status === undefined)
  @IsNotEmpty()
  @IsString()
  @JSONSchema({
    description: 'Remarks are required when status is rejected or not provided',
    example: 'Reason or additional comments...',
  })
  remarks?: string;

  @ValidateIf(o => o.status === 'modified')
  @IsNotEmpty()
  @IsString()
  @JSONSchema({
    description:
      'Reason explaining why this answer requires modification (required only when status = modified)',
    example:
      'The answer contains outdated information and needs to be updated for accuracy.',
  })
  reasonForModification?: string;

  @ValidateIf(o => o.status !== undefined)
  @ValidateNested()
  @Type(() => ReviewParametersDto)
  parameters!: ReviewParametersDto;
}

// class ReviewAnswerBody {
//   @JSONSchema({
//     description: 'ID of the question being answered',
//     example: '64adf92e9e7c3b1234567890',
//     type: 'string',
//   })
//   @IsNotEmpty()
//   @IsString()
//   questionId!: string;

//   @JSONSchema({
//     description: 'Status of the review (accepted, rejected, or undefined)',
//     example: 'accepted',
//     enum: ['accepted', 'rejected'],
//   })
//   @ValidateIf(o => o.status !== undefined)
//   @IsIn(['accepted', 'rejected'])
//   status?: 'accepted' | 'rejected';

//   @ValidateIf(o => o.status === 'rejected' || o.status === undefined)
//   @IsNotEmpty()
//   @IsString()
//   @JSONSchema({
//     description:
//       'Answer text (required if status = rejected or status is not provided)',
//     example:
//       'The main difference is that supervised learning uses labeled data.',
//   })
//   answer?: string;

//   @ValidateIf(o => o.status === 'rejected' || o.status === undefined)
//   @IsArray()
//   @ArrayNotEmpty()
//   @IsString({each: true})
//   @JSONSchema({
//     description:
//       'Source URLs for the answer (required if status = rejected or status is not provided)',
//     example: ['https://example.com', 'https://docs.example.com'],
//   })
//   sources?: string[];

//   @ValidateIf(o => o.status === 'accepted')
//   @IsNotEmpty()
//   @IsString()
//   @JSONSchema({
//     description: 'Approved answer ID (required only if status = accepted)',
//     example: '652ef12345abcf7890123456',
//   })
//   approvedAnswer?: string;

//   @ValidateIf(o => o.status === 'rejected')
//   @IsNotEmpty()
//   @IsString()
//   @JSONSchema({
//     description: 'Approved answer ID (required only if status = accepted)',
//     example: '652ef12345abcf7890123456',
//   })
//   rejectedAnswer?: string;

//   @ValidateIf(o => o.status === 'rejected')
//   @IsNotEmpty()
//   @IsString()
//   @JSONSchema({
//     description: 'Reason for rejection (required only if status = rejected)',
//     example: 'Insufficient factual accuracy and poor structure.',
//   })
//   reasonForRejection?: string;
// }

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
    description: 'Answer status',
    example: 'in-review',
    type: 'string',
  })
  @IsOptional()
  @IsIn(['in-review', 'approved', 'rejected', 'pending-with-moderator'])
  status?: 'in-review' | 'approved' | 'rejected' | 'pending-with-moderator' =
    'in-review';

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
    description: 'Answer status',
    example: 'in-review',
    type: 'string',
  })
  @IsOptional()
  @IsIn(['in-review', 'approved', 'rejected', 'pending-with-moderator'])
  status?: 'in-review' | 'approved' | 'rejected' | 'pending-with-moderator' =
    'in-review';

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
  ReviewAnswerBody,
];

export {
  AddAnswerBody,
  AnswerResponse,
  AnswerIdParam,
  DeleteAnswerParams,
  UpdateAnswerBody,
  SubmissionResponse,
  ReviewAnswerBody,
};
