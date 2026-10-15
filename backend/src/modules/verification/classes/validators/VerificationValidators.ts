import {Type} from 'class-transformer';
import {IsIn, IsNotEmpty, IsOptional, IsString, IsMongoId, IsInt, Min, Max} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';
import {Verdict} from '../../types/index.js';

// ── Body DTOs ────────────────────────────────────────────────────────────────

export class VerifyAnswerBody {
  @JSONSchema({description: 'The AI-generated answer text to verify', example: 'Spray 25 ml of monocrotophos per litre. Repeat every 5 days for 3 sprays.'})
  @IsNotEmpty({message: 'answerText is required'})
  @IsString()
  answerText: string;

  @JSONSchema({description: 'Optional question ObjectId the answer belongs to', type: 'string'})
  @IsOptional()
  @IsMongoId()
  questionId?: string;

  @JSONSchema({description: 'Optional answer ObjectId (when verifying a stored answer)', type: 'string'})
  @IsOptional()
  @IsMongoId()
  answerId?: string;
}

// ── Param / query DTOs ───────────────────────────────────────────────────────

export class QuestionIdParam {
  @JSONSchema({description: 'MongoDB ObjectId of the question', example: '6abe12e0997a10320b06553d', type: 'string'})
  @IsMongoId()
  questionId: string;
}

export class RecentReceiptsQuery {
  @JSONSchema({description: 'Filter by verdict', example: 'BLOCKED'})
  @IsOptional()
  @IsIn(Object.values(Verdict))
  verdict?: Verdict;

  @JSONSchema({description: 'Maximum receipts to return', example: 20, type: 'number'})
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(200)
  limit?: number;
}
