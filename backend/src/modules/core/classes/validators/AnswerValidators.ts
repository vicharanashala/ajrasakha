import {Expose} from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  IsMongoId,
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
];

export {
  AddAnswerBody,
  AnswerResponse,
  AnswerIdParam,
  DeleteAnswerParams,
  UpdateAnswerBody,
};
