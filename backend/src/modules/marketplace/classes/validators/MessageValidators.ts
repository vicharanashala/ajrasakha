import {IsNotEmpty, IsString, IsMongoId, MaxLength} from 'class-validator';

class DealMessagesParam {
  @IsMongoId()
  dealId: string;
}

class CreateMessageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  text: string;
}

export {DealMessagesParam, CreateMessageDto};

export const MESSAGE_VALIDATORS = [DealMessagesParam, CreateMessageDto];
