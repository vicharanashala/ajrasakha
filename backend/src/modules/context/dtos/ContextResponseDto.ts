import { Expose, Type } from 'class-transformer';
import { IsString, IsDate, IsOptional } from 'class-validator';

export class ContextResponseDto {
  @Expose({ name: '_id' })
  @IsString()
  id: string;

  @Expose()
  @IsString()
  text: string;

  @Expose()
  @IsDate()
  @Type(() => Date)
  createdAt: Date;
}
