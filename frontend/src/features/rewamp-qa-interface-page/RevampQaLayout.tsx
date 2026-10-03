import React, { useState } from "react";
import { QuestionAndContextPanel } from "./components/QuestionAndContextPanel";
import { AnswerReviewDraftPanel } from "./components/AnswerReviewDraftPanel";
import { SourceReferencePanel } from "./components/SourceReferencePanel";
import { ChecksPipelinePanel } from "./components/ChecksPipelinePanel";
import { FarmerFriendlyVersionsPanel } from "./components/FarmerFriendlyVersionsPanel";
import type { IQuestionContextData, IPanelCollapseState } from "./types";

interface RevampQaLayoutProps {
  questionData?: IQuestionContextData | null;
  onRefresh?: () => void;
}

export const RevampQaLayout: React.FC<RevampQaLayoutProps> = ({
  questionData,
}) => {
  // Collapsible state for each of the 5 panels
  const [collapsed, setCollapsed] = useState<IPanelCollapseState>({
    questionContext: false,
    answerDraft: false,
    sourceReference: false,
    checksPipeline: false,
    ffv: false,
  });

  const togglePanel = (panel: keyof IPanelCollapseState) => {
    setCollapsed((prev) => ({
      ...prev,
      [panel]: !prev[panel],
    }));
  };

  const handleExpandAll = () => {
    setCollapsed({
      questionContext: false,
      answerDraft: false,
      sourceReference: false,
      checksPipeline: false,
      ffv: false,
    });
  };

  const isAnyCollapsed = Object.values(collapsed).some((v) => v);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col p-3 md:p-5 space-y-4">
      {/* Main Responsive Two-Column Layout (Left: Panel 1, Right: Panels 2, 3, 4, 5) */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 items-start">
        {/* LEFT COMPONENT: 1. Question & Context */}
        <div
          className={`transition-all duration-300 ease-in-out shrink-0 h-auto lg:h-[580px] ${
            collapsed.questionContext
              ? "w-full lg:w-12"
              : "w-full lg:w-[320px] xl:w-[350px]"
          }`}
        >
          <QuestionAndContextPanel
            question={questionData}
            isCollapsed={collapsed.questionContext}
            onToggleCollapse={() => togglePanel("questionContext")}
            progressPercent={15}
          />
        </div>

        {/* RIGHT COMPONENT: 2, 3, 4, and 5 */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 w-full">
          {/* TOP ROW: Panels 2 and 3 with locked height */}
          <div className="flex flex-col xl:flex-row gap-4 items-stretch h-auto xl:h-[580px]">
            {/* Panel 2: Answer Review & Draft */}
            <div
              className={`transition-all duration-300 ease-in-out h-full ${
                collapsed.answerDraft
                  ? "w-full xl:w-12 shrink-0"
                  : "flex-1 min-w-[320px]"
              }`}
            >
              <AnswerReviewDraftPanel
                initialAiAnswer={questionData?.aiInitialAnswer}
                isCollapsed={collapsed.answerDraft}
                onToggleCollapse={() => togglePanel("answerDraft")}
              />
            </div>

            {/* Panel 3: Package of Practices / Source Reference */}
            <div
              className={`transition-all duration-300 ease-in-out h-full ${
                collapsed.sourceReference
                  ? "w-full xl:w-12 shrink-0"
                  : "w-full xl:w-[46%] min-w-[300px] shrink-0"
              }`}
            >
              <SourceReferencePanel
                isCollapsed={collapsed.sourceReference}
                onToggleCollapse={() => togglePanel("sourceReference")}
              />
            </div>
          </div>

          {/* BOTTOM ROW: Panels 4 and 5 */}
          <div className="flex flex-col md:flex-row gap-4 items-stretch min-h-[260px]">
            {/* Panel 4: Checks / GDB Cleaning Pipeline */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                collapsed.checksPipeline
                  ? "w-full md:w-12 shrink-0"
                  : "w-full md:w-1/2 flex-1 min-w-[280px]"
              }`}
            >
              <ChecksPipelinePanel
                isCollapsed={collapsed.checksPipeline}
                onToggleCollapse={() => togglePanel("checksPipeline")}
              />
            </div>

            {/* Panel 5: Farmer-Friendly Versions (FFV) */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                collapsed.ffv
                  ? "w-full md:w-12 shrink-0"
                  : "w-full md:w-1/2 flex-1 min-w-[280px]"
              }`}
            >
              <FarmerFriendlyVersionsPanel
                isCollapsed={collapsed.ffv}
                onToggleCollapse={() => togglePanel("ffv")}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
