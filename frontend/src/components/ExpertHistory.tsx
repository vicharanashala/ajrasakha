"use client";
import { useState } from "react";
import {
  ChevronRight,
  CheckCircle,
  XCircle,
  Edit,
  X,
  Check,
  AlertCircle,
  Clock,
  FileText,
  Pencil,
  User,
} from "lucide-react";
import { useGetSubmissions } from "@/hooks/api/answer/useGetSubmissions";
import { DateRangeFilter } from "./DateRangeFilter";
import { Card, CardContent } from "./atoms/card";
import { Pagination } from "./pagination";
import { Badge } from "./atoms/badge";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { QuestionDetails } from "./question-details";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./atoms/dialog";
import { ScrollArea } from "./atoms/scroll-area";

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
  open,
  onClose,
}: {
  item: any;
  open: boolean;
  onClose: () => void;
}) => {
  if (!item) return null;

  const question = item?.question?.question || "No question found";

  const currentAnswer =
    item?.answer?.answer || item?.approvedAnswer?.answer || "No answer";

  const createdAnswer = item?.answer?.answer;
  const modifiedAnswer = item?.modifiedAnswer?.answer;
  const rejectedAnswer = item?.rejectedAnswer?.answer;
  const authorEmail = item?.author?.email;
  const remark = item?.remarks || item?.reason || "";
  const reviewParams = item?.review?.parameters;

  const isRejected = item.action === "rejected";

  const actionTitleMap: Record<string, string> = {
    author: "Answer Creation",
    approved: "Approved Answer",
    finalized: "Finalized Answer",
    rejected: "Rejected Answer",
    modified: "Modified Answer",
    rerouted:"ReRoute Answer",
    reroute_approved:"ReRoute Approved Answer",
    reroute_rejected:"ReRoute Rejected Answer",
    reroute_modified:"ReRoute Modified Answer",
    moderator_rejected:"ReRoute Rejected By Moderator",
    expert_rejected:"ReRoute Rejected By Expert",
    reroute_created_answer:"ReRoute Created Answer"

  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-[90vw] max-w-6xl flex flex-col"
        style={{ maxWidth: "70vw" }}
      >
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl font-semibold">
            {actionTitleMap[item.action] || "View Context"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 h-[85vh]">
          <div className="space-y-6 p-4 text-sm">
            {/* ====================== QUESTION ====================== */}
            <div>
              <p className="text-sm font-medium mb-1">Question</p>
              <div className="rounded-lg border bg-muted/30 p-3 leading-relaxed">
                {question}
              </div>
            </div>

            {/* ====================== CREATED ANSWER ====================== */}
            {(item.action === "author") && createdAnswer && (
              <div>
                <p className="text-sm font-medium mb-1">Submitted Answer</p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  {createdAnswer}
                </div>
              </div>
            )}
            {/* ====================== ReRouted ANSWER ====================== */}
            {(item.action === "rerouted") && createdAnswer && (
              <div>
                <p className="text-sm font-medium mb-1">ReRouted Answer</p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  {createdAnswer}
                </div>
              </div>
            )}
            {/* ====================== AUTHOR (FOR Rerouted) ====================== */}
            {item.action === "rerouted" && authorEmail && (
              <div>
                <p className="text-sm font-medium mb-1">Author</p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  {authorEmail}
                </div>
              </div>
            )}

            {/* ====================== CURRENT ANSWER ====================== */}
            {(item.action === "approved" ||
              item.action === "finalized" ||
              item.action === "rejected"||item.action=="reroute_approved") && (
              <div>
                <p className="text-sm font-medium mb-1">Answer</p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  {currentAnswer}
                </div>
              </div>
            )}

            {/* ====================== AUTHOR (FOR FINALIZED) ====================== */}
            {item.action === "finalized" && authorEmail && (
              <div>
                <p className="text-sm font-medium mb-1">Author</p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  {authorEmail}
                </div>
              </div>
            )}

            {/* ====================== MODIFIED ANSWER ====================== */}
            {modifiedAnswer && (
              <div>
                <p className="text-sm font-medium mb-1">Modified Answer</p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  {modifiedAnswer}
                </div>
              </div>
            )}

            {/* ====================== REJECTED ANSWER ====================== */}
            {rejectedAnswer && item.activityType!="reroute" && (
              <div>
                <p className="text-sm font-medium mb-1">Rejected Answer</p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  {rejectedAnswer}
                </div>
              </div>
            )}
             {/* ====================== REJECTED ANSWER ====================== */}
             {rejectedAnswer && item.activityType=="reroute"&& (
              <div>
                <p className="text-sm font-medium mb-1">Created Answer</p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  {rejectedAnswer}
                </div>
              </div>
            )}


            {/* ====================== REJECTION BANNER ====================== */}
            {isRejected && (
              <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-700 dark:text-red-400">
                      Rejection Reason
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap mt-1">
                      {remark}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ====================== REVIEW PARAMETERS ====================== */}
            {reviewParams && (
              <div>
                <p className="text-sm font-medium mb-2">Review Parameters</p>

                <div className="flex flex-wrap gap-2">
                  {Object.entries(reviewParams).map(([key, value]) => (
                    <Badge
                      key={key}
                      variant="outline"
                      className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border 
                        ${
                          value
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
                      {key}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* ====================== REMARKS ====================== */}
            {remark && !isRejected && (
              <div>
                <p className="text-sm font-medium mb-1">Remarks</p>
                <div className="rounded-lg border bg-muted/30 p-3 whitespace-pre-wrap">
                  {remark}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" />
            Close
          </Button>
        </div> */}
      </DialogContent>
    </Dialog>
  );
};

export default function UserActivityHistory({
  selectedHistoryId,
}: {
  selectedHistoryId: string | null;
}) {
  const [dateRange, setDateRange] = useState({
    // start: new Date(),
    start: undefined,
    end: undefined,
    // end: new Date(),
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const { data, isLoading } = useGetSubmissions(currentPage, 5, dateRange,selectedHistoryId?.toString());
  const {
    data: questionDetails,
    refetch: refechSelectedQuestion,
    isLoading: isLoadingSelectedQuestion,
  } = useGetQuestionFullDataById(selectedQuestionId);
  const goBack = () => setSelectedQuestionId("");
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

  return (
    <main className="min-h-screen   sm:p-8 ">
      {selectedQuestionId && questionDetails ? (
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
      ):
      (
      <div className=" mx-auto px-6">
        <div className="mb-6 w-64">
          <DateRangeFilter
            advanceFilter={{
              startTime: dateRange.start,
              endTime: dateRange.end,
            }}
            handleDialogChange={handleDialogChange}
          />
        </div>

        {/* Empty */}
        {!isLoading && submissions.length === 0 && (
          <h1 className="text-center text-gray-500 mt-10">
            You don’t have any activity
          </h1>
        )}

        {/* List */}
        {!isLoading && submissions.length > 0 && (
          <>
            <div className="space-y-4 ">
              {submissions.map((item: any,ind:number) => (
                <Card key={ind} className="bg-card rounded-2xl  shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden group hover:-translate-y-0.5">
                  <CardContent className="p-0">
                    <div className="px-4 sm:px-6  bg-card border-b border-gray-100 dark:border-gray-800 backdrop-blur-sm">
                      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium bg-card px-3 py-1.5 rounded-lg shadow-xs w-full sm:w-auto">
                          <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="text-xs sm:text-sm truncate">
                            {formatTimestamp(item.createdAt)}
                          </span>
                        </div>

                        <Badge
                          variant="outline"
                          className={`
                  w-full sm:w-auto justify-center
                  ${
                    (item.action === "accepted" || item.action==='approved'||item.action==='reroute_approved')
                      ? "border-green-600 text-green-600"
                      : item.action === "rejected"||item.action==='reroute_rejected'||item.action==='moderator_rejected'||item.action==='expert_rejected'
                      ? "border-red-600 text-red-600"
                      : item.action === "author"
                      ? "rounded-full bg-blue-100 text-blue-700 font-semibold"
                      : item.action === "reroute_created_answer"?
                      "rounded-full bg-blue-100 text-blue-700 font-semibold"
                      :
                "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700"
                  }
                `}
                        >
                          <span className="flex items-center gap-1">
                            {item.action === "accepted" || item.action ==='approved' ||item.action==='reroute_approved' && (
                              <>
                                <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
                                <span>Accepted</span>
                              </>
                            )}
                            {(item.action === "rejected" ||item.action==='reroute_rejected') && (
                              <>
                                <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                                <span>Rejected</span>
                              </>
                            )}
                             {item.action==='moderator_rejected' && (
                              <>
                                <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                                <span> Moderator Rejected</span>
                              </>
                            )}
                            {item.action==='reroute_created_answer' && (
                              <>
                                <User className="w-3 h-3 text-gray-700 dark:text-gray-400" />
                                <span> ReRoute Created Answer</span>
                              </>
                            )}
                            {item.action==='expert_rejected' && (
                              <>
                                <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                                <span> Expert Rejected</span>
                              </>
                            )}
                            {item.action === "modified" ||item.action==='reroute_modified' && (
                              <>
                                <Pencil className="w-3 h-3 text-orange-700 dark:text-orange-400" />
                                <span>Modified</span>
                              </>
                            )}
                            {item.action === "author" && (
                              <>
                                <User className="w-3 h-3 text-gray-700 dark:text-gray-400" />
                                <span>Author</span>
                              </>
                            )}
                          </span>
                        </Badge>
                      </div>
                    </div>

                    <div className="px-4 sm:px-6 py-4 sm:py-5">
                      <div className="flex flex-col lg:flex-row items-start gap-4 lg:gap-6">
                        <div className="flex-1 min-w-0 w-full">
                          <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Question
                            </span>
                          </div>

                          <div
                            onClick={() =>
                              setSelectedQuestionId(item.question._id)
                            }
                            className="group/question cursor-pointer p-3 sm:p-4 rounded-xl bg-card shadow-xs dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-100 dark:border-gray-800 hover:border-green-200 dark:hover:border-green-800 hover:shadow-lg transition-all duration-300 hover:scale-[1.00]"
                          >
                            <p className="text-base sm:text-lg text-gray-900  dark:text-gray-100 font-semibold leading-relaxed transition-colors duration-300 line-clamp-3">
                              {item.question?.question}
                            </p>

                            <div className="flex items-center gap-1 mt-3 opacity-0 group-hover/question:opacity-100 transition-opacity duration-300">
                              <span className="text-xs font-medium text-primary">
                                Click to view details
                              </span>
                              <ChevronRight className="w-3 h-3 text-primary" />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-stretch lg:items-end gap-3 w-full lg:w-auto lg:flex-shrink-0 lg:pt-8">
                          <button
                            onClick={() => setSelectedItem(item)}
                            className="group/btn relative flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-xl shadow-lg hover:shadow-xl hover:shadow-green-500/25 transition-all duration-300 hover:scale-105 overflow-hidden w-full lg:w-auto"
                          >
                            <div className="absolute inset-0 bg-primary" />
                            <span className="relative text-black dark:text-white">
                              View Context
                            </span>
                            <ChevronRight className="w-4 h-4 relative group-hover/btn:translate-x-0.5 transition-transform duration-300 text-black dark:text-white" />
                          </button>

                          <div className="text-xs text-gray-500 dark:text-gray-400 text-center lg:text-right">
                            Full submission details
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {!isLoading && submissions.length > 0 && totalPages > 1 && (
              <div className="mt-8">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={(p) => setCurrentPage(p)}
                />
              </div>
            )}
          </>
        )}
      </div>
      )}


      {selectedItem && (
        <ViewContextModal
          item={selectedItem}
          open={!!selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </main>
  );
}
