"use client";
import { useState } from "react";
import {
  ChevronRight,
  CheckCircle,
  XCircle,
  Edit,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/atoms/button";
import { useGetSubmissions } from "@/hooks/api/answer/useGetSubmissions";
import { DateRangeFilter } from "./DateRangeFilter";
import { Card, CardContent } from "./atoms/card";
import { Pagination } from "./pagination";
import { Badge } from "./atoms/badge";
import { parameterLabels } from "./QA-interface";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { QuestionDetails } from "./question-details";
import { useRouter } from "@tanstack/react-router";

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case "approved":
    case "accepted":
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-100 dark:border-green-800";
    case "rejected":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-100 dark:border-red-800";
    case "modify":
    case "modified":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-100 dark:border-amber-800";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-white dark:border-gray-700";
  }
};

const getStatusIcon = (status: string) => {
  switch (status?.toLowerCase()) {
    case "approved":
    case "accepted":
      return <CheckCircle className="w-4 h-4" />;
    case "rejected":
      return <XCircle className="w-4 h-4" />;
    case "modify":
    case "modified":
      return <Edit className="w-4 h-4" />;
    default:
      return <Edit className="w-4 h-4" />;
  }
};

const getTypeIcon = (type: string) => {
  return type?.toLowerCase() === "answer" ? (
    <div className="w-8 h-8 rounded bg-purple-500 flex items-center justify-center text-white text-sm font-bold">
      A
    </div>
  ) : (
    <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
      ?
    </div>
  );
};

const formatTimestamp = (iso: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const ViewContextModal = ({
  item,
  onClose,
}: {
  item: any;
  onClose: () => void;
}) => {
  const question = item?.question?.question || "No question found";

  // Determine answers
  const currentAnswer =
    item?.answer?.answer || item?.approvedAnswer?.answer || "No answer";
  const modifiedAnswer = item?.modifiedAnswer?.answer;
  const rejectedAnswer = item?.rejectedAnswer?.answer;
  const createdAnswer = item?.answer?.answer
  const reviewParams = item?.review?.parameters;
  const remark = item?.remarks || item?.reason || "";
  const authorEmail = item?.author?.email
  const title = `View Context: ${item.action}`;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-black rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>

        <div className="space-y-4">
          {/* Question */}
          <div>
            <label className="block text-sm font-medium mb-1">Question:</label>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border rounded">
              {question}
            </div>
          </div>

          {item.action === "author" && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Answer:
              </label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border rounded">
                {createdAnswer}
              </div>
            </div>
          )}

          {(item.action === "approved" || item.action === 'finalized') && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Answer:
              </label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border rounded">
                {currentAnswer}
              </div>
            </div>
          )}

          {item.action === "finalized" && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Author:
              </label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border rounded">
                {/* {author} */}
                {authorEmail}
              </div>

            </div>
          )}


          {/* Current Answer */}
          {item.action === "rejected" && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Newly Created Answer:
              </label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border rounded">
                {currentAnswer}
              </div>
            </div>
          )}

          {/* Modified / Rejected */}
          {modifiedAnswer && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Modified Answer:
              </label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border rounded">
                {modifiedAnswer}
              </div>
            </div>
          )}

          {rejectedAnswer && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Rejected Answer:
              </label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border rounded">
                {rejectedAnswer}
              </div>
            </div>
          )}

          {/* Review Params */}
          {reviewParams && (
            <div>
              <h4 className="text-sm font-medium mb-2">Review Parameters</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(reviewParams ?? {}).map(
                  ([key, value]) => (
                    <Badge
                      key={key}
                      variant="outline"
                      className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border 
                                                    ${value
                          ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
                          : "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
                        }
                                                  `}
                    >
                      {value ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}

                      {
                        parameterLabels[
                        key as keyof typeof parameterLabels
                        ]
                      }
                    </Badge>
                  )
                )}
              </div>
            </div>
          )}

          {/* Remark */}
          {remark && (
            <div>
              <label className="block text-sm font-medium mb-1">Remark:</label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border rounded">
                {remark}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default function UserActivityHistory() {
  const [dateRange, setDateRange] = useState({
    start: new Date(),
    end: new Date(),
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [selectedQuestionId,setSelectedQuestionId] = useState('')
  const { data, isLoading } = useGetSubmissions(currentPage, 5, dateRange);
    const {
      data: questionDetails,
      refetch: refechSelectedQuestion,
      isLoading: isLoadingSelectedQuestion,
    } = useGetQuestionFullDataById(selectedQuestionId);
  const goBack = () => setSelectedQuestionId('')
  const submissions = data?.data || [];
  const totalPages = data?.totalPages || 1;
  const { data: user } = useGetCurrentUser();
  const handleDialogChange = (key: string, value: any) => {
    setDateRange((prev) => ({
      ...prev,
      [key === "startTime" ? "start" : "end"]: value,
    }));
    setCurrentPage(1);
  };
  console.log('selectred ',selectedQuestionId)
  console.log('selectred ques det',questionDetails)
 
  return (
     
    <main className="min-h-screen bg-gray-50 dark:bg-black  sm:p-8">

      {(selectedQuestionId && questionDetails) &&  (
          <>
            <QuestionDetails
              question={questionDetails?.data!}
              currentUserId={questionDetails?.currentUserId!}
              refetchAnswers={refechSelectedQuestion}
              isRefetching={isLoadingSelectedQuestion}
              // goBack={() => setSelectedQuestionId("")}
              goBack={goBack}
              currentUser={user!}
            />
          </>
          )}
      <div className=" mx-auto px-6">
        <div className="mb-6 w-64">
          <DateRangeFilter
            advanceFilter={{
              startTime: dateRange.start,
              endTime: dateRange.end
            }}
            handleDialogChange={handleDialogChange}
          />
        </div>

        {/* Empty */}
        {!isLoading && submissions.length === 0 && (
          <h1 className="text-center text-gray-500 mt-10">No items found</h1>
        )}

        {/* List */}
        {!isLoading && submissions.length > 0 && (
          <>
            <div className="space-y-6">
              {submissions.map((item: any) => (
                <Card
                  key={item._id}
                  className="bg-white dark:bg-black border border-gray-200 dark:border-gray-600 rounded-lg hover:shadow-md"
                >
                  <CardContent className="px-6 p-3 grid grid-cols-[140px_min-content_110px_min-content_32px_min-content_1fr_min-content_120px] items-center gap-3">
                    {/* Timestamp */}
                    <div className="text-md text-gray-600 dark:text-gray-300">
                      {formatTimestamp(item.createdAt)}
                    </div>

                    <span className="text-gray-300">|</span>

                    {/* Status Badge */}
                    <div
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-semibold ${getStatusColor(
                        item.action
                      )}`}
                    >
                      {getStatusIcon(item.action)}
                      {item.action}
                    </div>

                    <span className="text-gray-300">|</span>

                    {/* Type Icon */}
                    <div className="flex justify-center">
                      {getTypeIcon(item.reviewType)}
                    </div>

                    <span className="text-gray-300">|</span>

                    {/* Question */}
                    <p onClick={() => setSelectedQuestionId(item.question._id)} className="text-gray-700 dark:text-gray-300 text-md truncate hover:underline cursor-pointer">
                      {item.question?.question}
                    </p>

                    <span className="text-gray-300">|</span>

                    {/* View Context */}
                    <div
                      className="flex items-center gap-1 text-sm text-green-600 cursor-pointer justify-end"
                      onClick={() => setSelectedItem(item)}
                    >
                      <span>View Context</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-8">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(p) => setCurrentPage(p)}
              />
            </div>
          </>
        )}
      </div>

      {selectedItem && (
        <ViewContextModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </main>
  );
}
