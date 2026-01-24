import type {
  IQuestionFullData,
  IUser,
  IRerouteHistoryResponse,
} from "@/types";
import { useMemo, useRef, useState } from "react";

import { Button } from "./atoms/button";

import { AlertTriangle, FileText, Loader2, RefreshCw } from "lucide-react";

import { useGetReRoutedQuestionFullData } from "@/hooks/api/question/useGetReRoutedQuestionFullData";

import { AnswerTimeline } from "@/features/question_details/components/AnswerTimeline";
import { RerouteTimeline } from "@/features/question_details/components/RerouteTimeline";
import { AllocationTimeline } from "@/features/question_details/components/AllocationTimeline";
import { flattenAnswers } from "@/features/question_details/utils/flattenAnswers";
import { QuestionHeader } from "@/features/question_details/components/QuestionHeader";
import { QuestionDetailsCard } from "@/features/question_details/components/QuestionDetailsCard";

interface QuestionDetailProps {
  question: IQuestionFullData;
  currentUserId: string;
  goBack: () => void;
  refetchAnswers: () => void;
  isRefetching: boolean;
  currentUser: IUser;
  rerouteQuestion?: IRerouteHistoryResponse[];
}

export const QuestionDetails = ({
  question,
  currentUserId,
  refetchAnswers,
  isRefetching,
  currentUser,
  goBack,
  rerouteQuestion,
}: QuestionDetailProps) => {
  //console.log("the question details====",question)
  // console.log("reroutedetail====",rerouteQuestion)
  const ANSWER_VISIBLE_COUNT = 5;

  const answers = useMemo(
    () => flattenAnswers(question?.submission),
    [question.submission]
  );
  const [answerVisibleCount, setAnswerVisibleCount] =
    useState(ANSWER_VISIBLE_COUNT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const commentRef = useRef<any>(null);
  const {
    data: reroutequestionDetails,
    refetch: refechrerouteSelectedQuestion,
    isLoading: isLoadingrerouteSelectedQuestion,
  } = useGetReRoutedQuestionFullData(question?._id);

  return (
    <main className="mx-auto p-6 pt-0 grid gap-6">
      <QuestionHeader question={question} goBack={goBack} />

      <QuestionDetailsCard question={question} currentUser={currentUser} />

      {/* {currentUser.role !== "expert" && ( */}
      <AllocationTimeline
        history={question.submission.history}
        queue={question.submission.queue}
        currentUser={currentUser}
        question={question}
      />
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
        </div>
      </div>
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
                      (prev) => prev + ANSWER_VISIBLE_COUNT
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
    </main>
  );
};