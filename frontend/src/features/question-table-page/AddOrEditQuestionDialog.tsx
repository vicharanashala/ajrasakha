import type {
  IDetailedQuestion,
  QuestionPriority,
  QuestionStatus,
  UserRole,
} from "@/types";
import {
  useEffect,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/atoms/dialog";
import {AlertCircle,
  Check,
  CheckCircle,
  Edit,
  Eye,
  File,
  Flag,
  FlagTriangleRight,
  Info,
  Loader2,
  MessageSquareText,
  MoreVertical,
  MousePointer,
  PaperclipIcon,
  PencilLine,
  Plus,
  PlusCircle,
  RefreshCcw,
  Save,
  Search,
  Square,
  Trash,
  Upload,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/atoms/tooltip";
import { Button } from "../../components/atoms/button";
import { Textarea } from "../../components/atoms/textarea";
import { ScrollArea } from "../../components/atoms/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/atoms/select";
import { Separator } from "../../components/atoms/separator";
import { Input } from "../../components/atoms/input";
import { STATES, CROPS, DOMAINS, SEASONS, DISTRICTS } from "../../components/MetaData";



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
type DetailField = keyof NonNullable<IDetailedQuestion["details"]>;
const OPTIONS: Partial<Record<DetailField, string[]>> = {
  state: STATES,

  crop: CROPS,
  season: SEASONS,
  domain: DOMAINS,
};
const truncate = (s: string, n = 80) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

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
        context: "",
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
                    const fieldOptions =
                                          field === "district"
                                            ? updatedData?.details?.state &&
                                              DISTRICTS[updatedData.details.state]
                                              ? DISTRICTS[updatedData.details.state]
                                              : []
                                            : OPTIONS[field];
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
                        {fieldOptions ? (
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
                              {fieldOptions.map((option) => (
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
              disabled={isLoadingAction}
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