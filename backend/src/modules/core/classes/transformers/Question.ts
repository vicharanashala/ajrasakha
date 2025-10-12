import {
  ObjectIdToString,
  StringToObjectId,
} from '#shared/constants/transformerConstants.js';
import {
  IQuestion,
  IQuestionPriority,
  QuestionStatus,
} from '#shared/interfaces/models.js';
import {Expose, Transform} from 'class-transformer';
import {ObjectId} from 'mongodb';

class Question implements IQuestion {
  @Transform(ObjectIdToString.transformer, {toPlainOnly: true})
  @Transform(StringToObjectId.transformer, {toClassOnly: true})
  @Expose()
  _id?: string | ObjectId;

  @Transform(ObjectIdToString.transformer, {toPlainOnly: true})
  @Transform(StringToObjectId.transformer, {toClassOnly: true})
  @Expose()
  userId: string | ObjectId;

  @Expose()
  question: string;

  @Transform(ObjectIdToString.transformer, {toPlainOnly: true})
  @Transform(StringToObjectId.transformer, {toClassOnly: true})
  @Expose()
  context: string | ObjectId;

  @Expose()
  status: QuestionStatus;

  @Expose()
  totalAnswersCount: number;

  @Expose()
  embedding: number[];

  @Expose()
  priority: IQuestionPriority;

  @Expose()
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };

  @Expose()
  source: 'AJRASAKHA' | 'AGRI_EXPERT';

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;

  constructor(data?: Partial<IQuestion>) {
    // Object.assign(this, data);
    this.createdAt = data?.createdAt ?? new Date();
    this.updatedAt = data?.updatedAt ?? new Date();
  }
}

export {Question};
