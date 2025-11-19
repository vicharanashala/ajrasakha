import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";
import { Input } from "./atoms/input";

import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  Clock,
  Edit,
  Eye,
  File,
  Flag,
  FlagTriangleRight,
  Globe,
  Info,
  Loader2,
  MessageSquareText,
  MoreVertical,
  Paperclip,
  PaperclipIcon,
  PencilLine,
  Plus,
  PlusCircle,
  RefreshCcw,
  Save,
  Search,
  Trash,
  Upload,
  X,
} from "lucide-react";

import { Pagination } from "./pagination";
import {
  AdvanceFilterDialog,
  type AdvanceFilterValues,
} from "./advanced-question-filter";
import type {
  IDetailedQuestion,
  IMyPreference,
  QuestionPriority,
  QuestionSource,
  QuestionStatus,
  UserRole,
} from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./atoms/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./atoms/dialog";
import { Textarea } from "./atoms/textarea";
import { useCreateRequest } from "@/hooks/api/request/useCreateRequest";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";
import { ScrollArea } from "./atoms/scroll-area";
import { Separator } from "./atoms/separator";
import { useDeleteQuestion } from "@/hooks/api/question/useDeleteQuestion";
import { ConfirmationModal } from "./confirmation-modal";
import { useUpdateQuestion } from "@/hooks/api/question/useUpdateQuestion";
import { useAddQuestion } from "@/hooks/api/question/useAddQuestion";
import { useCountdown } from "@/hooks/ui/useCountdown";
import { formatDate } from "@/utils/formatDate";
import { TimerDisplay } from "./timer-display";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./atoms/tooltip";

import { STATES, CROPS, DOMAINS, SEASONS } from "./MetaData";

const truncate = (s: string, n = 80) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

type QuestionsTableProps = {
  items?: IDetailedQuestion[] | null;
  onViewMore: (questionId: string) => void;
  // hasMore?: boolean;
  // isLoadingMore?: boolean;
  // lastElementRef?: (node: HTMLDivElement | null) => void;
  currentPage: number;
  setCurrentPage: (val: number) => void;
  isLoading?: boolean;
  isBulkUpload: boolean;
  totalPages: number;
  limit: number;
  uploadedQuestionsCount: number;
  userRole?: UserRole;
};
type DetailField = keyof NonNullable<IDetailedQuestion["details"]>;
const OPTIONS: Partial<Record<DetailField, string[]>> = {
  state: STATES,

  crop: CROPS,
  season: SEASONS,
  domain: DOMAINS,
};

export const QuestionsTable = ({
  items,
  onViewMore,
  limit,
  currentPage,
  setCurrentPage,
  userRole,
  isLoading,
  totalPages,
  uploadedQuestionsCount,
  isBulkUpload,
}: QuestionsTableProps) => {
  const [editOpen, setEditOpen] = useState(false);
  const [updatedData, setUpdatedData] = useState<IDetailedQuestion | null>(
    null
  );
  const [questionIdToDelete, setQuestionIdToDelete] = useState("");
  const [selectedQuestion, setSelectedQuestion] =
    useState<IDetailedQuestion | null>(null);

  const { mutateAsync: createRequest, isPending: creatingRequest } =
    useCreateRequest();

  const { mutateAsync: deleteQuestion, isPending: deletingQuestion } =
    useDeleteQuestion();

  const { mutateAsync: updateQuestion, isPending: updatingQuestion } =
    useUpdateQuestion();

  const handleUpdateQuestion = async (
    mode: "add" | "edit",
    entityId?: string,
    flagReason?: string,
    status?: QuestionStatus,
    formData?: FormData
  ) => {
    try {
      if (!entityId) {
        toast.error(`Failed to identify and ${mode} the selected question.`);
        return;
      }

      if (!updatedData) {
        // if just status update is needed then no need updatedData
        console.error("No data available to update.");
        return;
      }

      if (userRole === "expert" && !status) {
        if (!flagReason || flagReason.trim().length < 8) {
          toast.error(
            "Please provide a valid reason for flagging (minimum 8 characters)."
          );
          return;
        }

        await createRequest({
          entityId,
          requestType: "question_flag",
          updatedData,
          reason: flagReason.trim(),
        });

        toast.success(
          "Thank you for your feedback. Your flag request has been submitted successfully."
        );
        setEditOpen(false);
        return;
      }

      if (updatedData) {
        const payload: IDetailedQuestion = status
          ? { ...updatedData, status }
          : updatedData;

        await updateQuestion(payload);
      }
      if (!status) toast.success("Question updated successfully.");
      setEditOpen(false);
    } catch (error: any) {
      console.error("Error in handleUpdateQuestion:", error);
      if (!status)
        // if status is there that means, then updating question to delayed
        toast.error(
          error?.message || "An error occurred while saving. Please try again."
        );
      setEditOpen(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteQuestion(questionIdToDelete);
    } catch (error) {
      console.error("Error: ", error);
    }
  };

  return (
    <div>
      <AddOrEditQuestionDialog
        open={editOpen}
        setOpen={setEditOpen}
        setUpdatedData={setUpdatedData}
        updatedData={updatedData}
        onSave={handleUpdateQuestion}
        question={selectedQuestion!}
        userRole={userRole!}
        isLoadingAction={creatingRequest || updatingQuestion}
        mode="edit"
      />

      <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh]">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-card sticky top-0 z-10">
            <TableRow>
              <TableHead className="text-center">Sl.No</TableHead>
              <TableHead className="w-[35%] text-center">Question</TableHead>
              <TableHead className="text-center">Priority</TableHead>
              <TableHead className="text-center">State</TableHead>
              <TableHead className="text-center">Crop</TableHead>
              <TableHead className="text-center">Source</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Answers</TableHead>
              <TableHead className="text-center">Created</TableHead>
              <TableHead className="text-center">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10">
                  <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : items?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  rowSpan={10}
                  className="text-center py-10 text-muted-foreground"
                >
                  No questions found
                </TableCell>
              </TableRow>
            ) : (
              items?.map((q, idx) => (
                <QuestionRow
                  currentPage={currentPage}
                  deletingQuestion={deletingQuestion}
                  handleDelete={handleDelete}
                  idx={idx}
                  onViewMore={onViewMore}
                  q={q}
                  uploadedQuestionsCount={uploadedQuestionsCount}
                  isBulkUpload={isBulkUpload}
                  limit={limit}
                  setUpdatedData={setUpdatedData}
                  updateQuestion={handleUpdateQuestion}
                  setEditOpen={setEditOpen}
                  setQuestionIdToDelete={setQuestionIdToDelete}
                  setSelectedQuestion={setSelectedQuestion}
                  totalPages={totalPages}
                  updatingQuestion={updatingQuestion}
                  userRole={userRole!}
                  key={q._id}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => setCurrentPage(page)}
      />
    </div>
  );
};

interface QuestionRowProps {
  q: IDetailedQuestion;
  idx: number;
  currentPage: number;
  limit: number;
  uploadedQuestionsCount: number;
  isBulkUpload: boolean;
  totalPages: number;
  userRole: UserRole;
  updatingQuestion: boolean;
  deletingQuestion: boolean;
  setEditOpen: (val: boolean) => void;
  setSelectedQuestion: (q: any) => void;
  setQuestionIdToDelete: (id: string) => void;
  handleDelete: () => Promise<void>;
  setUpdatedData: React.Dispatch<
    React.SetStateAction<IDetailedQuestion | null>
  >;
  updateQuestion: (
    mode: "add" | "edit",
    entityId?: string,
    flagReason?: string,
    status?: QuestionStatus
  ) => Promise<void>;
  onViewMore: (id: string) => void;
}

const QuestionRow: React.FC<QuestionRowProps> = ({
  q,
  idx,
  currentPage,
  limit,
  userRole,
  updatingQuestion,
  uploadedQuestionsCount,
  isBulkUpload,
  deletingQuestion,
  setEditOpen,
  setSelectedQuestion,
  setQuestionIdToDelete,
  handleDelete,
  onViewMore,
}) => {
  const uploadedCountRef = useRef(uploadedQuestionsCount);

  const DURATION_HOURS = 4;
  const timer = useCountdown(q.createdAt, DURATION_HOURS, () => {});

  const totalSeconds = DURATION_HOURS * 60 * 60;

  // Parse timer string ("hh:mm:ss") to seconds
  const [h, m, s] = timer.split(":").map(Number);
  const remainingSeconds = h * 3600 + m * 60 + s;

  //  Calculate delay based on uploaded questions
  // 200 questions → 3 minutes = 180 seconds
  const delayPerQuestion = 180 / 200; // 0.9 seconds per question
  let delaySeconds = uploadedCountRef.current * delayPerQuestion;

  if (userRole === "expert") {
    delaySeconds = 200;
  }

  // For tooltip
  const delayMinutes = delaySeconds / 60;

  //  Check if enough time has passed
  const isClickable =
    remainingSeconds <= totalSeconds - delaySeconds && !isBulkUpload;

  const priorityBadge = useMemo(() => {
    if (!q.priority)
      return (
        <Badge variant="outline" className="text-muted-foreground">
          NIL
        </Badge>
      );

    const colorClass =
      q.priority === "high"
        ? "bg-red-500/10 text-red-600 border-red-500/30"
        : q.priority === "medium"
        ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
        : "bg-green-500/10 text-green-600 border-green-500/30";

    return (
      <Badge variant="outline" className={colorClass}>
        {q.priority.charAt(0).toUpperCase() + q.priority.slice(1)}
      </Badge>
    );
  }, [q.priority]);

  const statusBadge = useMemo(() => {
    // const status = q.status || "NIL";
    const effectiveStatus =
      timer === "00:00:00" && q.status == "open"
        ? "delayed"
        : q.status || "NIL";

    const formatted = effectiveStatus.replace("_", " ");

    const colorClass =
      effectiveStatus === "in-review"
        ? "bg-green-500/10 text-green-600 border-green-500/30"
        : effectiveStatus === "open"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
        : effectiveStatus === "closed"
        ? "bg-gray-500/10 text-gray-600 border-gray-500/30"
        : "bg-muted text-foreground";

    return (
      <Badge variant="outline" className={colorClass}>
        {formatted}
      </Badge>
    );
  }, [q.status, timer]);

  return (
    <TableRow key={q._id} className="text-center">
      {/* Serial Number */}
      <TableCell className="align-middle text-center" title={idx.toString()}>
        {(currentPage - 1) * limit + idx + 1}
      </TableCell>

      {/* Question Text */}
      <TableCell className="text-start ps-3 w-[35%]" title={q.question}>
        <div className="flex flex-col gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`cursor-pointer ${
                    isClickable
                      ? "hover:underline"
                      : "opacity-50 cursor-not-allowed"
                  }`}
                  onClick={() => {
                    if (!isClickable) return;
                    onViewMore(q._id?.toString() || "");
                  }}
                >
                  {truncate(q.question, 60)}
                </span>
              </TooltipTrigger>
              {!isClickable && (
                <TooltipContent side="top">
                  <p>
                    The question is currently being processed. Expert allocation
                    is underway and may take{" "}
                    {delayMinutes < 1
                      ? "less than 1 minute"
                      : `up to ${Math.ceil(delayMinutes)} ${
                          Math.ceil(delayMinutes) === 1 ? "minute" : "minutes"
                        }`}{" "}
                    to complete.
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {q.status !== "delayed" && (
            <TimerDisplay timer={timer} status={q.status} />
          )}
        </div>
      </TableCell>

      {/* Priority */}
      <TableCell className="align-middle text-center">
        {priorityBadge}
      </TableCell>

      {/* Details */}
      <TableCell className="align-middle">
        {" "}
        {truncate(q.details.state, 10)}
      </TableCell>
      <TableCell className="align-middle">
        {truncate(q.details.crop, 10)}
      </TableCell>

      {/* Source */}
      <TableCell className="align-middle">
        <Badge variant="outline">{q.source}</Badge>
      </TableCell>

      {/* Status */}
      <TableCell className="align-middle">{statusBadge}</TableCell>

      {/* Total Answers */}
      <TableCell className="align-middle">{q.totalAnswersCount}</TableCell>

      <TableCell className="align-middle">
        {formatDate(new Date(q.createdAt!), false)}
      </TableCell>

      {/* Actions */}
      <TableCell className="align-middle">
        <div className="flex justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="p-1"
                disabled={!isClickable}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => onViewMore(q._id?.toString() || "")}
                className="hover:bg-primary/10"
              >
                <Eye className="w-4 h-4 mr-2 text-primary" />
                View
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {userRole === "expert" ? (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setSelectedQuestion(q);
                    setEditOpen(true);
                  }}
                >
                  <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
                  Raise Flag
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setSelectedQuestion(q);
                      setEditOpen(true);
                    }}
                  >
                    <Edit className="w-4 h-4 mr-2 text-blue-500" />
                    {updatingQuestion ? "Editing..." : "Edit"}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setQuestionIdToDelete(q._id!);
                    }}
                  >
                    <ConfirmationModal
                      title="Delete Question Permanently?"
                      description="Are you sure you want to delete this question? This action is irreversible and will also remove all related data, including submissions, answers, and flag requests."
                      confirmText="Delete"
                      cancelText="Cancel"
                      isLoading={deletingQuestion}
                      type="delete"
                      onConfirm={handleDelete}
                      trigger={
                        <button className="flex justify-center items-center gap-2">
                          <Trash className="w-4 h-4 mr-2 text-red-500" />
                          {deletingQuestion ? "Deleting..." : "Delete"}
                        </button>
                      }
                    />
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};

interface AddOrEditQuestionDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  updatedData: IDetailedQuestion | null;
  setUpdatedData: React.Dispatch<
    React.SetStateAction<IDetailedQuestion | null>
  >;
  onSave?: (
    mode: "add" | "edit",
    entityId?: string,
    flagReason?: string,
    status?: QuestionStatus,
    formData?: FormData
  ) => void;
  question?: IDetailedQuestion | null;
  userRole: UserRole;
  isLoadingAction: boolean;
  mode: "add" | "edit";
}

export const AddOrEditQuestionDialog = ({
  open,
  setOpen,
  updatedData,
  setUpdatedData,
  onSave,
  question,
  userRole,
  isLoadingAction,
  mode,
}: AddOrEditQuestionDialogProps) => {
  const [flagReason, setFlagReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (mode === "edit" && question) {
      setUpdatedData(question);
    } else if (mode === "add") {
      setUpdatedData({
        question: "",
        priority: "medium",
        source: "AGRI_EXPERT",
        details: {
          state: "",
          district: "",
          crop: "",
          season: "",
          domain: "",
        },
      } as IDetailedQuestion);
    }
  }, [question, mode]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "add" ? (
              <>
                <PlusCircle
                  className="h-5 w-5 text-green-500"
                  aria-hidden="true"
                />
                <span>Add New Question</span>
              </>
            ) : userRole === "expert" ? (
              <>
                <AlertCircle
                  className="h-5 w-5 text-destructive"
                  aria-hidden="true"
                />
                <span>Raise Flag & Suggest Edit</span>
              </>
            ) : (
              <>
                <PencilLine
                  className="h-5 w-5 text-blue-500"
                  aria-hidden="true"
                />
                <span>Edit Question</span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="h-[420px] ">
          {file ? (
            // File preview: center content
            <div className="flex items-center justify-center h-full p-4">
              <div className="relative w-full max-w-md">
                <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full border-4 border-background flex items-center justify-center bg-green-600 z-10">
                  <Check className="h-5 w-5 text-white" />
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="absolute top-0 left-0 w-10 h-10 rounded-full  flex items-center justify-center  z-10 cursor-pointer transition-colors">
                        <Info className="h-5 w-5 text-white" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      align="start"
                      className="max-w-xs text-sm"
                    >
                      Before submitting the JSON file, ensure all required
                      fields are present. Any question already existing in the
                      database will be skipped automatically.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div className="relative overflow-hidden rounded-xl border-2 border-border bg-card shadow-lg transition-all hover:shadow-xl">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-50" />

                  <div className="relative p-8 space-y-6">
                    <div className="flex justify-center">
                      <div className="relative">
                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
                        <div className="relative w-20 h-20 rounded-full border-2 border-border bg-background flex items-center justify-center">
                          <File className="h-10 w-10 text-primary" />
                        </div>
                      </div>
                    </div>

                    <div className="text-center space-y-2">
                      <p className="text-lg font-semibold text-foreground truncate px-4">
                        {file.name}
                      </p>
                      {file.size && (
                        <p className="text-sm text-muted-foreground">
                          {(file.size / 1024).toFixed(2)} KB
                        </p>
                      )}
                    </div>

                    <div className="flex justify-center">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-border bg-background">
                        {file.name.split(".").pop()?.toUpperCase() || "FILE"}
                      </span>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setFile(null)}
                        className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive dark:text-red-800"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full pr-4">
              <div className="grid gap-4 p-2">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                    <label>Question Text*</label>
                  </div>
                  <Textarea
                    placeholder="Enter question text"
                    value={updatedData?.question || ""}
                    onChange={(e) =>
                      setUpdatedData((prev) =>
                        prev ? { ...prev, question: e.target.value } : prev
                      )
                    }
                    rows={3}
                  />
                  {mode === "add" && (
                    <>
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Info className="h-4 w-4" aria-hidden="true" />
                        <label>Context</label>
                      </div>

                      <Textarea
                        placeholder="Mention the context for this question...."
                        value={updatedData?.context || ""}
                        onChange={(e) =>
                          setUpdatedData((prev) =>
                            prev ? { ...prev, context: e.target.value } : prev
                          )
                        }
                        className="h-32 resize-none overflow-y-auto"
                      />
                    </>
                  )}
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <FlagTriangleRight className="h-4 w-4" aria-hidden="true" />
                    <label>Priority*</label>
                  </div>
                  <Select
                    value={updatedData?.priority || "medium"}
                    onValueChange={(v) =>
                      setUpdatedData((prev) =>
                        prev
                          ? { ...prev, priority: v as QuestionPriority }
                          : prev
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  {userRole !== "expert" &&
                    mode == "edit" &&
                    question?.status !== "closed" && (
                      <>
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <CheckCircle className="h-4 w-4" aria-hidden="true" />
                          <label>Status*</label>
                        </div>
                        <Select
                          value={updatedData?.status || "open"}
                          onValueChange={(v) =>
                            setUpdatedData((prev) =>
                              prev
                                ? { ...prev, status: v as QuestionStatus }
                                : prev
                            )
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in-review">In review</SelectItem>
                            <SelectItem value="delayed">Delayed</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </>
                    )}
                  {/* <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  <label>Source*</label>
                </div> */}
                  {/* <Select
                  value={updatedData?.source || "AJRASAKHA"}
                  onValueChange={(v) =>
                    setUpdatedData((prev) =>
                      prev ? { ...prev, source: v as QuestionSource } : prev
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AJRASAKHA">AJRASAKHA</SelectItem>
                    <SelectItem value="AGRI_EXPERT">AGRI_EXPERT</SelectItem>
                  </SelectContent>
                </Select> */}

                  {(
                    [
                      "state",
                      "district",
                      "crop",
                      "season",
                      "domain",
                    ] as DetailField[]
                  ).map((field) => {
                    return (
                      <div key={field} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <label>
                            {field.charAt(0).toUpperCase() + field.slice(1)}*
                          </label>
                        </div>
                        {/* <Input
                        type="text"
                        value={updatedData?.details?.[field] || ""}
                        onChange={(e) =>
                          setUpdatedData((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  details: {
                                    ...prev.details,
                                    [field]: e.target.value,
                                  },
                                }
                              : prev
                          )
                        }
                      />*/}
                        {OPTIONS[field] ? (
                          <Select
                            value={
                              updatedData?.details?.[field]?.trim()
                                ? updatedData.details[field]
                                : undefined
                            }
                            onValueChange={(val) =>
                              setUpdatedData((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      details: {
                                        ...prev.details,
                                        [field]: val,
                                      },
                                    }
                                  : prev
                              )
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={`Select ${field}`} />
                            </SelectTrigger>

                            <SelectContent>
                              {OPTIONS[field]?.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="text"
                            value={updatedData?.details?.district || ""}
                            onChange={(e) =>
                              setUpdatedData((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      details: {
                                        ...prev.details,
                                        district: e.target.value,
                                      },
                                    }
                                  : prev
                              )
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {userRole === "expert" && mode === "edit" && (
                  <>
                    <Separator className="my-4" />
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <AlertCircle
                        className="h-4 w-4 text-destructive"
                        aria-hidden="true"
                      />
                      <label>Reason for Flagging*</label>
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <Textarea
                        placeholder="Enter your reason for flagging..."
                        value={flagReason}
                        onChange={(e) => setFlagReason(e.target.value)}
                        className="h-32 resize-none overflow-y-auto"
                      />
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="flex justify-end gap-2">
          {/* <X className="mr-2 h-4 w-4" aria-hidden="true" />  */}
          {mode === "add" ? (
            <>
              <input
                type="file"
                id="upload-json"
                accept=".json,.xls, .xlsx, application/json, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  let input = e.target;
                  const selected = e.target.files?.[0];
                  if (selected) setFile(selected);
                  setError(null);
                  const allowedTypes = [
                    "application/json",
                    "application/vnd.ms-excel",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                  ];

                  if (!selected || !allowedTypes.includes(selected.type)) {
                    setError("Only JSON And EXCEL files are allowed.");
                    setFile(null);
                    setTimeout(() => {
                      setError(null);
                    }, 2000);
                    input.value = "";
                    return;
                  }
                  const maxSize = 5 * 1024 * 1024;
                  if (selected.size > maxSize) {
                    setError("File size must be less than 5MB.");
                    setFile(null);
                    setTimeout(() => {
                      setError(null);
                    }, 2000);
                    input.value = "";
                    return;
                  }
                  setFile(selected);
                  input.value = "";
                }}
              />

              <label htmlFor="upload-json">
                <Button
                  asChild
                  variant="default"
                  className="bg-dark hover:bg-dark  cursor-pointer flex items-center gap-2"
                >
                  <span className="flex items-center gap-2">
                    {file ? (
                      <>
                        {/* <Attachment className="h-4 w-4" /> Show attachment icon */}
                        <PaperclipIcon className="h-4 w-4" />
                        <span
                          className="truncate text-sm text-muted-foreground"
                          title={file.name}
                        >
                          {truncate(file.name, 20)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setFile(null); // Remove file
                          }}
                          className="ml-2 text-dark "
                        >
                          <X className="h-4 w-4 text-dark dark:text-white" />
                        </button>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" /> Upload FILE
                      </>
                    )}
                  </span>
                </Button>
              </label>

              {error && <p className="text-red-500 text-sm mt-1">{error}</p>}

              <Button variant="outline" onClick={() => setOpen(false)}>
                <X className="mr-2 h-4 w-4" aria-hidden="true" />
                Cancel
              </Button>

              <Button
                variant="default"
                onClick={() => {
                  if (file) {
                    const formData = new FormData();
                    formData.append("file", file);
                    onSave?.("add", undefined, undefined, undefined, formData);
                    setFile(null);
                  } else {
                    onSave?.("add");
                  }
                }}
              >
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                {isLoadingAction ? "Adding..." : "Add Question"}
              </Button>
            </>
          ) : userRole === "expert" ? (
            <Button
              variant="destructive"
              onClick={() => {
                onSave?.("edit", question?._id!, flagReason);
              }}
            >
              <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
              {isLoadingAction ? "Submitting..." : "Submit"}
            </Button>
          ) : (
            <Button
              variant="default"
              onClick={() => {
                onSave?.("edit", question?._id!);
              }}
            >
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {isLoadingAction ? "Saving..." : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type QuestionsFiltersProps = {
  search: string;
  states: string[];
  onChange: (next: AdvanceFilterValues) => void;
  crops: string[];
  onReset: () => void;
  setSearch: (val: string) => void;
  setUploadedQuestionsCount: (val: number) => void;
  setIsBulkUpload: (val: boolean) => void;

  refetch: () => void;
  totalQuestions: number;
  userRole: UserRole;
};

export const QuestionsFilters = ({
  search,
  setSearch,
  setUploadedQuestionsCount,
  setIsBulkUpload,
  crops,
  states,
  onChange,
  onReset,
  refetch,
  totalQuestions,
  userRole,
}: QuestionsFiltersProps) => {
  const [advanceFilter, setAdvanceFilterValues] = useState<AdvanceFilterValues>(
    {
      status: "all",
      source: "all",
      state: "all",
      answersCount: [0, 100],
      dateRange: "all",
      crop: "all",
      priority: "all",
      domain: "all",
      user: "all",
    }
  );
  const [addOpen, setAddOpen] = useState(false);
  const [updatedData, setUpdatedData] = useState<IDetailedQuestion | null>(
    null
  );

  const { mutateAsync: addQuestion, isPending: addingQuestion } =
    useAddQuestion((count, isBulkUpload) => {
      setUploadedQuestionsCount(count);
      setIsBulkUpload(isBulkUpload);
    });

  const handleAddQuestion = async (
    mode: "add" | "edit",
    entityId?: string,
    flagReason?: string,
    status?: QuestionStatus,
    formData?: FormData
  ) => {
    try {
      if (mode !== "add") return;
      if (formData) {
        await addQuestion(formData as any);
        // toast.success('File Uploaded succesfully')
        setAddOpen(false);
        return;
      }
      if (!updatedData) {
        toast.error("No data found to add. Please try again!");
        return;
      }

      const payload = {
        question: updatedData.question?.trim() ?? "",
        priority: updatedData.priority ?? "medium",
        source: "AGRI_EXPERT" as QuestionSource,
        details: updatedData.details,
        context: updatedData.context || "",
      };

      if (!payload.question) {
        toast.error("Please enter a question before submitting.");
        return;
      }
      if (payload.question.length < 10) {
        toast.error("Question must be at least 10 characters long.");
        return;
      }

      if (!payload.priority) {
        toast.error("Please select a priority (Low, Medium, or High).");
        return;
      }
      if (!["low", "medium", "high"].includes(payload.priority)) {
        toast.error(
          "Invalid priority value. Please reselect from the options."
        );
        return;
      }

      if (!payload.source) {
        toast.error("Please select a source (AJRASAKHA or AGRI_EXPERT).");
        return;
      }
      if (!["AJRASAKHA", "AGRI_EXPERT"].includes(payload.source)) {
        toast.error(
          "Invalid source selected. Please reselect from the options."
        );
        return;
      }

      if (!payload.details) {
        toast.error("Please fill in the question details.");
        return;
      }

      const { state, district, crop, season, domain } = payload.details;
      console.log("the payload deatils=====", payload);

      if (!state?.trim()) {
        toast.error("Please Select the State field.");
        return;
      }

      if (!district?.trim()) {
        toast.error("Please enter the District field.");
        return;
      }

      if (!crop?.trim()) {
        toast.error("Please Select the Crop field.");
        return;
      }

      if (!season?.trim()) {
        toast.error("Please Select the Season field.");
        return;
      }

      if (!domain?.trim()) {
        toast.error("Please Select the Domain field.");
        return;
      }

      await addQuestion(payload);
      // toast.success("Question added successfully.");
      setAddOpen(false);
    } catch (error) {
      console.error("Error in handleAddQuestion:", error);
      // toast.error("An unexpected error occurred. Please try again.");
      setAddOpen(false);
    }
  };

  const handleDialogChange = (key: string, value: any) => {
    setAdvanceFilterValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = (myPreference?: IMyPreference) => {
    onChange({
      status: advanceFilter.status,
      source: advanceFilter.source,
      state: myPreference?.state || advanceFilter.state,
      crop: myPreference?.crop || advanceFilter.crop,
      answersCount: advanceFilter.answersCount,
      dateRange: advanceFilter.dateRange,
      priority: advanceFilter.priority,
      domain: myPreference?.domain || advanceFilter.domain,
      user: advanceFilter.user,
    });
  };

  const activeFiltersCount = Object.values(advanceFilter).filter(
    (v) => v !== "all" && !(Array.isArray(v) && v[0] === 0 && v[1] === 100)
  ).length;

  return (
    <div className="flex flex-wrap items-center justify-between w-full p-4 gap-3 border-b bg-card rounded">
      <AddOrEditQuestionDialog
        open={addOpen}
        setOpen={setAddOpen}
        setUpdatedData={setUpdatedData}
        updatedData={updatedData}
        onSave={handleAddQuestion}
        userRole={userRole!}
        isLoadingAction={addingQuestion}
        mode="add"
      />

      <div className="flex-1 min-w-[200px] max-w-[400px]">
        <div className="relative w-full">
          {/* Search Icon */}
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

          {/* Input Field */}
          <Input
            placeholder="Search questions by id, state, crops..."
            value={search}
            onChange={(e) => {
              if (userRole !== "expert") onReset(); // Reset filters on search change for non-experts
              setSearch(e.target.value);
            }}
            className="pl-9 pr-9 bg-background"
          />

          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-end w-full sm:w-auto">
        <AdvanceFilterDialog
          advanceFilter={advanceFilter}
          setAdvanceFilterValues={setAdvanceFilterValues}
          handleDialogChange={handleDialogChange}
          handleApplyFilters={handleApplyFilters}
          normalizedStates={states}
          crops={crops}
          activeFiltersCount={activeFiltersCount}
          onReset={onReset}
          isForQA={false}
        />

        <Button
          variant="outline"
          size="icon"
          className="flex-none w-12 p-3 sm:w-auto"
          onClick={refetch}
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>

        {userRole !== "expert" && (
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add Question
          </Button>
        )}

        <span className="ml-4 text-sm text-muted-foreground">
          Total Questions: {totalQuestions}
        </span>
      </div>
    </div>
  );
};
