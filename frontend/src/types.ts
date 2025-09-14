import type { UserCredential } from "firebase/auth";

export type UserRole = "admin" | "user" | "expert";
export type QuestionStatus = "open" | "answered" | "closed";

export interface ExtendedUserCredential extends UserCredential {
  _tokenResponse?: {
    idToken: string;
    firstName?: string;
    lastName?: string;
    isNewUser?: boolean;
  };
}
export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  avatar: string;
}

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
  createdAt: string;
  updatedAt: string;
  totalAnwersCount: number;
  currentAnswers?: {
    answer: string;
    id: string;
    isFinalAnswer: boolean;
    createdAt: string;
  }[];
}

export type Role = "expert" | "user" | "admin" | null;

export interface AuthContextType {
  role: Role;
  isAuthenticated: boolean;
  login: (
    selectedRole: Role,
    uid: string,
    email: string,
    name?: string
  ) => void;
  loginWithGoogle: () => Promise<any>;
  loginWithEmail: (email: string, password: string) => Promise<any>;
  logout: () => void;
}

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

export interface SubmitAnswerResponse {
  insertedId: string;
  isFinalAnswer: boolean;
}
