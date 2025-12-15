import {
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
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



export const CONTEXT_VALIDATORS = [
  AddContextBody,
  ContextResponse,
  ContextIdParam,
];

export {
  AddContextBody,
  ContextResponse,
  ContextIdParam,
};
