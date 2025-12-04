import {ISubmissionHistory} from '#root/shared/index.js';

export const getReviewerHistoryPosition = (
  history: ISubmissionHistory[],
  userId: string,
) => {
  console.log('History: ', history, 'userId: ', userId);
  const index = history.findIndex(h => h.updatedBy.toString() == userId);
  if (index == -1) return '';
  return index;
};
