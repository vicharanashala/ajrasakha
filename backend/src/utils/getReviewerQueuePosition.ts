import {ObjectId} from 'mongodb';

export const getReviewerQueuePosition = (
  queue: (string | ObjectId)[],
  userId: string,
) => {
  const index = queue.findIndex(q => q.toString() == userId);
  if (index == -1) return '';
  return index;
};
