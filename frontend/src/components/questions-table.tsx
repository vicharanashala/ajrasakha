import { useEffect, useState } from "react";
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
  CheckCircle,
  Edit,
  Eye,
  Flag,
  FlagTriangleRight,
  Globe,
  Info,
  Loader2,
  MessageSquareText,
  MoreVertical,
  PencilLine,
  Plus,
  PlusCircle,
  RefreshCcw,
  Save,
  Search,
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
import { useAddQuestion } from "@/hooks/api/question/useAddQuestion";

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
    mode: "add" | "edit",
    entityId?: string,
    flagReason?: string
  ) => {
    try {
      if (!entityId) {
        toast.error(`Failed to identify and ${mode} the selected question.`);
        return;
      }

      if (!updatedData) {
        toast.error("No data available to update.");
        return;
      }

      if (userRole === "expert") {
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

      await updateQuestion(updatedData);
      toast.success("Question updated successfully.");
      setEditOpen(false);
    } catch (error: any) {
      console.error("Error in handleUpdateQuestion:", error);
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
      console.log("Error: ", error);
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
                        {truncate(q.question, 60)}
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
                          q.status === "in-review"
                            ? "secondary"
                            : q.status === "open"
                            ? "outline"
                            : q.status === "closed"
                            ? "destructive"
                            : "outline"
                        }
                        className={
                          q.status === "in-review"
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
                      {formatDate(new Date(q.createdAt!))}
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
    flagReason?: string
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

  useEffect(() => {
    if (mode === "edit" && question) {
      setUpdatedData(question);
    } else if (mode === "add") {
      setUpdatedData({
        question: "",
        priority: "medium",
        source: "AJRASAKHA",
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

        <div className="h-[420px]">
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
                      prev ? { ...prev, priority: v as QuestionPriority } : prev
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
                {userRole !== "expert" && mode == "edit" && (
                  <>
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <CheckCircle className="h-4 w-4" aria-hidden="true" />
                      <label>Status*</label>
                    </div>
                    <Select
                      value={updatedData?.status || "open"}
                      onValueChange={(v) =>
                        setUpdatedData((prev) =>
                          prev ? { ...prev, status: v as QuestionStatus } : prev
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in-review">In review</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  <label>Source*</label>
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
                        {field.charAt(0).toUpperCase() + field.slice(1)}*
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
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            Cancel
          </Button>

          {mode === "add" ? (
            <Button
              variant="default"
              onClick={() => {
                onSave?.("add");
              }}
            >
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {isLoadingAction ? "Adding..." : "Add Question"}
            </Button>
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
  const [addOpen, setAddOpen] = useState(false);
  const [updatedData, setUpdatedData] = useState<IDetailedQuestion | null>(
    null
  );
  const { mutateAsync: addQuestion, isPending: addingQuestion } =
    useAddQuestion();

  //     const detailsArray = [
  //   {
  //     state: 'Tamil Nadu',
  //     district: 'Thanjavur',
  //     crop: 'Rice',
  //     season: 'Kharif',
  //     domain: 'Agriculture',
  //   },
  //   {
  //     state: 'Maharashtra',
  //     district: 'Pune',
  //     crop: 'Sugarcane',
  //     season: 'Rabi',
  //     domain: 'Irrigation',
  //   },
  //   {
  //     state: 'Punjab',
  //     district: 'Ludhiana',
  //     crop: 'Wheat',
  //     season: 'Rabi',
  //     domain: 'Soil Management',
  //   },
  //   {
  //     state: 'Karnataka',
  //     district: 'Mysuru',
  //     crop: 'Ragi',
  //     season: 'Kharif',
  //     domain: 'Fertilizer',
  //   },
  //   {
  //     state: 'Gujarat',
  //     district: 'Rajkot',
  //     crop: 'Cotton',
  //     season: 'Kharif',
  //     domain: 'Pesticide',
  //   },
  //   {
  //     state: 'Uttar Pradesh',
  //     district: 'Varanasi',
  //     crop: 'Rice',
  //     season: 'Kharif',
  //     domain: 'Water Resources',
  //   },
  //   {
  //     state: 'Andhra Pradesh',
  //     district: 'Guntur',
  //     crop: 'Chili',
  //     season: 'Rabi',
  //     domain: 'Crop Protection',
  //   },
  //   {
  //     state: 'Rajasthan',
  //     district: 'Jaipur',
  //     crop: 'Bajra',
  //     season: 'Kharif',
  //     domain: 'Dryland Farming',
  //   },
  //   {
  //     state: 'Madhya Pradesh',
  //     district: 'Indore',
  //     crop: 'Soybean',
  //     season: 'Kharif',
  //     domain: 'Sustainable Farming',
  //   },
  //   {
  //     state: 'West Bengal',
  //     district: 'Kolkata',
  //     crop: 'Jute',
  //     season: 'Kharif',
  //     domain: 'Agro Processing',
  //   },
  // ];

  // const priorities: QuestionPriority[] = ['high', 'low', 'medium'];
  // const questionStatus: QuestionStatus[] = ['in-review', 'closed', 'open'];

  // const sources: ('AJRASAKHA' | 'AGRI_EXPERT')[] = ['AJRASAKHA', 'AGRI_EXPERT'];

  // const dummyQuestions: string[] = [
  //   'What are the major types of soil found in India?',
  //   'How does crop rotation improve soil fertility?',
  //   'What are the effects of over-irrigation on soil health?',
  //   'Explain the role of nitrogen in plant growth.',
  //   'What is the significance of organic farming in sustainable agriculture?',
  //   'How does deforestation contribute to climate change?',
  //   'What is precision agriculture and how does it work?',
  //   'Explain the process of photosynthesis and its importance.',
  //   'What are the different methods of irrigation used in agriculture?',
  //   'How does salinity affect crop production?',
  //   'What is the difference between Kharif and Rabi crops?',
  //   'How does soil pH affect nutrient availability?',
  //   'What are biofertilizers and why are they important?',
  //   'Explain the concept of integrated pest management (IPM).',
  //   'What are greenhouse gases and how do they affect agriculture?',
  //   'How does contour plowing prevent soil erosion?',
  //   'What is the role of drones in modern agriculture?',
  //   'Explain how climate change impacts crop yield.',
  //   'What are genetically modified (GM) crops and their advantages?',
  //   'How does mulching help in water conservation?',
  //   'What are the main causes of land degradation?',
  //   'Explain how organic matter improves soil structure.',
  //   'What are the common diseases that affect rice crops?',
  //   'What are the advantages of drip irrigation systems?',
  //   'How does overuse of fertilizers affect groundwater?',
  //   'What is agroforestry and what are its benefits?',
  //   'Explain how carbon sequestration helps reduce global warming.',
  //   'What is the impact of pesticides on the ecosystem?',
  //   'What is crop diversification and why is it important?',
  //   'Explain the importance of soil testing before cultivation.',
  //   'What are the effects of acid rain on agriculture?',
  //   'What is vermicomposting and how is it done?',
  //   'What are micronutrients essential for plant growth?',
  //   'Explain the role of mycorrhiza in plant development.',
  //   'How can remote sensing be used in agriculture?',
  //   'What are the benefits of conservation tillage?',
  //   'Explain the concept of zero-budget natural farming.',
  //   'What are the major challenges in rainfed agriculture?',
  //   'How does global warming affect rainfall patterns?',
  //   'What is the role of pollinators in food production?',
  //   'How can farmers adapt to climate variability?',
  //   'Explain the function of soil microorganisms in nutrient cycling.',
  //   'What are the impacts of plastic pollution on farmlands?',
  //   'What are sustainable irrigation practices?',
  //   'How does salinity intrusion occur in coastal agriculture?',
  //   'Explain the role of cover crops in maintaining soil fertility.',
  //   'What is the importance of biodiversity in agro-ecosystems?',
  //   'How can renewable energy be integrated into farming?',
  //   'What is hydroponics and how does it differ from traditional farming?',
  //   'Explain the difference between weather and climate.',
  //   'What are the major greenhouse gases and their sources?',
  //   'What are the advantages of mixed cropping?',
  //   'How does deforestation affect water cycles?',
  //   'What are the principles of sustainable agriculture?',
  //   'Explain the process of evapotranspiration.',
  //   'What is the role of carbon dioxide in plant growth?',
  //   'What are the environmental impacts of livestock farming?',
  //   'How do pesticides contaminate soil and water?',
  //   'What are the different types of composting methods?',
  //   'What are the benefits of crop insurance for farmers?',
  //   'Explain the importance of watershed management.',
  //   'What are the causes and effects of desertification?',
  //   'How does temperature affect crop germination?',
  //   'What is the impact of heavy metals on soil health?',
  //   'What is aquaponics and how does it function?',
  //   'Explain the significance of green manures in agriculture.',
  //   'How does intercropping help in pest management?',
  //   'What is precision irrigation and how does it save water?',
  //   'What is the role of GIS in agricultural planning?',
  //   'How does afforestation help in climate regulation?',
  //   'What are biopesticides and how are they used?',
  //   'Explain how rainfall variability affects farming operations.',
  //   'What are the environmental benefits of organic agriculture?',
  //   'How can farmers reduce carbon emissions from agriculture?',
  //   'What are the common methods of soil conservation?',
  //   'How does population growth impact agricultural sustainability?',
  //   'What are drought-resistant crop varieties?',
  //   'Explain the impact of climate change on pest populations.',
  //   'How does irrigation efficiency affect energy use in agriculture?',
  //   'What are the key indicators of soil health?',
  //   'How do fertilizers affect the nitrogen cycle?',
  //   'What are the advantages of using renewable fertilizers?',
  //   'What is the significance of the Green Revolution?',
  //   'Explain how technology improves agricultural productivity.',
  //   'What are the challenges in implementing sustainable farming practices?',
  //   'How do invasive species affect local ecosystems?',
  //   'What is carbon farming and its importance?',
  //   'How can artificial intelligence be used in agriculture?',
  //   'What are eco-friendly alternatives to chemical fertilizers?',
  //   'How do wetlands contribute to ecosystem balance?',
  //   'What is precision livestock farming?',
  //   'What are the negative impacts of monocropping?',
  //   'Explain the relationship between agriculture and water scarcity.',
  //   'How does climate-smart agriculture promote sustainability?',
  //   'What is the role of government policies in environmental conservation?',
  //   'What are the benefits of community-based natural resource management?',
  //   'How do soil organisms contribute to decomposition?',
  //   'What are sustainable practices to control soil erosion?',
  //   'How does groundwater depletion affect agriculture?',
  //   'What are the principles of regenerative agriculture?',
  // ];
  // const handleAddQuestion = async () => {
  //   try {
  //     const toastId = toast.loading("Adding 100 questions...");

  //     const questionsToCreate = Array.from({ length: 100 }).map((_, i) => ({
  //       question: dummyQuestions[i % dummyQuestions.length],
  //       priority: priorities[Math.floor(Math.random() * priorities.length)],
  //       source: sources[Math.floor(Math.random() * sources.length)],
  //       details: detailsArray[i % detailsArray.length],
  //       context: "",
  //     }));

  //     // Limit number of concurrent requests to avoid overloading backend
  //     const CONCURRENT_LIMIT = 10;
  //     for (let i = 0; i < questionsToCreate.length; i += CONCURRENT_LIMIT) {
  //       const batch = questionsToCreate.slice(i, i + CONCURRENT_LIMIT);
  //       await Promise.all(batch.map(payload => addQuestion(payload)));
  //     }

  //     toast.success("100 questions added successfully!", { id: toastId });
  //   } catch (err) {
  //     console.error("Failed to add questions:", err);
  //     toast.error("Failed to add questions");
  //   }
  // };

  const handleAddQuestion = async (mode: "add" | "edit") => {
    try {
      if (mode !== "add") return;

      if (!updatedData) {
        toast.error("No data found to add. Please try again!");
        return;
      }

      const payload = {
        question: updatedData.question?.trim() ?? "",
        priority: updatedData.priority ?? "medium",
        source: updatedData.source ?? "AJRASAKHA",
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

      if (!state?.trim()) {
        toast.error("Please enter the State field.");
        return;
      }

      if (!district?.trim()) {
        toast.error("Please enter the District field.");
        return;
      }

      if (!crop?.trim()) {
        toast.error("Please enter the Crop field.");
        return;
      }

      if (!season?.trim()) {
        toast.error("Please enter the Season field.");
        return;
      }

      if (!domain?.trim()) {
        toast.error("Please enter the Domain field.");
        return;
      }

      await addQuestion(payload);
      toast.success("Question added successfully.");
      setAddOpen(false);
    } catch (error) {
      console.error("Error in handleAddQuestion:", error);
      toast.error("An unexpected error occurred. Please try again.");
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
