export interface IQuestionContextData {
  id: string;
  text: string;
  originalText?: string;
  crop?: string;
  state?: string;
  district?: string;
  block?: string;
  language?: string;
  askedOn?: string;
  priority?: "Critical" | "High" | "Medium" | "Low";
  commentsCount?: number;
  queueIndex?: number;
  totalInQueue?: number;
  aiInitialAnswer?: string;
  aiApprovedAnswer?: string;
  metadata?: Record<string, any>;
}

export interface IPanelCollapseState {
  questionContext: boolean;
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

