import { Question, Answer } from "../models/model";

export const saveQuestion = async (
  question: string,
  language: string
) => {
  return await Question.create({
    question,
    language,
  });
};

export const saveAnswer = async (
  questionId: string,
  answer: string,
  language: string,
  disclaimerShown: boolean
) => {
  return await Answer.create({
    questionId,
    answer,
    language,
    disclaimerShown,
  });
};

export const getAnswer = async (questionId: string) => {
  return await Answer.findOne({ questionId });
};