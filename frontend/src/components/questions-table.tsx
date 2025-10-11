import { useCallback, useEffect, useMemo, useState } from "react";
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
  Activity,
  AlertCircle,
  CalendarClock,
  Edit,
  Eye,
  Flag,
  FlagTriangleRight,
  Globe,
  Hash,
  Loader2,
  Map,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  MoreVertical,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Sprout,
  Trash,
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
  IQuestion,
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
import toast from "react-hot-toast";
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

// export type QuestionStatus = "open" | "answered" | "closed";

// export interface IQuestion {
//   _id?: string;
//   userId: string;
//   question: string;
//   context: string;
//   status: QuestionStatus;
//   totalAnswersCount: number;
//   details: {
//     state: string;
//     district: string;
//     crop: string;
//     season: string;
//     domain: string;
//   };
//   source: "AJRASAKHA" | "AGRI_EXPERT";
//   createdAt?: string;
//   updatedAt?: string;
// }
const truncate = (s: string, n = 80) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

const formatDate = (d?: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date
    ? new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(date)
    : "";
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
  totalPages: number;
  userRole?: UserRole;
};
type DetailField = keyof NonNullable<IDetailedQuestion["details"]>;

export const QuestionsTable = ({
  items,
  onViewMore,
  // lastElementRef,
  currentPage,
  setCurrentPage,
  userRole,
  isLoading,
  totalPages,
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
    entityId: string,
    flagReason?: string
  ) => {
    try {
      if (userRole == "expert") {
        if (!flagReason || flagReason.length < 8) {
          toast.error(
            "Enter a proper reason for flagging, atleast 8 characters required!"
          );
          return;
        }
        await createRequest({
          entityId,
          requestType: "question_flag",
          updatedData: updatedData,
          reason: flagReason,
        });
        toast.success(
          "Thank you for your feedback. Your response has been successfully recorded."
        );
      } else {
        if (!updatedData) {
          return;
        }
        await updateQuestion(updatedData);
        toast.success("Question updated successfully.");
      }
      setEditOpen(false);
    } catch (error) {
      toast.error("Failed to save , try again!");
      setEditOpen(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteQuestion(questionIdToDelete);
    } catch (error) {
      console.log("Error: ", error);
    }
  };
  return (
    <div>
      <EditQuestionDialog
        editOpen={editOpen}
        setEditOpen={setEditOpen}
        setUpdatedData={setUpdatedData}
        updatedData={updatedData}
        onSave={handleUpdateQuestion}
        question={selectedQuestion!}
        userRole={userRole!}
        isLoadingAction={creatingRequest}
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
              items?.map((q, idx) => {
                // const isSecondLastItem = idx === items?.length - 2;
                return (
                  <TableRow
                    key={q._id}
                    className="text-center"
                    // ref={isSecondLastItem ? lastElementRef : null}
                  >
                    <TableCell
                      className="align-middle text-center"
                      title={idx.toString()}
                    >
                      {(currentPage - 1) * totalPages + idx + 1}
                    </TableCell>
                    <TableCell
                      className="text-start ps-3 w-[35%]"
                      title={q.question}
                    >
                      <span
                        className="cursor-pointer hover:underline"
                        onClick={() => onViewMore(q._id?.toString() || "")}
                      >
                        {truncate(q.question, 90)}
                      </span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      {q.priority ? (
                        <Badge
                          variant={
                            q.priority === "high"
                              ? "destructive"
                              : q.priority === "medium"
                              ? "secondary"
                              : "outline"
                          }
                          className={
                            q.priority === "high"
                              ? "bg-red-500/10 text-red-600 border-red-500/30"
                              : q.priority === "medium"
                              ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                              : "bg-green-500/10 text-green-600 border-green-500/30"
                          }
                        >
                          {q.priority.charAt(0).toUpperCase() +
                            q.priority.slice(1)}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          NIL
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="align-middle">
                      {q.details.state}
                    </TableCell>
                    <TableCell className="align-middle">
                      {q.details.crop}
                    </TableCell>
                    <TableCell className="align-middle">
                      <Badge variant="outline">{q.source}</Badge>
                    </TableCell>
                    <TableCell className="align-middle">
                      <Badge
                        variant={
                          q.status === "answered"
                            ? "secondary"
                            : q.status === "open"
                            ? "outline"
                            : q.status === "closed"
                            ? "destructive"
                            : "outline"
                        }
                        className={
                          q.status === "answered"
                            ? "bg-green-500/10 text-green-600 border-green-500/30"
                            : q.status === "open"
                            ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                            : q.status === "closed"
                            ? "bg-gray-500/10 text-gray-600 border-gray-500/30"
                            : "bg-muted text-foreground"
                        }
                      >
                        {q.status ? q.status.replace("_", " ") : "NIL"}
                      </Badge>
                    </TableCell>

                    <TableCell className="align-middle">
                      {q.totalAnswersCount}
                    </TableCell>
                    <TableCell className="align-middle">
                      {formatDate(q.createdAt)}
                    </TableCell>
                    <TableCell className="align-middle">
                      <div className="flex justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="p-1">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() =>
                                onViewMore(q._id?.toString() || "")
                              }
                              className="hover:bg-primary/10"
                            >
                              <Eye className="w-4 h-4 mr-2 text-primary" />
                              View
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {userRole === "expert" ? (
                              <>
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
                              </>
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
                                    onConfirm={async () => {
                                      await handleDelete();
                                    }}
                                    trigger={
                                      <button className="flex justify-center items-center gap-2">
                                        <Trash className="w-4 h-4 mr-2 text-red-500" />
                                        {deletingQuestion
                                          ? "Deleting..."
                                          : "Delete"}
                                      </button>
                                    }
                                  />
                                  {/* <Trash className="w-4 h-4 mr-2 text-red-500" />
                                  Delete */}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
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

interface EditQuestionDialogProps {
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  updatedData: IDetailedQuestion | null;
  setUpdatedData: React.Dispatch<
    React.SetStateAction<IDetailedQuestion | null>
  >;
  onSave?: (entityId: string, flagReason?: string) => void;
  question: IDetailedQuestion;
  userRole: UserRole;
  isLoadingAction: boolean;
}

export const EditQuestionDialog = ({
  editOpen,
  setEditOpen,
  updatedData,
  setUpdatedData,
  onSave,
  question,
  userRole,
  isLoadingAction,
}: EditQuestionDialogProps) => {
  const [flagReason, setFlagReason] = useState("");

  useEffect(() => {
    setUpdatedData(question);
  }, [question]);

  return (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent className="sm:max-w-xl ">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {userRole === "expert" ? (
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
          <ScrollArea className="h-full pr-4">
            <div className="grid gap-4 p-2">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                  <label>Question Text</label>
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

                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FlagTriangleRight className="h-4 w-4" aria-hidden="true" />
                  <label>Priority</label>
                </div>
                <Select
                  value={updatedData?.priority || "medium"}
                  onValueChange={(v) =>
                    setUpdatedData((prev) =>
                      prev ? { ...prev, priority: v as QuestionPriority } : prev
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">Low</div>
                    </SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  <label>Source</label>
                </div>
                <Select
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
                </Select>

                {(
                  [
                    "state",
                    "district",
                    "crop",
                    "season",
                    "domain",
                  ] as DetailField[]
                ).map((field) => (
                  <div key={field} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <label>
                        {field.charAt(0).toUpperCase() + field.slice(1)}
                      </label>
                    </div>
                    <Input
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
                    />
                  </div>
                ))}
              </div>

              {userRole === "expert" && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <AlertCircle
                      className="h-4 w-4 text-destructive"
                      aria-hidden="true"
                    />
                    <label>Reason for Flagging</label>
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
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditOpen(false)}>
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            Cancel
          </Button>
          <DialogFooter className="flex justify-end gap-2">
            {userRole === "expert" ? (
              <Button
                variant="destructive"
                onClick={() => {
                  console.log(
                    "[EditQuestionDialog] Submitting flag:",
                    updatedData
                  );

                  onSave?.(question._id!, flagReason);
                }}
              >
                <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
                {isLoadingAction ? "Submiting..." : "Submit"}
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={() => {
                  console.log("[EditQuestionDialog] Saving data:", updatedData);
                  onSave?.(question._id!);
                }}
              >
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                {isLoadingAction ? "Saving..." : "Save"}
              </Button>
            )}
          </DialogFooter>
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
  refetch: () => void;
  totalQuestions: number;
  userRole: UserRole;
};

export const QuestionsFilters = ({
  search,
  setSearch,
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
      <div className="flex-1 min-w-[200px] max-w-[400px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search questions, crops..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background"
          />
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
          isStatusFilterNeeded={true}
        />

        <Button
          variant="outline"
          size="icon"
          className="flex-none w-12 p-3 sm:w-auto"
          onClick={refetch}
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>

        {/* {userRole !== "expert" && (
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-2"
            onClick={()=> {}}
          >
            <Plus className="h-4 w-4" />
            Add Question
          </Button>
        )} */}

        <span className="ml-4 text-sm text-muted-foreground">
          Total Questions: {totalQuestions}
        </span>
      </div>
    </div>
  );
};
