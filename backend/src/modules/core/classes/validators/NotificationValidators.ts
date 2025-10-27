import {Expose, Type} from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  IsMongoId,
  ValidateNested,
  IsArray,
  ArrayNotEmpty,
  IsUrl,
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';
class AddNotificationBody {
  @JSONSchema({
    description: 'ID of the entity being used to store notification',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  entityId: string;

  @JSONSchema({
    description: 'Notification type',
    example:
      'Flag Notification',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  type: string;

  @JSONSchema({
    description: 'Notification text',
    example:
      'A new question is assigned to you',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  message: string;

  @JSONSchema({
    description: 'Notification title',
    example:
      'A new question is assigned to you',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  title: string;
}

class NotificationResponse {
  @JSONSchema({
    description: 'Unique question identifier',
    example: 'q1',
    type: 'string',
  })
  @IsString()
  _id: string;

   @JSONSchema({
    description: 'Unique question identifier',
    example: 'q1',
    type: 'string',
  })
  @IsString()
  enitity_id: string;


   @JSONSchema({
    description: 'Unique question identifier',
    example: 'q1',
    type: 'string',
  })
  @IsString()
  userId: string;


  @JSONSchema({
    description: 'Question text',
    example: 'What is the capital of France?',
    type: 'string',
  })
  @IsString()
  message: string;

  @JSONSchema({
    description: 'Question text',
    example: 'What is the capital of France?',
    type: 'string',
  })
  @IsString()
  title: string;

  @JSONSchema({
    description:'Is Notification Read?',
    example:true,
    type:'boolean'
  })
  @IsBoolean()
  is_read:boolean

  @JSONSchema({
    description: 'Question creation timestamp',
    example: '2025-09-10T10:00:00Z',
    type: 'string',
  })
  @IsString()
  createdAt: string;

  @JSONSchema({
    description: 'Question last updated timestamp',
    example: '2025-09-12T12:00:00Z',
    type: 'string',
  })
  @IsString()
  updatedAt: string;

}

class DeleteNotificationParams {
  @IsMongoId()
  @JSONSchema({example: '650e9c0f5f1b2c001c2f4d9e'})
  notificationId: string;
}

export const NOTIFICATION_VALIDATORS = [
  AddNotificationBody,
  NotificationResponse,
  DeleteNotificationParams
];

export {
  AddNotificationBody,
  NotificationResponse,
  DeleteNotificationParams
};