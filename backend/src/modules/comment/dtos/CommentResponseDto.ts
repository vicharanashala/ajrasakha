import { Expose, Type } from 'class-transformer';
import { IsString, IsDate, IsNumber, ValidateNested } from 'class-validator';

export class CommentResponseDto {
  @Expose()
  @IsString()
  @Type(() => String)
  _id: string;

  @Expose()
  @IsString()
  text: string;

  @Expose()
  @IsString()
  userName: string;

  @Expose()
  @IsDate()
  @Type(() => Date)
  createdAt: Date;
}

export class PaginatedCommentsResponseDto {
  @Expose()
  @ValidateNested({ each: true })
  @Type(() => CommentResponseDto)
  comments: CommentResponseDto[];

  @Expose()
  @IsNumber()
  total: number;
}
