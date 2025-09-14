"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Eye, MessageCircle, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { RadioGroup, RadioGroupItem } from "./atoms/radio-group";
import { Label } from "./atoms/label";
import { Textarea } from "./atoms/textarea";
import { Button } from "./atoms/button";
import { useGetAllQuestions } from "@/hooks/api/question/useGetAllQuestions";
import { useGetQuestionById } from "@/hooks/api/question/useGetQuestionById";
import { useSubmitAnswer } from "@/hooks/api/answer/useSubmitAnswer";
import toast from "react-hot-toast";
import ErrorMessage from "./atoms/ErrorMessage";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "./atoms/dialog";
import { AlertDialogHeader } from "./atoms/alert-dialog";

// const questions = await generateQuestionDataSet();

export default function QAInterface() {
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [newAnswer, setNewAnswer] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    data: questionPages,
    isLoading: isQuestionsLoading,
    error: fetchAllQuestionError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGetAllQuestions(10);

  const questions = questionPages?.pages.flat() || [];

  const {
    data: selectedQuestionData,
    error: fetchSelectedQuestionError,
    isLoading: isSelectedQuestionLoading,
  } = useGetQuestionById(selectedQuestion);

  const {
    mutateAsync: submitAnswer,
    isPending: isSubmittingAnswer,
    isError: submitAnswerError,
  } = useSubmitAnswer();

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop + clientHeight >= scrollHeight - 10) {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleSubmit = async () => {
    if (!selectedQuestion) return;
    try {
      await submitAnswer({
        questionId: selectedQuestion,
        answer: newAnswer,
      });
      toast.success("Response submitted successfully!");

      setNewAnswer("");
    } catch (error) {
      toast.error("Failed to submit response! Try again.");
      console.error("Error submitting answer:", error);
    }
  };

  const handleReset = () => {
    setNewAnswer("");
  };

  return (
    <div className="container mx-auto p-6 bg-transparent">
      <div className="flex flex-col space-y-6">
        <div className="grid h-full grid-rows-2 gap-6 lg:grid-cols-2 lg:grid-rows-1">
          <Card className="h-[60vh] md:h-[70vh] lg:h-[75vh] border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg bg-transparent">
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <CardTitle className="text-lg font-semibold">
                Incoming Questions
              </CardTitle>
            </CardHeader>
            {isQuestionsLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-2">
                  <svg
                    className="w-8 h-8 text-gray-400 dark:text-gray-500 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    Loading Questions...
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Please wait while we fetch the questions for you.
                  </p>
                </div>
              </div>
            ) : !questions || questions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-2">
                  <svg
                    className="w-8 h-8 text-gray-400 dark:text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">
                  No questions available. Please check back later.
                </p>
              </div>
            ) : (
              <CardContent
                className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-200 dark:scrollbar-track-gray-800 p-4 "
                ref={scrollRef}
              >
                <RadioGroup
                  value={selectedQuestion}
                  onValueChange={setSelectedQuestion}
                  className="space-y-3"
                >
                  {questions?.map((question) => (
                    <div
                      key={question.id}
                      className="flex items-start space-x-3 p-3 rounded-lg 
            border border-gray-200 dark:border-gray-700 
            hover:bg-gray-100 dark:hover:bg-gray-600  
            hover:border-gray-300 dark:hover:border-gray-500 
            transition-colors dark:text-white"
                    >
                      <RadioGroupItem
                        value={question.id}
                        id={question.id}
                        className="mt-1"
                      />
                      <Label
                        htmlFor={question.id}
                        className="text-sm leading-relaxed cursor-pointer flex-1"
                      >
                        {question.text}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {isFetchingNextPage && (
                  <div className="flex justify-center items-center py-3">
                    <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <span className="ml-2 text-sm text-muted-foreground">
                      Loading more questions...
                    </span>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <Card className="h-[60vh] md:h-[70vh] lg:h-[75vh] border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg bg-transparent ml-4">
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <CardTitle className="text-lg font-semibold">Response</CardTitle>
            </CardHeader>
            <CardContent className="h-full flex flex-col space-y-6 p-4 overflow-hidden scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-200 dark:scrollbar-track-gray-800">
              {isSelectedQuestionLoading ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Loading responses...
                  </p>
                </div>
              ) : selectedQuestionData ? (
                <>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">
                      Current Query:
                    </Label>
                    <p className="text-sm mt-1 p-3 rounded-md border border-gray-200 dark:border-gray-600">
                      {selectedQuestionData.text}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="new-answer" className="text-sm font-medium">
                      Draft Response:
                    </Label>
                    <Textarea
                      id="new-answer"
                      placeholder="Enter your answer here..."
                      value={newAnswer}
                      onChange={(e) => setNewAnswer(e.target.value)}
                      className="mt-1 max-h-[205px] min-h-[190px] resize-y border border-gray-200 dark:border-gray-600 rounded-md overflow-y-auto p-3 pb-0 bg-white dark:bg-gray-700"
                    />
                  </div>
                  <div className="flex items-center justify-between  p-4">
                    <div className="flex items-center space-x-3">
                      <Button
                        onClick={handleSubmit}
                        disabled={!newAnswer.trim() || isSubmittingAnswer}
                      >
                        {isSubmittingAnswer ? "Submitting..." : "Submit"}
                      </Button>
                      <Button variant="secondary" onClick={handleReset}>
                        <span className="sr-only">Reset answer</span>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <ErrorMessage
                        message={
                          submitAnswerError
                            ? "Failed to submit answer. Try again."
                            : undefined
                        }
                      />
                    </div>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="bg-transparent flex items-center"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Other Responses
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <AlertDialogHeader>
                          <DialogTitle>Other Responses</DialogTitle>
                        </AlertDialogHeader>
                        <div className="mt-4">
                          {selectedQuestionData.currentAnswers &&
                          selectedQuestionData.currentAnswers.length > 0 ? (
                            <div className="space-y-6">
                              {selectedQuestionData.currentAnswers
                                ?.slice()
                                .sort(
                                  (a, b) =>
                                    (b.isFinalAnswer ? 1 : 0) -
                                    (a.isFinalAnswer ? 1 : 0)
                                )
                                .map((currentAnswer, index) => (
                                  <div
                                    key={currentAnswer.id}
                                    className={`relative overflow-hidden rounded-xl border transition-all duration-300 hover:shadow-lg ${
                                      currentAnswer.isFinalAnswer
                                        ? "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 border-green-200 dark:border-green-800 shadow-green-100/50 dark:shadow-green-900/20"
                                        : "bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900/50 dark:to-gray-800/30 border-gray-200 dark:border-gray-700 shadow-sm"
                                    }`}
                                  >
                                    <div
                                      className={`absolute left-0 top-0 h-full w-1 ${
                                        currentAnswer.isFinalAnswer
                                          ? "bg-gradient-to-b from-green-500 to-emerald-600"
                                          : "bg-gradient-to-b from-primary to-primary/60"
                                      }`}
                                    />

                                    {currentAnswer.isFinalAnswer && (
                                      <div className="absolute top-0 right-0 w-20 h-20 overflow-hidden">
                                        <div className="absolute top-0 right-0 w-8 h-8 bg-green-200/30 dark:bg-green-700/20 rounded-bl-full" />
                                        <div className="absolute top-2 right-2 w-4 h-4 bg-green-300/40 dark:bg-green-600/30 rounded-full" />
                                      </div>
                                    )}

                                    <div className="relative p-6">
                                      <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                          <div
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                              currentAnswer.isFinalAnswer
                                                ? "bg-green-100 dark:bg-green-900/50"
                                                : "bg-gray-100 dark:bg-gray-800"
                                            }`}
                                          >
                                            {currentAnswer.isFinalAnswer ? (
                                              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                                            ) : (
                                              <MessageCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                            )}
                                          </div>

                                          <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-foreground">
                                              Response {index + 1}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                              {new Date(
                                                currentAnswer.createdAt
                                              ).toLocaleString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                              })}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {currentAnswer.isFinalAnswer && (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 rounded-full border border-green-200 dark:border-green-800">
                                              <svg
                                                className="w-3 h-3"
                                                fill="currentColor"
                                                viewBox="0 0 20 20"
                                              >
                                                <path
                                                  fillRule="evenodd"
                                                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                  clipRule="evenodd"
                                                />
                                              </svg>
                                              <span className="text-xs font-semibold">
                                                Final Answer
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Content section */}
                                      <div className="space-y-4">
                                        <div
                                          className={`prose prose-sm max-w-none ${
                                            currentAnswer.isFinalAnswer
                                              ? "prose-green dark:prose-invert"
                                              : "dark:prose-invert"
                                          }`}
                                        >
                                          <p className="text-base leading-relaxed text-foreground/90 mb-0">
                                            {currentAnswer.answer}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <div className="text-center py-12">
                              <p className="text-muted-foreground italic">
                                No responses provided yet, Draft your first
                                Response!
                              </p>
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
                  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-2">
                    <svg
                      className="w-8 h-8 text-gray-400 dark:text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                      No Question Selected
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Select a question from the right side to view its details,
                      add your response, or check existing responses.
                    </p>
                  </div>

                  <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <svg
                          className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-0.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Getting Started
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Choose any question from the list to start drafting
                          responses or reviewing existing answers.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
