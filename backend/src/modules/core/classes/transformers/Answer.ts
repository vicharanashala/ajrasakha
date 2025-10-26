import {
  ObjectIdToString,
  StringToObjectId,
} from '#shared/constants/transformerConstants.js';
import {IAnswer} from '#shared/interfaces/models.js';
import {Expose, Transform} from 'class-transformer';
import {ObjectId} from 'mongodb';

class Answer implements IAnswer {
  @Transform(ObjectIdToString.transformer, {toPlainOnly: true})
  @Transform(StringToObjectId.transformer, {toClassOnly: true})
  @Expose()
  _id?: string | ObjectId;

  @Transform(ObjectIdToString.transformer, {toPlainOnly: true})
  @Transform(StringToObjectId.transformer, {toClassOnly: true})
  @Expose()
  questionId: string | ObjectId;

  @Transform(ObjectIdToString.transformer, {toPlainOnly: true})
  @Transform(StringToObjectId.transformer, {toClassOnly: true})
  @Expose()
  authorId: string | ObjectId;

  @Expose()
  answerIteration: number;

  @Expose()
  isFinalAnswer: boolean;

  @Expose()
  answer: string;

  @Expose()
  sources: string[];

  @Expose()
  embedding: number[];

  @Expose()
  threshold: number;

  @Expose()
  approvalCount: number;;
  
  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;

  constructor(data?: Partial<IAnswer>) {
    // this._id = data?._id ? new ObjectId(data._id) : undefined;
    // this.questionId = data?.questionId ? new ObjectId(data.questionId) : undefined;
    // this.authorId = data?.authorId ? new ObjectId(data.authorId) : undefined;
    this.answerIteration = data?.answerIteration ?? 1;
    this.isFinalAnswer = data?.isFinalAnswer ?? false;
    this.answer = data?.answer;
    this.createdAt = data?.createdAt ?? new Date();
    this.updatedAt = data?.updatedAt ?? new Date();
  }
}

export {Answer};
