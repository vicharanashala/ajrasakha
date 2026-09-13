import { ClientSession, ObjectId } from 'mongodb';

export interface ISavedAnswer {
  _id?: string | ObjectId;
  userId: string | ObjectId;
  answerId: string | ObjectId;
  note?: string;
  createdAt?: Date;
}

export interface ISavedAnswerRepository {
  saveAnswer(
    userId: string,
    answerId: string,
    note?: string,
    session?: ClientSession,
  ): Promise<{ insertedId: string }>;

  getSavedAnswers(
    userId: string,
    session?: ClientSession,
  ): Promise<any[]>;

  removeSavedAnswer(
    userId: string,
    savedAnswerId: string,
    session?: ClientSession,
  ): Promise<{ deletedCount: number }>;

  isAlreadySaved(
    userId: string,
    answerId: string,
    session?: ClientSession,
  ): Promise<boolean>;
}