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

export const QUESTION_VALIDATORS = [
  QuestionResponse,
  AddQuestionBody,
  QuestionIdParam,
];

export {QuestionResponse, AddQuestionBody, QuestionIdParam};
