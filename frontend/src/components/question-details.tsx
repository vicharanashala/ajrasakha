import type {
  IQuestionFullData,
  IUser,
  IRerouteHistoryResponse,
} from "@/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "@/hooks/services/questionService";

import { Button } from "./atoms/button";

import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { useGetReRoutedQuestionFullData } from "@/hooks/api/question/useGetReRoutedQuestionFullData";

import { AnswerTimeline } from "@/features/question_details/components/AnswerTimeline";
import { RerouteTimeline } from "@/features/question_details/components/RerouteTimeline";
import { AllocationTimeline } from "@/features/question_details/components/AllocationTimeline";
import { ModeratorQueue } from "@/features/question_details/components/ModeratorQueue";
import { RoleAssigneeQueue } from "@/features/question_details/components/RoleAssigneeQueue";
import { flattenAnswers } from "@/features/question_details/utils/flattenAnswers";
import { QuestionHeader } from "@/features/question_details/components/QuestionHeader";
import { QuestionDetailsCard } from "@/features/question_details/components/QuestionDetailsCard";
import MessageDetail from "./MessageDetail";
import { AiGeneratedAnswerCard } from "./AiGeneratedAnswerCard";
import { useGenerateInitialAnswer } from "@/hooks/api/question/useGenerateInitialAnswer";
import { useApproveAIAnswer } from "@/hooks/api/question/useApproveInitialAnswer";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { SubmissionHistoryModal } from "./submission-history-model";

interface QuestionDetailProps {
  question: IQuestionFullData;
  currentUserId: string;
  goBack: () => void;
  refetchAnswers: () => void;
  isRefetching: boolean;
  currentUser: IUser;
  rerouteQuestion?: IRerouteHistoryResponse[];
  navigateToQuestionPage: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  /** True when the question is opened from the moderator's Dedicated tab.
   *  Only in this view can moderators approve or reroute answers. */
  isDedicatedView?: boolean;
}

export const QuestionDetails = ({
  question,
  currentUserId,
  refetchAnswers,
  isRefetching,
  currentUser,
  goBack,
  rerouteQuestion,
  navigateToQuestionPage,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  isDedicatedView = false,
}: QuestionDetailProps) => {
  const ANSWER_VISIBLE_COUNT = 5;

  const answers = useMemo(
    () => flattenAnswers(question?.submission),
    [question.submission],
  );
  // console.log("Answers", answers);
  const [answerVisibleCount, setAnswerVisibleCount] =
    useState(ANSWER_VISIBLE_COUNT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  //state for showing passing remark
  const [remarkExpanded, setRemarkExpanded] = useState(false);

  const commentRef = useRef<any>(null);
  const { data: reroutequestionDetails } = useGetReRoutedQuestionFullData(
    question?._id,
  );

  const [tempAiAnswer, setTempAiAnswer] = useState<string>("");
  const [open, setOpen] = useState(false);

  const { mutate: approveAIAnswer, isPending: isApproving } =
    useApproveAIAnswer();

  // const { data: submissionCheck } = useQuery({
  //   queryKey: ["question_submission_exists", question?._id],
  //   queryFn: () => questionService.checkSubmissionExists(question._id),
  //   enabled: !!question?._id && ["AJRASAKHA", "WHATSAPP", "AGRI_EXPERT", "OUTREACH"].includes(question.source),
  // });

  const { mutate: generateAIAnswer, isPending: isGeneratingAI } =
    useGenerateInitialAnswer(currentUser._id?.toString());
  const submissionExists = question.submission.history.length > 0 || false;

  const handleGenerateAI = () => {
    if (!question?._id) return;

    generateAIAnswer(question._id, {
      onSuccess: (data) => {
        setTempAiAnswer(data.aiInitialAnswer);
      },
      onError: (err) => {
        console.error(err);
        toast.error(err.message || "Failed to generate answer");
      },
    });
  };

  const handleApproveAI = () => {
    if (!question?._id || !tempAiAnswer) return;

    approveAIAnswer(
      { questionId: question._id, answer: tempAiAnswer },
      {
        onSuccess: () => {
          setTempAiAnswer("");
          refetchAnswers();
        },
        onError: (err) => {
          console.error(err);
          toast.error(err.message || "Failed approve answer");
        },
      },
    );
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && hasNext && onNext) {
        onNext();
      } else if (e.key === "ArrowLeft" && hasPrev && onPrev) {
        onPrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasNext, hasPrev, onNext, onPrev]);

  useEffect(() => {
    console.log("Open is set to", open);
  }, [open]);

  return (
    <div className="relative w-full">
      {/* Navigation Arrows */}
      <div className="fixed inset-y-0 left-0 right-0 pointer-events-none z-50 flex items-center justify-between px-2 md:px-8">
        <div className="pointer-events-auto">
          {hasPrev && onPrev && (
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-primary/20 hover:bg-primary/10 hover:border-primary/50 transition-all group"
              onClick={onPrev}
              title="Previous Question (Left Arrow)"
            >
              <ChevronLeft className="h-6 w-6 text-primary group-hover:-translate-x-0.5 transition-transform" />
            </Button>
          )}
        </div>
        <div className="pointer-events-auto">
          {hasNext && onNext && (
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-primary/20 hover:bg-primary/10 hover:border-primary/50 transition-all group"
              onClick={onNext}
              title="Next Question (Right Arrow)"
            >
              <ChevronRight className="h-6 w-6 text-primary group-hover:translate-x-0.5 transition-transform" />
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.main
          key={question._id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="mx-auto p-6 pt-0 grid gap-6"
        >
          <QuestionHeader
            question={question}
            goBack={goBack}
            currentUser={currentUser}
            isQuestionAllocatedToExpert={submissionExists}
          />

          <QuestionDetailsCard question={question} currentUser={currentUser} />

          {question.passingRemark &&
            currentUser &&
            currentUser.role != "expert" && (
              <div className="relative w-full rounded-xl p-[1px] overflow-hidden">
                <div className="absolute inset-0 rounded-xl bg-primary animate-pulse opacity-80 h-19" />
                <div className="absolute inset-0 rounded-xl bg-primary/20 blur-md h-19" />
                <button
                  onClick={() => setRemarkExpanded(!remarkExpanded)}
                  className="relative z-10 w-full flex items-center gap-3 px-5 py-4 rounded-xl bg-card border border-transparent hover:shadow-md transition-all duration-300 group"
                >
                  {remarkExpanded ? (
                    <ChevronDown className="h-5 w-5 text-primary shrink-0 transition-transform" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-primary shrink-0 transition-transform" />
                  )}
                  <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground">
                      Passing Reason
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {remarkExpanded
                        ? "Click to collapse"
                        : "Click to expand & view reason"}
                    </span>
                  </div>
                </button>
                {remarkExpanded && (
                  <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="p-5">
                      <p className="text-sm text-foreground/90">
                        {question.passingRemark}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          <AiGeneratedAnswerCard
            aiApprovedAnswer={question.aiApprovedAnswer}
            aiInitialAnswer={question.aiInitialAnswer}
            aiApprovedSources={question.aiApprovedSources}
            source={question.source}
            hasSubmissions={question.submission.history.length > 0}
            tempAiAnswer={tempAiAnswer}
            onGenerate={handleGenerateAI}
            onApprove={handleApproveAI}
            onCancel={() => setTempAiAnswer("")}
            isGenerating={isGeneratingAI}
            isApproving={isApproving}
          />

          {question &&
            (question.source == "AJRASAKHA" || question.source == "WHATSAPP") &&
            currentUser &&
            currentUser.role != "expert" && (
              <MessageDetail
                question={question}
                isQuestionAllocatedToExpert={
                  question?.submission?.history?.length > 0
                }
                navigateToQuestionPage={navigateToQuestionPage}
              />
            )}

          {/* Queue order: Gate Keeper → Auditor → Expert → Moderator → Re-route */}

          {/* 1. Gate keeper / auditor role queues — always shown (read-only unless the
                viewer is a moderator/admin who can manage). */}
          <RoleAssigneeQueue
            title="Gate Keeper Queue"
            noun="gate keeper"
            role="gate_keeper"
            question={question}
            currentUser={currentUser}
          />
          <RoleAssigneeQueue
            title="Auditor Queue"
            noun="auditor"
            role="auditor"
            question={question}
            currentUser={currentUser}
          />

          {/* 2. Expert allocation queue */}
          <AllocationTimeline
            history={question.submission.history}
            queue={question.submission.queue}
            currentUser={currentUser}
            question={question}
          />

          {/* 3. Moderator queue */}
          <ModeratorQueue question={question} currentUser={currentUser} />

          {/* 4. Re-route queue */}
          {reroutequestionDetails && reroutequestionDetails.length >= 1 && (
            <RerouteTimeline
              currentUser={currentUser}
              rerouteData={reroutequestionDetails}
            />
          )}

          {/* )} */}
          <div className="md:flex items-center justify-between md:mt-12 hidden ">
            <h2 className="text-lg font-semibold flex justify-center gap-2 items-center ">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              Submission History
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsRefreshing(true);
                  setTimeout(() => {
                    refetchAnswers();
                    if (commentRef.current) {
                      commentRef.current.refetchComments();
                    }
                    setIsRefreshing(false);
                  }, 2000);
                  setAnswerVisibleCount(ANSWER_VISIBLE_COUNT);
                }}
                disabled={isRefreshing || isRefetching}
              >
                {isRefreshing || isRefetching ? (
                  <Loader2 className="animate-spin w-4 h-4" />
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Refresh
                  </>
                )}
              </Button>

              {currentUser.role !== "expert" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled // will enable once we have proper view for this 
                  onClick={() => setOpen(true)}
                >
                  Manage History
                </Button>
              )}
            </div>
          </div>
          {question.status !== "pass" && (
            <>
              <p
                className="
        text-sm md:hidden p-3 rounded w-full 
        flex items-center justify-center gap-3 text-center flex-wrap
        bg-yellow-50 border border-yellow-300 text-yellow-700
        dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-300
      "
              >
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />

                <span className="font-medium">
                  Allocation timeline is only accessible on laptop/desktop
                </span>

                <span className="opacity-80">(or switch to desktop view)</span>
              </p>

              <SubmissionHistoryModal
                open={open}
                onClose={() => setOpen(false)}
                answers={answers}
                question={question}
                rerouteQuestion={reroutequestionDetails ?? undefined}
                currentUser={currentUserId || currentUser._id?.toString()}
                userRole={currentUser.role}
              />
            </>
          )}

          {answers.length === 0 ? (
            <p className="text-sm text-muted-foreground  hidden md:block">
              No answers yet.
            </p>
          ) : (
            <div className="hidden md:block">
              {/* <SubmissionTimeline /> */}
              <AnswerTimeline
                answerVisibleCount={answerVisibleCount}
                answers={answers}
                commentRef={commentRef}
                currentUserId={currentUserId || currentUser._id?.toString()}
                question={question}
                userRole={currentUser.role}
                queue={question.submission.queue}
                rerouteQuestion={reroutequestionDetails ?? undefined}
                isDedicatedView={isDedicatedView}
              />
              {answerVisibleCount < answers.length && (
                <div className="flex justify-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsLoadingMore(true);
                      setTimeout(() => {
                        setAnswerVisibleCount(
                          (prev) => prev + ANSWER_VISIBLE_COUNT,
                        );
                        setIsLoadingMore(false);
                      }, 2000);
                    }}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <Loader2 className="animate-spin w-4 h-4 mr-2" />
                    ) : null}
                    {isLoadingMore ? "Loading..." : "Load More"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </motion.main>
      </AnimatePresence>
    </div>
  );
};
