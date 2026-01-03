
export type ReviewLevelNA = "NA";

export type ReviewLevelTime = {
  time: string;              
  yet_to_complete: boolean;
};

export type ReviewLevelValue = ReviewLevelNA | ReviewLevelTime;

export type ReviewLevelEntry = {
  column: string;          
  value: ReviewLevelValue;
};

export type ReviewLevelQuestion = {
  _id: string;
  question: string;
  status: string;
  createdAt: string;
  reviewLevels: ReviewLevelEntry[];
};

export type ReviewLevelsApiResponse = {
  page: number;
  limit: number;

  totalDocs: number;
  totalPages: number;

  hasNextPage: boolean;
  hasPrevPage: boolean;

  data: ReviewLevelQuestion[];
};
