import {IsNotEmpty, IsString, IsOptional, IsInt, Min} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';
import {Type} from 'class-transformer';

class GetCommentsParams {
  @JSONSchema({
    description: 'ID of the question',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  questionId: string;

  @JSONSchema({
    description: 'ID of the answer',
    example: '64adf92e9e7c3b1234567891',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  answerId: string;
}

class GetCommentsQuery {
  @JSONSchema({
    description: 'Page number for pagination',
    example: 1,
    type: 'number',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @JSONSchema({
    description: 'Number of comments per page',
    example: 10,
    type: 'number',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

class AddCommentParams {
  @JSONSchema({
    description: 'ID of the question',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  questionId: string;

  @JSONSchema({
    description: 'ID of the answer',
    example: '64adf92e9e7c3b1234567891',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  answerId: string;
}

class AddCommentBody {
  @JSONSchema({
    description: 'Comment text',
    example: 'This is a great answer!',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  text: string;
}

export const COMMENT_VALIDATORS = [
  AddCommentBody,
  GetCommentsParams,
  GetCommentsQuery,
  AddCommentParams,
];

export {AddCommentBody, GetCommentsParams, GetCommentsQuery, AddCommentParams};
