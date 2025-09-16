import { useGetSubmissions } from "@/hooks/api/answer/useGetSubmissions";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { useEffect, useRef } from "react";
import { getTimeDifference } from "@/utils/getTimeDifference";

export const FullSubmissionHistory = () => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    data: submissionpages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGetSubmissions(5);
  const submissions = submissionpages?.pages.flat() || [];

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop + clientHeight >= scrollHeight - 20) {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <Card className="h-[80vh] md:h-[70vh] lg:h-[75vh] border border-gray-200 dark:border-gray-700 shadow-lg rounded-xl bg-transparent backdrop-blur-sm mb-6 md:mb-0">
      <CardHeader className="border-b border-gray-200 dark:border-gray-700  backdrop-blur-sm rounded-t-xl">
        <CardTitle className="text-md md:text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 bg-transparent">
          <svg
            className="w-5 h-5 text-blue-600 dark:text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Submission History
        </CardTitle>
      </CardHeader>

      {isLoading ? (
        <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6  backdrop-blur-sm ">
          <div className="w-16 h-16 rounded-full  flex items-center justify-center mb-2 shadow-lg bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-950 dark:via-emerald-950 dark:to-teal-950">
            <svg
              className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Loading Submissions...
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm">
              Please wait while we fetch the complete submission history.
            </p>
          </div>
        </div>
      ) : !submissions || submissions.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6 ">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2 shadow-lg">
            <svg
              className="w-8 h-8 text-gray-500 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              No Submissions Yet
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm">
              Your submission history will appear here .
            </p>
          </div>
        </div>
      ) : (
        <CardContent
          className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 hover:scrollbar-thumb-gray-500 dark:scrollbar-thumb-gray-600 dark:hover:scrollbar-thumb-gray-500 scrollbar-track-transparent p-6 space-y-6  backdrop-blur-sm"
          ref={scrollRef}
        >
          {submissions.map((submission, index) => (
            <div
              key={submission?.id}
              className="group space-y-4 p-5 border border-gray-200/60 dark:border-gray-700/60 rounded-xl  backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 "
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 flex-shrink-0 mt-2"></div>
                    <h4 className="text-sm md:text-base font-semibold text-gray-900 dark:text-gray-100 leading-relaxed break-words">
                      {submission?.text}
                    </h4>
                  </div>
                  <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-full font-medium flex-shrink-0">
                    #{String(index + 1).padStart(2, "0")}
                  </span>
                </div>

                <div className="hidden md:flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-gray-400 pl-4">
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Created: {submission?.createdAt}
                  </span>
                  {submission?.createdAt !== submission?.updatedAt && (
                    <span className=" items-center gap-1 hidden md:flex">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      Updated:
                      {getTimeDifference(
                        submission?.createdAt,
                        submission?.updatedAt
                      )}
                      later
                    </span>
                  )}
                  <span className="hidden md:flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                      />
                    </svg>
                    {submission?.totalAnwersCount}{" "}
                    {submission?.totalAnwersCount === 1 ? "Answer" : "Answers"}
                  </span>
                  <span className="text-gray-500 dark:text-gray-500">
                    ID: {submission?.id}
                  </span>
                </div>
              </div>

              {/* Answer Section */}
              {submission?.reponse ? (
                <div className="border border-gray-200/80 dark:border-gray-700/80 rounded-lg  backdrop-blur-sm shadow-sm overflow-hidden">
                  <div className="flex justify-between items-center px-4 py-2 bg-gray-50/80 dark:bg-gray-700/50 border-b border-gray-200/60 dark:border-gray-600/60">
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-green-600 dark:text-green-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Answer
                      </span>
                    </div>
                    {submission?.reponse.isFinalAnswer && (
                      <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 rounded-full font-medium flex items-center gap-1">
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
                        Final Answer
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed break-words">
                        {submission?.reponse.answer}
                      </p>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-200/60 dark:border-gray-600/60 flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                      <span className=" items-center gap-1">
                        <svg
                          className="w-3 h-3 inline md:me-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span className="hidden md:inline">Answered:</span>{" "}
                        {submission?.reponse.createdAt}
                      </span>
                      <span className="text-gray-500 dark:text-gray-500 hidden md:flex">
                        Answer ID: {submission?.reponse.id}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-gray-300/80 dark:border-gray-600/80 rounded-lg p-4  backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-sm font-medium">
                      No answer submitted yet for this question
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {isFetchingNextPage && (
            <div className="flex justify-center items-center py-6">
              <div className="flex items-center gap-3 px-4 py-2  backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/60 rounded-full shadow-sm">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                  Loading more submissions...
                </span>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};
