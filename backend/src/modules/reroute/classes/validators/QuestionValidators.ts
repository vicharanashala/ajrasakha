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
export const QUESTION_VALIDATORS = [
 
  QuestionIdParam,
  AllocateReRouteExpertsRequest
];

export{QuestionIdParam,AllocateReRouteExpertsRequest}