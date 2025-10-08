import {IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Max, Min} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';

class AddContextBody {
  @JSONSchema({
    description: 'Transcript text or context content',
    example: 'This is a transcript excerpt for the session.',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  text: string;
}

class ContextResponse {
  @JSONSchema({
    description: 'Unique context identifier',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
  })
  insertedId: string;
}

class ContextIdParam {
  @JSONSchema({
    description: 'MongoDB ObjectId of the context',
    example: '650e9c0f5f1b2c001c2f4d9e',
    type: 'string',
  })
  @IsMongoId()
  contextId: string;
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

export const CONTEXT_VALIDATORS = [
  AddContextBody,
  ContextResponse,
  ContextIdParam,
  GetDetailedQuestionsQuery,
];

export {
  AddContextBody,
  ContextResponse,
  ContextIdParam,
  GetDetailedQuestionsQuery,
};
