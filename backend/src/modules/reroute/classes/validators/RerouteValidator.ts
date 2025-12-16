import { IsMongoId } from "class-validator";
import { JSONSchema } from "class-validator-jsonschema";

class RerouteIdParam {
  @JSONSchema({
    description: 'MongoDB ObjectId of the question',
    example: '650e9c0f5f1b2c00sdf2f4d9e',
    type: 'string',
  })
  @IsMongoId()
  rerouteId: string;

  @JSONSchema({
    description: 'MongoDB ObjectId of the question',
    example: '650e9c0f5f1b2c00sdf2f4d9e',
    type: 'string',
  })
  @IsMongoId()
  questionId: string;
}

export const USER_VALIDATORS = [RerouteIdParam];

export {RerouteIdParam};
