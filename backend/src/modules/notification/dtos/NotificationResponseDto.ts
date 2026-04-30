import { Expose, Type } from 'class-transformer';
import { IsString, IsBoolean, IsEnum, IsDate, IsOptional } from 'class-validator';
import { INotificationType } from '#root/shared/interfaces/models.js';

export class NotificationResponseDto {
  @Expose()
  @IsString()
  @Type(() => String)
  _id: string;

  @Expose()
  @IsString()
  @Type(() => String)
  enitity_id: string;

  @Expose()
  @IsString()
  message: string;

  @Expose()
  @IsString()
  title: string;

  @Expose()
  @IsString()
  type: INotificationType;

  @Expose()
  @IsBoolean()
  is_read: boolean;

  @Expose()
  @IsDate()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  updatedAt?: Date;
}

export class PaginatedNotificationsResponseDto {
  @Expose()
  @Type(() => NotificationResponseDto)
  notifications: NotificationResponseDto[];

  @Expose()
  page: number;

  @Expose()
  totalCount: number;

  @Expose()
  totalPages: number;
}
