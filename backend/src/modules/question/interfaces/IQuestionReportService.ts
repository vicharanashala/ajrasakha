/**
 * Public surface of {@link QuestionReportService} — the Excel/report generation
 * that was extracted out of QuestionService. QuestionService keeps delegating
 * these methods so its own interface (IQuestionService) is unchanged.
 */
export interface IQuestionReportService {
  sendOutReachQuestionsMail(
    startDate: string,
    endDate: string,
    emails: string | string[],
  ): Promise<{success: boolean; message: string}>;

  generateQuestionReport(
    consecutiveApprovals?: number,
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<ArrayBuffer | null>;

  generateOverallQuestionReport(
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<ArrayBuffer | null>;

  generateTatReport(
    out: any,
    startDate: Date,
    endDate: Date,
    opts?: {
      sources?: string[];
      statuses?: string[];
      maxReviewers?: number;
    },
  ): Promise<boolean>;

  generateStateCropQuestionReport(filters: {
    state?: string;
    crop?: string;
    normalised_crop?: string;
    season?: string;
    domain?: string;
    status?: string;
    source?: string;
    hiddenQuestions?: string;
    duplicateQuestions?: string;
    isOnHold?: string;
    startDate?: string;
    endDate?: string;
    allUsers?: string;
  }): Promise<ArrayBuffer | null>;

  generateDuplicateQuestionReport(
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<ArrayBuffer | null>;
}
