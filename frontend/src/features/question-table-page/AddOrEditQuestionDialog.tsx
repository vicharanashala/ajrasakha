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
import {
  AlertCircle,
  Check,
  CheckCircle,
  File,
  Flag,
  FlagTriangleRight,
  Info,
  MessageSquareText,
  PencilLine,
  Plus,
  PlusCircle,
  Save,
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
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import { Label } from "@/components/atoms/label";
import { Switch } from "@/components/atoms/switch";
import { toast } from "sonner";
import { TopLeftBadge, TopRightBadge } from "@/components/NewBadge";





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
  validationErrors?: AddQuestionValidationErrors;
  onFieldValidatedChange?: (field: AddQuestionField) => void;
}

export type AddQuestionField =
  | "question"
  | "priority"
  | "state"
  | "district"
  | "crop"
  | "season"
  | "domain";

export type AddQuestionValidationErrors = Partial<
  Record<AddQuestionField, string>
>;

type DetailField = keyof NonNullable<IDetailedQuestion["details"]>;
const OPTIONS: Partial<Record<DetailField, string[]>> = {
  state: STATES,

  crop: CROPS,
  season: SEASONS,
  domain: DOMAINS,
};

// ── Crop Select with DB data — shows crop names only ──
const CropSelect = ({
  value,
  onValueChange,
  hasError,
  invalidFieldClass,
  placeholder,
  onNormalisedCropResolved,
}: {
  value?: string;
  onValueChange: (val: string) => void;
  hasError: boolean;
  invalidFieldClass: string;
  placeholder?: string;
  onNormalisedCropResolved?: (canonicalName: string) => void;
}) => {
  const { data: cropsData, isLoading } = useGetAllCrops();
  const dbCrops = cropsData?.crops || [];
  const useDbCrops = dbCrops.length > 0;

  const cropNames = dbCrops.map((c) => c.name);
  const normalizedVal = value?.trim().toLowerCase();
  const isKnown = normalizedVal ? cropNames.some((n) => n.toLowerCase() === normalizedVal) : false;

  const handleChange = (selectedValue: string) => {
    onValueChange(selectedValue);
    if (onNormalisedCropResolved) {
      onNormalisedCropResolved(selectedValue);
    }
  };

  return (
    <Select
      value={value?.trim() || undefined}
      onValueChange={handleChange}
    >
      <SelectTrigger
        className={`w-full ${hasError ? invalidFieldClass : ""}`}
      >
        <SelectValue placeholder={isLoading ? "Loading crops..." : (placeholder ?? "Select crop")} />
      </SelectTrigger>
      <SelectContent>
        {/* Show current value if it doesn't match any known crop (legacy data) */}
        {!isKnown && value?.trim() && (
          <SelectItem key={value.trim()} value={value.trim()}>{value.trim()}</SelectItem>
        )}
        {useDbCrops
          ? cropNames.map((name) => (
            <SelectItem key={name} value={name}>
              <span className="capitalize">{name}</span>
            </SelectItem>
          ))
          : CROPS.map((crop) => (
            <SelectItem key={crop} value={crop}>
              {crop}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
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
  validationErrors,
  onFieldValidatedChange,
}: AddOrEditQuestionDialogProps) => {
  const [flagReason, setFlagReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<"single" | "bulk">("single");
  const [isDragging, setIsDragging] = useState(false);

  const [isRequiredAiInitialAnswer, setIsRequiredAiInitialAnswer] = useState(false);
  const [isOutreachQuestion, setIsOutreachQuestion] = useState(false);

  const invalidFieldClass =
    "border-red-500 dark:border-red-400 focus-visible:ring-red-500/60";

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
      // Reset upload mode and file when dialog opens in add mode
      setUploadMode("single");
      setFile(null);
    }
  }, [question, mode, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl h-[95vh] overflow-y-auto">
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

        <div className="flex flex-col h-[450px]">
          {mode === "add" && (
            <div className="px-2 pt-2 flex-shrink-0">
              <div className="flex bg-muted rounded-lg p-1 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setUploadMode("single");
                    setFile(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${uploadMode === "single"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <Plus className="h-4 w-4" />
                  Single Question
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadMode("bulk");
                    setUpdatedData((prev) =>
                      prev
                        ? {
                          ...prev,
                          question: "",
                          context: "",
                          aiInitialAnswer: "",
                          details: {
                            state: "",
                            district: "",
                            crop: "",
                            season: "",
                            domain: "",
                          },
                        }
                        : prev
                    );
                  }}
                  className={`relative flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${uploadMode === "bulk"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <Upload className="h-4 w-4" />
                  <TopLeftBadge label="new" left={5} />

                  Bulk Upload
                </button>
              </div>
            </div>
          )}

          {uploadMode === "bulk" && mode === "add" ? (
            // Bulk Upload Mode
            <div className="flex-1 overflow-y-auto p-4">

              {!file ? (
                <ScrollArea className="h-full w-full pr-3">
                  <div className="flex flex-col items-center justify-center min-h-full space-y-4">
                    {/* Drag & Drop Upload Zone */}
                    <div className="w-full">
                      <input
                        type="file"
                        id="bulk-upload"
                        accept=".json,.csv,.xls,.xlsx,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        className="hidden"
                        onChange={(e) => {
                          const selected = e.target.files?.[0];
                          if (!selected) return;

                          setError(null);
                          const allowedTypes = [
                            "application/json",
                            "text/csv",
                            "application/vnd.ms-excel",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          ];
                          const allowedExtensions = [".json", ".csv", ".xls", ".xlsx"];
                          const hasAllowedExtension = allowedExtensions.some(ext =>
                            selected.name.toLowerCase().endsWith(ext)
                          );

                          if (!allowedTypes.includes(selected.type) && !hasAllowedExtension) {
                            setError("Only JSON, CSV, and Excel files are allowed.");
                            setFile(null);
                            setTimeout(() => setError(null), 3000);
                            return;
                          }

                          const maxSize = 5 * 1024 * 1024;
                          if (selected.size > maxSize) {
                            setError("File size must be less than 5MB.");
                            setFile(null);
                            setTimeout(() => setError(null), 3000);
                            return;
                          }

                          setFile(selected);
                        }}
                      />
                      <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragging
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                          }`}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragging(false);
                          const droppedFile = e.dataTransfer.files?.[0];
                          if (!droppedFile) return;

                          setError(null);
                          const allowedTypes = [
                            "application/json",
                            "text/csv",
                            "application/vnd.ms-excel",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          ];
                          const allowedExtensions = [".json", ".csv", ".xls", ".xlsx"];
                          const hasAllowedExtension = allowedExtensions.some(ext =>
                            droppedFile.name.toLowerCase().endsWith(ext)
                          );

                          if (!allowedTypes.includes(droppedFile.type) && !hasAllowedExtension) {
                            setError("Only JSON, CSV, and Excel files are allowed.");
                            setTimeout(() => setError(null), 3000);
                            return;
                          }

                          const maxSize = 5 * 1024 * 1024;
                          if (droppedFile.size > maxSize) {
                            setError("File size must be less than 5MB.");
                            setTimeout(() => setError(null), 3000);
                            return;
                          }

                          setFile(droppedFile);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onClick={() => document.getElementById("bulk-upload")?.click()}
                      >
                        <div className="space-y-3">
                          <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
                          <p className="text-sm text-foreground font-medium">
                            Click to upload <span className="text-muted-foreground font-normal">or drag and drop</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            JSON, CSV, or Excel file (max 5MB)
                          </p>
                        </div>
                      </div>
                      {error && (
                        <p className="text-red-500 text-sm text-center mt-2">{error}</p>
                      )}
                    </div>

                    {/* Download Sample Button */}
                    <TooltipProvider>
                      <Tooltip delayDuration={700}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              const link = document.createElement("a");
                              link.href = "/templates/sample_bulk_question_file.json.xlsx";
                              link.download = "sample_bulk_question_file.xlsx";
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            className="w-full"
                          >
                            <File className="mr-2 h-4 w-4" />
                            Download Sample Excel Template
                          </Button>
                        </TooltipTrigger>

                        <TooltipContent side="top" className="max-w-xs text-sm">
                          <div className="space-y-2">
                            <p className="font-medium">File Format:</p>
                            <ul className="list-disc list-inside space-y-1">
                              <li>First row should contain column headers</li>
                              <li>
                                Required columns: question, priority, state, district, crop, season, domain, aiInitialAnswer
                              </li>
                              <li>Duplicate questions will be automatically skipped</li>
                            </ul>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <div className="w-full space-y-4 border rounded-lg p-4 bg-muted/30 relative">
                        <p className="text-sm font-medium text-foreground">Upload Options</p>
                        <TopRightBadge label="new" right={0} />

                        {/* AI Initial Answer */}
                        <div className="flex items-center justify-between">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="space-y-0.5 cursor-help">
                                <Label>Require AI Initial Answer</Label>
                                <p className="text-xs text-muted-foreground">
                                  Enforce aiInitialAnswer field in upload
                                </p>
                              </div>
                            </TooltipTrigger>

                            <TooltipContent side="top" className="max-w-xs text-sm">
                              If enabled, an LLM-generated answer will be attached as the initial answer for each question.
                            </TooltipContent>
                          </Tooltip>

                          <Switch
                            checked={isRequiredAiInitialAnswer}
                            onCheckedChange={(value) => {
                              if (isOutreachQuestion && !value) {
                                toast.warning("AI Initial Answer is required for Outreach questions");
                                return;
                              }

                              setIsRequiredAiInitialAnswer(value);
                            }}
                          />
                        </div>

                        {/* Outreach Questions */}
                        <div className="flex items-center justify-between">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="space-y-0.5 cursor-help">
                                <Label>Outreach Questions</Label>
                                <p className="text-xs text-muted-foreground">
                                  Mark uploaded questions as outreach
                                </p>
                              </div>
                            </TooltipTrigger>

                            <TooltipContent side="top" className="max-w-xs text-sm">
                              If enabled, all uploaded questions will have their status set to "OUTREACH".
                            </TooltipContent>
                          </Tooltip>

                          {/* <Switch
                            checked={isOutreachQuestion}
                            onCheckedChange={setIsOutreachQuestion}
                          /> */}

                          <Switch
                            checked={isOutreachQuestion}
                            onCheckedChange={(value) => {
                              setIsOutreachQuestion(value);

                              if (value) {
                                setIsRequiredAiInitialAnswer(true);
                              }
                            }}
                          />
                        </div>
                      </div>
                    </TooltipProvider>
                  </div>
                </ScrollArea>

              ) : (
                <div className="flex items-center justify-center h-full">
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
                          <p className="text-sm text-muted-foreground">
                            {(file.size / 1024).toFixed(2)} KB
                          </p>

                          <div className="flex flex-wrap justify-center gap-2">
                            <span
                              className={`px-3 py-1 text-xs rounded-full border ${isRequiredAiInitialAnswer
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-muted text-muted-foreground border-border"
                                }`}
                            >
                              AI Initial Answer: {isRequiredAiInitialAnswer ? "Required" : "Disabled"}
                            </span>

                            <span
                              className={`px-3 py-1 text-xs rounded-full border ${isOutreachQuestion
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-muted text-muted-foreground border-border"
                                }`}
                            >
                              Outreach: {isOutreachQuestion ? "Yes" : "No"}
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-border bg-background">
                            {file.name.split(".").pop()?.toUpperCase() || "FILE"}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setFile(null)}
                          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Remove File
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}



            </div>
          ) : file && uploadMode === "single" ? (
            // File preview for single mode (rare case)
            <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
              <div className="relative w-full max-w-md">
                <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full border-4 border-background flex items-center justify-center bg-green-600 z-10">
                  <Check className="h-5 w-5 text-white" />
                </div>
                <div className="relative overflow-hidden rounded-xl border-2 border-border bg-card shadow-lg">
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
                      <p className="text-sm text-muted-foreground">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setFile(null)}
                      className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Single Question Form
            <ScrollArea className="flex-1 pr-4">
              <div className="grid gap-4 p-2 pb-4">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                    <label>Question Text*</label>
                  </div>
                  <Textarea
                    placeholder="Enter question text"
                    value={updatedData?.question || ""}
                    onChange={(e) => {
                      onFieldValidatedChange?.("question");
                      setUpdatedData((prev) =>
                        prev ? { ...prev, question: e.target.value } : prev
                      );
                    }}
                    className={
                      mode === "add" && validationErrors?.question
                        ? invalidFieldClass
                        : undefined
                    }
                    rows={3}
                  />
                  {mode === "add" && validationErrors?.question && (
                    <p className="text-sm font-medium text-red-600 dark:text-red-300 mt-1">
                      {validationErrors.question}
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Info className="h-4 w-4" aria-hidden="true" />
                    <label>Context   (optional)</label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-amber-500 cursor-pointer" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p>Adding clear context improves question quality and helps experts respond faster.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <Textarea
                    placeholder="Mention the context for this question..."
                    value={updatedData?.context || ""}
                    onChange={(e) =>
                      setUpdatedData((prev) =>
                        prev ? { ...prev, context: e.target.value } : prev
                      )
                    }
                    className="h-32 resize-none overflow-y-auto"
                  />

                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Info className="h-4 w-4" aria-hidden="true" />
                    <label>AI Initial Answer   (optional)</label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-amber-500 cursor-pointer" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p>Adding AI-generated response helps experts understand the question better.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <Textarea
                    placeholder="Mention the AI-generated response alongside the question for better context..."
                    value={updatedData?.aiInitialAnswer || ""}
                    onChange={(e) =>
                      setUpdatedData((prev) =>
                        prev ? { ...prev, aiInitialAnswer: e.target.value } : prev
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
                    onValueChange={(v) => {
                      onFieldValidatedChange?.("priority");
                      setUpdatedData((prev) =>
                        prev
                          ? { ...prev, priority: v as QuestionPriority }
                          : prev
                      );
                    }}
                  >
                    <SelectTrigger
                      className={`w-full ${mode === "add" && validationErrors?.priority
                        ? invalidFieldClass
                        : ""
                        }`}
                    >
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  {mode === "add" && validationErrors?.priority && (
                    <p className="text-sm font-medium text-red-600 dark:text-red-300 mt-1">
                      {validationErrors.priority}
                    </p>
                  )}
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

                  {(
                    [
                      "state",
                      "district",
                    ] as DetailField[]
                  ).map((field) => {
                    const stateVal = updatedData?.details?.state?.trim();
                    const districtKey = stateVal
                      ? Object.keys(DISTRICTS).find((k) => k.toLowerCase() === stateVal.toLowerCase())
                      : undefined;
                    const fieldOptions =
                      field === "district"
                        ? districtKey ? DISTRICTS[districtKey] : []
                        : OPTIONS[field];
                    return (
                      <div key={field} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <label>
                            {field.charAt(0).toUpperCase() + field.slice(1)}*
                          </label>
                        </div>
                        {fieldOptions ? (
                          <Select
                            value={
                              updatedData?.details?.[field]?.trim()
                                ? fieldOptions.find(
                                  (o) => o.toLowerCase() === updatedData.details![field].toLowerCase().trim()
                                ) ?? updatedData.details[field]
                                : undefined
                            }
                            onValueChange={(val) => {
                              onFieldValidatedChange?.(field as AddQuestionField);
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
                              );
                            }}
                          >
                            <SelectTrigger
                              className={`w-full ${mode === "add" && validationErrors?.[field as AddQuestionField]
                                ? invalidFieldClass
                                : ""
                                }`}
                            >
                              <SelectValue placeholder={`Select ${field}`} />
                            </SelectTrigger>

                            <SelectContent>
                              {fieldOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                              {(() => {
                                const raw = updatedData?.details?.[field]?.trim();
                                const hasMatch = raw && fieldOptions.some((o) => o.toLowerCase() === raw.toLowerCase());
                                return raw && !hasMatch ? (
                                  <SelectItem key={raw} value={raw}>{raw}</SelectItem>
                                ) : null;
                              })()}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="text"
                            value={updatedData?.details?.district || ""}
                            onChange={(e) => {
                              onFieldValidatedChange?.("district");
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
                              );
                            }}
                            className={
                              mode === "add" && validationErrors?.district
                                ? invalidFieldClass
                                : undefined
                            }
                          />
                        )}
                        {mode === "add" && validationErrors?.[field as AddQuestionField] && (
                          <p className="text-sm font-medium text-red-600 dark:text-red-300 mt-1">
                            {validationErrors[field as AddQuestionField]}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* ── Crop (from DB) ── */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <label>Crop*</label>
                    </div>
                    <CropSelect
                      value={updatedData?.details?.crop}
                      onValueChange={(val) => {
                        onFieldValidatedChange?.("crop");
                        setUpdatedData((prev) =>
                          prev
                            ? {
                              ...prev,
                              details: {
                                ...prev.details,
                                crop: val,
                              },
                            }
                            : prev
                        );
                      }}
                      onNormalisedCropResolved={(canonicalName) => {
                        setUpdatedData((prev) =>
                          prev
                            ? {
                              ...prev,
                              details: {
                                ...prev.details,
                                normalised_crop: canonicalName,
                              },
                            }
                            : prev
                        );
                      }}
                      hasError={!!(mode === "add" && validationErrors?.crop)}
                      invalidFieldClass={invalidFieldClass}
                    />
                    {mode === "add" && validationErrors?.crop && (
                      <p className="text-sm font-medium text-red-600 dark:text-red-300 mt-1">
                        {validationErrors.crop}
                      </p>
                    )}
                  </div>

                  {/* ── Normalised Crop (auto-filled, read-only) ── */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <label>Normalised Crop</label>
                    </div>
                    <Input
                      type="text"
                      value={updatedData?.details?.normalised_crop || ""}
                      disabled
                      placeholder="Will auto-fill when crop is selected"
                      className="capitalize bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    />
                  </div>

                  {(
                    [
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
                        {fieldOptions ? (
                          <Select
                            value={
                              updatedData?.details?.[field]?.trim()
                                ? fieldOptions.find(
                                  (o) => o.toLowerCase() === updatedData.details![field].toLowerCase().trim()
                                ) ?? updatedData.details[field]
                                : undefined
                            }
                            onValueChange={(val) => {
                              onFieldValidatedChange?.(field as AddQuestionField);
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
                              );
                            }}
                          >
                            <SelectTrigger
                              className={`w-full ${mode === "add" && validationErrors?.[field as AddQuestionField]
                                ? invalidFieldClass
                                : ""
                                }`}
                            >
                              <SelectValue placeholder={`Select ${field}`} />
                            </SelectTrigger>

                            <SelectContent>
                              {fieldOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                              {(() => {
                                const raw = updatedData?.details?.[field]?.trim();
                                const hasMatch = raw && fieldOptions.some((o) => o.toLowerCase() === raw.toLowerCase());
                                return raw && !hasMatch ? (
                                  <SelectItem key={raw} value={raw}>{raw}</SelectItem>
                                ) : null;
                              })()}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="text"
                            value={updatedData?.details?.district || ""}
                            onChange={(e) => {
                              onFieldValidatedChange?.("district");
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
                              );
                            }}
                            className={
                              mode === "add" && validationErrors?.district
                                ? invalidFieldClass
                                : undefined
                            }
                          />
                        )}
                        {mode === "add" && validationErrors?.[field as AddQuestionField] && (
                          <p className="text-sm font-medium text-red-600 dark:text-red-300 mt-1">
                            {validationErrors[field as AddQuestionField]}
                          </p>
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
          {mode === "add" ? (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                <X className="mr-2 h-4 w-4" aria-hidden="true" />
                Cancel
              </Button>

              {uploadMode === "bulk" ? (

                <Button
                  variant="default"
                  disabled={!file}
                  onClick={() => {
                    if (file) {
                      const formData = new FormData();
                      formData.append("file", file);
                      formData.append("isRequiredAiInitialAnswer", String(isRequiredAiInitialAnswer));
                      formData.append("isOutreachQuestion", String(isOutreachQuestion));
                      onSave?.("add", undefined, undefined, undefined, formData);
                      setFile(null);
                    }
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isLoadingAction ? "Uploading..." : "Upload Questions"}
                </Button>
              ) : (
                <Button
                  variant="default"
                  onClick={() => onSave?.("add")}
                  disabled={isLoadingAction || !updatedData?.question.trim()}
                >
                  <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isLoadingAction ? "Adding..." : "Add Question"}
                </Button>
              )}
            </>
          ) : userRole === "expert" ? (
            <Button
              variant="destructive"
              disabled={isLoadingAction || !flagReason.trim()}
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
              disabled={isLoadingAction || !updatedData?.question.trim()}
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