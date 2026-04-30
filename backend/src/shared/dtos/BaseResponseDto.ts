import {IsBoolean, IsOptional, IsString} from 'class-validator';

export class SuccessResponseDto<T> {
  @IsBoolean()
  success: boolean = true;

  @IsOptional()
  @IsString()
  message?: string;

  data: T;

  constructor(data: T, message?: string) {
    this.data = data;
    this.message = message;
  }
}
