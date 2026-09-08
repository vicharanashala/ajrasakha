import { useCallback, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Search, Link as LinkIcon, Pencil, Plus, Check, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/atoms/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/atoms/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/atoms/command";
import { ScrollArea } from "@/components/atoms/scroll-area";
import Spinner from "@/components/atoms/spinner";
import { QuestionIdLink } from "@/features/chatbotDashboard/components/QuestionIdLink";
import {
  ClosedAnswersFilters,
  EMPTY_CLOSED_ANSWER_FILTERS,
  countActiveFilters,
} from "./ClosedAnswersFilters";
import { useGetClosedAnswers } from "@/hooks/api/answer/useGetClosedAnswers";
import { useSearchOrganizations } from "@/hooks/api/organization/useSearchOrganizations";
import { useLookupPopSource } from "@/hooks/api/pop/useLookupPopSource";
import { useStartNewSource } from "@/hooks/api/newSource/useStartNewSource";
import { useCompleteNewSource } from "@/hooks/api/newSource/useCompleteNewSource";
import { useCloseNewSource } from "@/hooks/api/newSource/useCloseNewSource";
import { useDebounce } from "@/hooks/ui/useDebounce";
import { formatDate } from "@/utils/formatDate";
import { cn } from "@/lib/utils";
import type {
  ClosedAnswer,
  ClosedAnswerFilters as ClosedAnswerFiltersState,
  SourceItem,
  SourceType,
} from "@/types";
import type { PopMatchStatus } from "@/hooks/services/newSourceService";

const EDIT_SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "hyper_local", label: "Hyper Local" },
  { value: "state", label: "State" },
  { value: "central", label: "Central" },
  { value: "other", label: "Other" },
];

const EMPTY_SOURCE_FORM: SourceItem = {
  source: "",
  sourceType: undefined,
  sourceName: "",
  page: "",
  organization: "",
  sourceReference: "",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  hyper_local: "Hyper Local",
  state: "State",
  central: "Central",
  MODERATOR_REVIEW: "Moderator Review",
  other: "Other",
};

const SECTION_LABEL_CLASSES =
  "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80";

const isUrl = (value: string) => /^https?:\/\//i.test(value);

// Converts the AI answer markup into readable text by flattening tags into labelled lines.
export const formatAiTags = (text: string) => {
  if (!text) return "—";

  // 1. Replace key-value tags: <tag>value</tag> -> "Tag: value"
  let formatted = text.replace(/<([^>]+)>([^<]*)<\/\1>/g, (match, tag, value) => {
    const label = tag.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    return `${label}: ${value.trim()}`;
  });

  // 2. Replace standalone opening tags: <tag> -> "\nTag:\n"
  formatted = formatted.replace(/<([^\/][^>]*)>/g, (match, tag) => {
    const label = tag.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    return `\n${label}:\n`;
  });

  // 3. Remove all remaining closing tags: </tag> -> ""
  formatted = formatted.replace(/<\/[^>]+>/g, '');

  // 4. Cleanup excessive newlines
  formatted = formatted.replace(/\n{3,}/g, '\n\n').trim();

  return formatted || "—";
};

// Copies an existing source into the form shape, keeping optional fields as strings for controlled inputs.
const toSourceForm = (source: SourceItem): SourceItem => ({
  source: source.source ?? "",
  sourceType: source.sourceType,
  sourceName: source.sourceName ?? "",
  page: source.page ?? "",
  organization: source.organization ?? "",
  sourceReference: source.sourceReference ?? "",
});

const OrganizationCombobox = ({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query);

  const { data, isFetching } = useSearchOrganizations(debouncedQuery, open);
  const organizations = data?.organizations ?? [];

  return (
    // modal — without it, this Popover (nested inside the Edit Source Dialog) inherits
    // the Dialog's `pointer-events: none` on <body>: it renders but nothing inside is
    // clickable or scrollable. modal makes the Popover re-enable pointer-events on
    // itself, the same way the Source Type Select already does.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || "Search organization..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popper-anchor-width) p-0" align="start">
        <Command shouldFilter={false} className="h-[280px]">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search by organization name..."
          />
          <CommandList className="max-h-none min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {isFetching ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Searching...
              </div>
            ) : (
              <>
                <CommandEmpty>No organizations found.</CommandEmpty>
                <CommandGroup>
                  {organizations.map((org) => (
                    <CommandItem
                      key={org._id ?? org.org_name}
                      value={org.org_name}
                      onSelect={() => {
                        onChange(org.org_name);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === org.org_name ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex-1 truncate">{org.org_name}</span>
                      {org.state && (
                        <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                          {org.state}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const SourcePickerItem = ({
  source,
  index,
  isActive,
  onSelect,
}: {
  source: SourceItem;
  index: number;
  isActive: boolean;
  onSelect: () => void;
}) => {
  const typeLabel = source.sourceType
    ? SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType
    : "No type";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive}
      className={cn(
        "flex w-full flex-col gap-0.5 border-b border-l-2 border-b-border/60 px-3 py-2 text-left transition-colors last:border-b-0",
        isActive ? "border-l-primary bg-primary/10" : "border-l-transparent hover:bg-muted/60",
      )}
    >
      <span className="truncate text-xs font-medium text-foreground">
        {source.sourceName || source.source || `Source ${index + 1}`}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {typeLabel}
        {source.page !== undefined && source.page !== "" ? ` · Page ${source.page}` : ""}
      </span>
    </button>
  );
};

const SourceReferenceLookup = ({
  source,
  onFound,
}: {
  source: string;
  onFound?: (id: string, matchStatus: PopMatchStatus) => void;
}) => {
  const { mutate, data, isPending } = useLookupPopSource();

  const handleClick = () => {
    if (!source.trim()) {
      toast.error("Enter a Source first.");
      return;
    }
    mutate(source, {
      onSuccess: (result) => {
        if (result?.found && result._id) {
          onFound?.(result._id, result.matchStatus ?? "topLevelMatch");
        }
      },
    });
  };

  return (
    <div className="grid gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Checking..." : "Fetch Source Reference"}
      </Button>
      {data && !data.found && (
        <p className="text-xs text-destructive">Source not found.</p>
      )}
      {data?.found && (
        <div className="grid gap-0.5 rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
          <p className="font-medium text-foreground/90">{data.shareable_name}</p>
          <a
            href={data.shareable_link}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary hover:underline"
          >
            {data.shareable_link}
          </a>
        </div>
      )}
    </div>
  );
};

const EditSourceDialog = ({ answer }: { answer: ClosedAnswer }) => {
  const sources = answer.sources ?? [];
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<SourceItem>(EMPTY_SOURCE_FORM);
  const [newSourceId, setNewSourceId] = useState<string | null>(null);
  const [fetchedPopId, setFetchedPopId] = useState<string | null>(null);
  const [fetchedMatchStatus, setFetchedMatchStatus] = useState<PopMatchStatus | null>(null);
  const editStartedAtRef = useRef<number | null>(null);

  const { mutate: startNewSource, isPending: isStarting } = useStartNewSource();
  const { mutate: completeNewSource, isPending: isSaving } = useCompleteNewSource();
  const { mutate: closeNewSource } = useCloseNewSource();

  const isEditing = editingIndex !== null;
  const isValid = form.source.trim().length > 0 && Boolean(form.sourceType);

  const updateField = (field: keyof SourceItem, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Prefills the form from an existing source; the lookup result no longer applies to it.
  const selectSource = (index: number) => {
    setEditingIndex(index);
    setForm(toSourceForm(sources[index]));
    setFetchedPopId(null);
    setFetchedMatchStatus(null);
  };

  const startBlankSource = () => {
    setEditingIndex(null);
    setForm(EMPTY_SOURCE_FORM);
    setFetchedPopId(null);
    setFetchedMatchStatus(null);
  };

  // Opens on the first existing source so the dialog edits rather than always adding.
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      // Opens on the answer's first source so the form starts from real data.
      if (sources.length > 0) {
        setEditingIndex(0);
        setForm(toSourceForm(sources[0]));
      } else {
        setEditingIndex(null);
        setForm(EMPTY_SOURCE_FORM);
      }
      setNewSourceId(null);
      setFetchedPopId(null);
      setFetchedMatchStatus(null);
      editStartedAtRef.current = Date.now();

      // Starts the editing timer: creates the new_sources record as 'inProgress'
      // the instant the modal opens, so timeTaken has a real start point.
      startNewSource(
        { answerId: answer._id, questionId: answer.questionId ?? "" },
        {
          onSuccess: (result) => {
            if (result?._id) setNewSourceId(result._id);
          },
        },
      );
    } else if (newSourceId) {
      // Stamps closedAt on the record's reviewArray entry - fires for every way the
      // modal can close (Cancel, Escape, outside click, or right after a save), not
      // just completed edits, so abandoned edits get a closing time too.
      closeNewSource(newSourceId);
    }
    setOpen(nextOpen);
  };

  const handleSave = () => {
    if (!isValid) {
      toast.error("Enter a source and select a source type first.");
      return;
    }
    if (!newSourceId) {
      toast.error("Still preparing this edit - try again in a moment.");
      return;
    }

    // timeTaken is stored in seconds, not raw milliseconds.
    const timeTaken = editStartedAtRef.current
      ? Math.round((Date.now() - editStartedAtRef.current) / 1000)
      : 0;

    // Edits are logged to the new_sources collection - the answer's own sources are
    // never modified here. sourceReference (the pop document's own _id) and
    // sourceReferenceStatus (topLevelMatch/duplicateMatch/notFound) both come from the
    // Fetch Source Reference button in the form, so the result is captured client-side.
    completeNewSource(
      {
        id: newSourceId,
        sources: [{ ...form, sourceReference: fetchedPopId ?? undefined }],
        timeTaken,
        sourceReferenceStatus: fetchedMatchStatus,
      },
      {
        onSuccess: () => {
          toast.success("Source details saved.");
          handleOpenChange(false);
        },
        onError: () => {
          toast.error("Failed to save source details.");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <Pencil className="h-3.5 w-3.5" />
          Edit Source
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[85vh] w-[95vw] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b pb-3">
          <DialogTitle>{isEditing ? "Edit source" : "Add source"}</DialogTitle>
          <DialogDescription>
            {sources.length > 0
              ? "Pick a source to edit, or add a new one to this answer."
              : "This answer has no sources yet. Add the first one."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 sm:grid-cols-[260px_1fr] sm:grid-rows-1">
          <div className="flex min-h-0 flex-col gap-2">
            <p className={SECTION_LABEL_CLASSES}>Sources ({sources.length})</p>
            <div className="h-[110px] overflow-hidden rounded-lg border border-border/60 sm:h-auto sm:min-h-0 sm:flex-1">
              <ScrollArea className="h-full">
                {sources.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">No sources yet.</p>
                ) : (
                  sources.map((source, index) => (
                    <SourcePickerItem
                      key={index}
                      source={source}
                      index={index}
                      isActive={editingIndex === index}
                      onSelect={() => selectSource(index)}
                    />
                  ))
                )}
              </ScrollArea>
            </div>
            <Button
              type="button"
              variant={isEditing ? "outline" : "secondary"}
              size="sm"
              className="shrink-0"
              onClick={startBlankSource}
            >
              <Plus className="h-3.5 w-3.5" />
              Add new source
            </Button>
          </div>

          <ScrollArea className="h-full">
            <div className="grid gap-3 pr-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-source`} className="text-xs">
                  Source <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`${fieldId}-source`}
                  required
                  value={form.source}
                  onChange={(e) => updateField("source", e.target.value)}
                  placeholder="https://... or the document name"
                />
                <SourceReferenceLookup
                  source={form.source}
                  onFound={(id, matchStatus) => {
                    setFetchedPopId(id);
                    setFetchedMatchStatus(matchStatus);
                  }}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-type`} className="text-xs">
                    Source type <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.sourceType ?? ""}
                    onValueChange={(val) => updateField("sourceType", val)}
                  >
                    <SelectTrigger id={`${fieldId}-type`} className="w-full">
                      <SelectValue placeholder="Select source type" />
                    </SelectTrigger>
                    <SelectContent>
                      {EDIT_SOURCE_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-page`} className="text-xs">
                    Page
                  </Label>
                  <Input
                    id={`${fieldId}-page`}
                    value={form.page ?? ""}
                    onChange={(e) => updateField("page", e.target.value)}
                    placeholder="e.g. 1 or 1,2,3"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-name`} className="text-xs">
                  Source name
                </Label>
                <Input
                  id={`${fieldId}-name`}
                  value={form.sourceName ?? ""}
                  onChange={(e) => updateField("sourceName", e.target.value)}
                  placeholder="Name shown to reviewers"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-org`} className="text-xs">
                  Organization
                </Label>
                <OrganizationCombobox
                  id={`${fieldId}-org`}
                  value={form.organization ?? ""}
                  onChange={(val) => updateField("organization", val)}
                />
              </div>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Source and source type are required.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!isValid || isSaving || isStarting}
              onClick={handleSave}
            >
              {isSaving ? "Saving..." : isEditing ? "Save changes" : "Add source"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SourceCard = ({ source }: { source: SourceItem }) => {
  const label = source.sourceName || source.source || "Untitled source";
  const details = [
    source.page !== undefined && source.page !== "" ? `Page ${source.page}` : null,
    source.organization || null,
    source.sourceReference || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-start gap-2.5 border-b border-border/50 py-2.5 first:pt-0 last:border-b-0 last:pb-0">
      <LinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {isUrl(source.source) ? (
          <a
            href={source.source}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-sm font-medium text-primary hover:underline"
          >
            {label}
          </a>
        ) : (
          <span className="break-words text-sm font-medium text-foreground/90">{label}</span>
        )}
        {details && <span className="break-words text-xs text-muted-foreground">{details}</span>}
      </div>
      {source.sourceType && (
        <Badge variant="outline" className="shrink-0 rounded-full text-[10px] font-medium">
          {SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType}
        </Badge>
      )}
    </li>
  );
};

const SourcesList = ({ sources }: { sources: SourceItem[] }) => {
  if (!sources || sources.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
        No sources yet — use Edit Source to add the first one.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {sources.map((source, idx) => (
        <SourceCard key={idx} source={source} />
      ))}
    </ul>
  );
};

const DetailFact = ({ label, value }: { label: string; value: string }) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <span className={SECTION_LABEL_CLASSES}>{label}</span>
    <span title={value} className="truncate text-sm text-foreground/90">
      {value}
    </span>
  </div>
);

// Formats a closure timestamp, falling back to an em dash when the value is missing.
const formatClosedAt = (value?: string, isTimeNeeded = true) =>
  value ? formatDate(new Date(value), isTimeNeeded) : "—";

const AnswerListItem = ({
  answer,
  isActive,
  onSelect,
}: {
  answer: ClosedAnswer;
  isActive: boolean;
  onSelect: () => void;
}) => {
  const sourceCount = answer.sources?.length ?? 0;

  return (
  <motion.button
    type="button"
    onClick={onSelect}
    aria-current={isActive}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.18, ease: "easeOut" }}
    className={cn(
      "flex w-full flex-col gap-2 border-b border-l-2 border-b-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0",
      isActive
        ? "border-l-primary bg-primary/10"
        : "border-l-transparent hover:bg-muted/60",
    )}
  >
    <p className="line-clamp-2 text-sm font-medium text-foreground">
      {answer.question?.text || "Question text unavailable"}
    </p>
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className={sourceCount > 0 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}>
        {sourceCount > 0
          ? `${sourceCount} source${sourceCount > 1 ? "s" : ""}`
          : "No sources"}
      </span>
      <span className="text-muted-foreground/50">·</span>
      <span className="text-muted-foreground">
        {formatClosedAt(answer.question?.closedAt ?? answer.updatedAt, false)}
      </span>
    </div>
  </motion.button>
  );
};

const AnswerDetail = ({ answer }: { answer: ClosedAnswer }) => (
  <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <p className={SECTION_LABEL_CLASSES}>Question</p>
          {answer.questionId && (
            <QuestionIdLink
              questionId={answer.questionId}
              className="font-mono text-[11px] text-muted-foreground"
            >
              {answer.questionId}
            </QuestionIdLink>
          )}
        </div>
        <h3 className="text-base font-semibold leading-snug text-foreground">
          {answer.question?.text || "Question text unavailable"}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3 border-y border-border/60 py-3 sm:grid-cols-4">
        <DetailFact label="Answered by" value={answer.author?.name || "—"} />
        <DetailFact label="Approved by" value={answer.approvedBy?.name || "—"} />
        <DetailFact label="Approvals" value={String(answer.approvalCount ?? 0)} />
        <DetailFact
          label="Closed"
          value={formatClosedAt(answer.question?.closedAt ?? answer.updatedAt)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className={SECTION_LABEL_CLASSES}>
            Sources {answer.sources?.length ? `(${answer.sources.length})` : ""}
          </p>
          <EditSourceDialog answer={answer} />
        </div>
        <SourcesList sources={answer.sources} />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className={SECTION_LABEL_CLASSES}>Answer</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
          {formatAiTags(answer.answer)}
        </p>
      </div>

      {answer.remarks && (
        <div className="flex flex-col gap-1.5">
          <p className={SECTION_LABEL_CLASSES}>Remarks</p>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {answer.remarks}
          </p>
        </div>
      )}
  </div>
);

const ANSWERS_PAGE_SIZE = 20;

// Offsets the sticky playground header and the tab container padding so the page fits
// the viewport and only the list and detail panes scroll.
const PAGE_HEIGHT_CLASSES = "h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-8.5rem)]";

export const ClosedAnswersPage = () => {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ClosedAnswerFiltersState>(
    EMPTY_CLOSED_ANSWER_FILTERS,
  );
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search);
  const observer = useRef<IntersectionObserver | null>(null);

  const {
    data,
    error,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useGetClosedAnswers(ANSWERS_PAGE_SIZE, debouncedSearch, filters);

  const answers = data?.pages.flatMap((page) => page?.answers ?? []) ?? [];
  const totalAnswers = data?.pages?.[0]?.totalAnswers ?? 0;
  const selectedAnswer =
    answers.find((answer) => answer._id === selectedAnswerId) ?? answers[0] ?? null;
  const hasActiveFilters = countActiveFilters(filters) > 0;

  // Fetches the next page once the sentinel at the end of the list scrolls into view.
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return;
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      });

      if (node) observer.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage],
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn("flex w-full min-w-0 flex-col gap-4", PAGE_HEIGHT_CLASSES)}>
        <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-semibold leading-tight text-foreground">
              Answer Sources
            </h2>
            <p className="text-sm text-muted-foreground">
              Add and update the sources backing each final answer
              {totalAnswers > 0 && ` — ${totalAnswers.toLocaleString()} answers`}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search question or answer..."
                className="pl-8"
              />
            </div>
            <ClosedAnswersFilters filters={filters} onChange={setFilters} />
          </div>
        </header>

        {error ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-destructive/40 text-sm text-destructive">
            Failed to load answers. Please try again.
          </div>
        ) : isLoading ? (
          <div className="relative min-h-0 w-full flex-1">
            <Spinner fullScreen={false} text="Loading answers" />
          </div>
        ) : answers.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            {hasActiveFilters
              ? "No answers match these filters."
              : "No answers found."}
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters(EMPTY_CLOSED_ANSWER_FILTERS)}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "grid min-h-0 flex-1 grid-rows-[minmax(140px,32%)_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[minmax(240px,320px)_1fr] lg:grid-rows-1",
              isFetching && !isFetchingNextPage && "opacity-60 transition-opacity",
            )}
          >
            <div className="relative min-h-0 border-b border-border lg:border-b-0 lg:border-r">
              <ScrollArea
                type="always"
                className="h-full [&_[data-orientation=vertical]]:w-1.5 [&_[data-orientation=vertical]>div]:bg-muted-foreground/30"
              >
                {answers.map((answer) => (
                  <AnswerListItem
                    key={answer._id}
                    answer={answer}
                    isActive={selectedAnswer?._id === answer._id}
                    onSelect={() => setSelectedAnswerId(answer._id)}
                  />
                ))}
                <div
                  ref={loadMoreRef}
                  className="flex items-center justify-center px-3 py-3 text-xs text-muted-foreground"
                >
                  {isFetchingNextPage
                    ? "Loading more answers..."
                    : hasNextPage
                      ? ""
                      : `All ${totalAnswers.toLocaleString()} answers loaded`}
                </div>
              </ScrollArea>
              {/* Hints that the list continues past the fold. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
            </div>

            <div className="min-h-0">
              <ScrollArea className="h-full">
                <AnimatePresence mode="wait" initial={false}>
                  {selectedAnswer ? (
                    <motion.div
                      key={selectedAnswer._id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                      <AnswerDetail answer={selectedAnswer} />
                    </motion.div>
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                      Select an answer to add its sources.
                    </div>
                  )}
                </AnimatePresence>
              </ScrollArea>
            </div>
          </div>
        )}
      </div>
    </MotionConfig>
  );
};
