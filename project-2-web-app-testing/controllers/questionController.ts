import { Question } from "../models/model";
import {
  shouldShowDisclaimer,
  getDisclaimer,
} from "../services/disclaimerService";

import { Request, Response } from "express";
import {
  saveQuestion,
  saveAnswer,
  getAnswer,
} from "../services/questionService";

export const createQuestion = async (
  req: Request,
  res: Response
) => {
  try {
    const { question, language } = req.body;

    if (!question || !language) {
      return res.status(400).json({
        message: "Question and language are required",
      });
    }

    const savedQuestion = await saveQuestion(question, language);

    return res.status(201).json(savedQuestion);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to save question",
    });
  }
};

export const createAnswer = async (
  req: Request,
  res: Response
) => {
  try {
    const { questionId, answer, language, disclaimerShown } = req.body;

    if (!questionId || !answer || !language) {
      return res.status(400).json({
        message: "Required fields are missing",
      });
    }

    const savedAnswer = await saveAnswer(
      questionId,
      answer,
      language,
      disclaimerShown ?? false
    );

    return res.status(201).json(savedAnswer);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to save answer",
    });
  }
};

export const fetchAnswer = async (
  req: Request,
  res: Response
) => {
  try {
    const question = await Question.findById(req.params.questionId);

    if (!question) {
      return res.status(404).json({
        message: "Question not found",
      });
    }

    const answer = await getAnswer(req.params.questionId);

    if (answer) {
      return res.status(200).json(answer);
    }

    if (shouldShowDisclaimer(question.createdAt)) {
      return res.status(200).json({
        disclaimer: getDisclaimer(question.language),
        disclaimerShown: true,
      });
    }

    return res.status(202).json({
      message: "Answer is not available yet",
      disclaimerShown: false,
    });

  } catch (error) {
    return res.status(500).json({
      message: "Failed to retrieve answer",
    });
  }
};