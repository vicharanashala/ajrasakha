export interface IQuestionContextData {
  id: string;
  text: string;
  originalText?: string;
  priority?: "critical" | "high" | "medium" | "low";
  createdAt?: string;
  updatedAt?: string;
  totalAnswersCount?: number;
  status?: string;
  source?: string;
  assignedAt?: string | null;
  review_level_number?: string;
  aiInitialAnswer?: string;
  aiApprovedAnswer?: string;
  details?: {
    state?: string;
    district?: string;
    crop?: string;
    normalised_crop?: string;
    season?: string;
    domain?: string[];
  };
}

export interface IPanelCollapseState {
  questionContext: boolean;
  ocrExtraction: boolean;
  answerDraft: boolean;
  sourceReference: boolean;
  checksPipeline: boolean;
  ffv: boolean;
}

export type AiAssistActionType =
  | "polish"
  | "simplify"
  | "shorten"
  | "summarise"
  | "farmer_friendly"
  | "translate"
  | "improve_structure";

export const REVAMP_QA_MODULE_VERSION = "2.0";

