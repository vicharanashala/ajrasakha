
import mongoose, { Schema, Document } from "mongoose";

export interface IQuestion extends Document {
  question: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAnswer extends Document {
  questionId: mongoose.Types.ObjectId;
  answer: string;
  language: string;
  disclaimerShown: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    language: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const answerSchema = new Schema<IAnswer>(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    answer: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      required: true,
    },
    disclaimerShown: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const Question = mongoose.model<IQuestion>(
  "Question",
  questionSchema
);

export const Answer = mongoose.model<IAnswer>(
  "Answer",
  answerSchema
);
