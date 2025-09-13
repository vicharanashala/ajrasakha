export type UserRole = "admin" | "user" | "expert";
export type QuestionStatus = "open" | "answered" | "closed";

export interface IUser {
  _id?: string;
  firebaseUID: string;
  email: string;
  firstName: string;
  lastName?: string;
  role: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IQuestion {
  id: string;
  text: string;
  currentAnswers?: {
    answer: string;
    id: string;
    isFinalAnswer: boolean;
    createdAt: string;
  }[];
}

// export interface IQuestion {
//   _id?: string;
//   userId?: string;
//   question: string;
//   status: QuestionStatus;
//   totalAnwersCount: number;
//   createdAt?: Date;
//   updatedAt?: Date;
// }

export interface IAnswer {
  _id?: string;
  questionId: string;
  authorId: string;
  answerIteration: number;
  isFinalAnswer: boolean;
  answer: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IContext {
  _id?: string;
  text: string;
  createdAt?: Date;
}
