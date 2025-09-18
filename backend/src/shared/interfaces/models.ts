import {ObjectId} from 'mongodb';

export type UserRole = 'admin' | 'user' | 'expert';
export type QuestionStatus = 'open' | 'answered' | 'closed';

export interface IUser {
  _id?: string | ObjectId;
  firebaseUID: string;
  email: string;
  firstName: string;
  lastName?: string;
  role: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IQuestion {
  _id?: string | ObjectId;
  userId?: ObjectId | string;
  question: string;
  context: ObjectId | string;
  status: QuestionStatus;
  totalAnwersCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAnswer {
  _id?: string | ObjectId;
  questionId: string | ObjectId;
  authorId: string | ObjectId;
  answerIteration: number;
  isFinalAnswer: boolean;
  answer: string;
  threshold: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// For transcripts
export interface IContext { 
  _id?: string | ObjectId;
  text: string;
  createdAt?: Date;
}
