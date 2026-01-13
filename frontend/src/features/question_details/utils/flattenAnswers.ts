import type { IAnswer, ISubmission } from "@/types";

export const flattenAnswers = (submission: ISubmission): IAnswer[] => {
  const answers: IAnswer[] = [];

  for (const h of submission.history) {
    if (h.answer) {
      answers.push(h.answer);
    }
  }

  return answers.sort((a, b) => {
    const aT = a.createdAt ? +new Date(a.createdAt) : 0;
    const bT = b.createdAt ? +new Date(b.createdAt) : 0;
    return bT - aT;
  });
};
