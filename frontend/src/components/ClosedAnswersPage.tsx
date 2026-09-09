import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Search,
  Link as LinkIcon,
  ExternalLink,
  Plus,
  Check,
  ChevronsUpDown,
  RotateCcw,
  CircleDot,
  Circle,
  FileSearch,
  Eye,
  EyeOff,
  List,
  Shuffle,
  Keyboard,
  ArrowRight,
  Clock,
  GitCompare,
  Users,
  UserCheck,
  Minus,
  Flag,
  GitMerge,
  Undo2,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Button } from "@/components/atoms/button";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import Spinner from "@/components/atoms/spinner";
import { QuestionIdLink } from "@/features/chatbotDashboard/components/QuestionIdLink";
import {
  ClosedAnswersFilters,
  EMPTY_CLOSED_ANSWER_FILTERS,
  countActiveFilters,
} from "./ClosedAnswersFilters";
import { ClosedAnswersListDialog } from "./ClosedAnswersListDialog";
import { useGetClosedAnswers } from "@/hooks/api/answer/useGetClosedAnswers";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useSearchOrganizations } from "@/hooks/api/organization/useSearchOrganizations";
import { useLookupPopSource } from "@/hooks/api/pop/useLookupPopSource";
import { useStartNewSource } from "@/hooks/api/newSource/useStartNewSource";
import { useCompleteNewSource } from "@/hooks/api/newSource/useCompleteNewSource";
import { useCloseNewSource } from "@/hooks/api/newSource/useCloseNewSource";
import { useActiveNewSource } from "@/hooks/api/newSource/useActiveNewSource";
import { useReleaseNewSource } from "@/hooks/api/newSource/useReleaseNewSource";
import { useGetNewSourceByAnswerId } from "@/hooks/api/newSource/useGetNewSourceByAnswerId";
import { useChangeNewSourceStatus } from "@/hooks/api/newSource/useChangeNewSourceStatus";
import { useDebounce } from "@/hooks/ui/useDebounce";
import { formatDate } from "@/utils/formatDate";
import { cn } from "@/lib/utils";
import { ConfirmationModal } from "./confirmation-modal";
import type {
  ClosedAnswer,
  ClosedAnswerFilters as ClosedAnswerFiltersState,
  SourceItem,
  SourceType,
} from "@/types";
import type {
  NewSourceItem,
  NewSourceRecord,
  PopMatchStatus,
} from "@/hooks/services/newSourceService";

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

/** True when focus sits in a field, so list navigation stays out of typing. */
const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable
  );
};

/** Binds a window keydown listener once, always calling the latest handler. */
const useKeyDown = (handler: (event: KeyboardEvent) => void) => {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handlerRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
};

// Converts the AI answer markup into readable text by flattening tags into labelled lines.
export const formatAiTags = (text: string) => {
  if (!text) return "—";

  // 1. Replace key-value tags: <tag>value</tag> -> "Tag: value"
  let formatted = text.replace(/<([^>]+)>([^<]*)<\/\1>/g, (_match, tag, value) => {
    const label = tag.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    return `${label}: ${value.trim()}`;
  });

  // 2. Replace standalone opening tags: <tag> -> "\nTag:\n"
  formatted = formatted.replace(/<([^\/][^>]*)>/g, (_match, tag) => {
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
          className="w-full cursor-pointer justify-between bg-background font-normal"
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

const SourceRow = ({
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
    <div
      className={cn(
        "group flex items-center gap-2 border-b border-l-2 border-b-border/50 pr-2 transition-colors last:border-b-0",
        isActive
          ? "border-l-primary bg-primary/10"
          : "border-l-transparent hover:bg-accent/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left"
      >
        {isActive ? (
          <CircleDot className="h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
        )}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-xs font-medium text-foreground">
            {source.sourceName || source.source || `Source ${index + 1}`}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {typeLabel}
            {source.page !== undefined && source.page !== "" ? ` \u00b7 Page ${source.page}` : ""}
          </span>
        </span>
        {isActive && (
          <span className="ml-auto shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            Editing
          </span>
        )}
      </button>
      {isUrl(source.source) && (
        <a
          href={source.source}
          target="_blank"
          rel="noopener noreferrer"
          title="Open source"
          className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
};

const SourceReferenceLookup = ({
  source,
  onFound,
}: {
  source: string;
  // id is undefined when the lookup came back not found - matchStatus is still
  // reported as "notFound" so the caller can record that outcome per source.
  onFound?: (id: string | undefined, matchStatus: PopMatchStatus) => void;
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
        } else {
          onFound?.(undefined, "notFound");
        }
      },
    });
  };

  return (
    <div className="grid gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-fit cursor-pointer"
        onClick={handleClick}
        disabled={isPending}
      >
        <FileSearch className="h-3.5 w-3.5" />
        {isPending ? "Checking..." : "Fetch source reference"}
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

// A source entry as edited in this session - adds the ephemeral sourceReferenceStatus
// (from that source's own Fetch Source Reference lookup) that SourceItem doesn't carry.
type SourceDraft = SourceItem & { sourceReferenceStatus: PopMatchStatus | null };

const toSourceDraft = (source: SourceItem): SourceDraft => ({
  ...toSourceForm(source),
  sourceReferenceStatus: null,
});

const EMPTY_SOURCE_DRAFT: SourceDraft = { ...EMPTY_SOURCE_FORM, sourceReferenceStatus: null };

// The working area of the page: pick a source (or add one) and edit it in place.
const AnswerSourcesEditor = ({
  answer,
  startCollapsed = false,
}: {
  answer: ClosedAnswer;
  /** Moderators/admins land on the review, so the edit panel starts folded for them. */
  startCollapsed?: boolean;
}) => {
  const sources = answer.sources ?? [];
  const fieldId = useId();
  const [isOpen, setIsOpen] = useState(!startCollapsed);
  // Whoever put this answer's sources 'in-progress' owns finishing the review - any
  // other expert gets a read-only view until it's released back to 'pending'/completed.
  const isLockedByOther =
    answer.newSourceStatus === "in-progress" && !answer.isOwnInProgress;
  // A 'merged' record is done for good - an admin/moderator override, not something an
  // expert re-opens by editing sources again.
  const isMerged = answer.newSourceStatus === "merged";
  // Every existing source's in-progress edits, so picking a different source to edit
  // (e.g. to set its own organization) never drops another source's changes.
  const [drafts, setDrafts] = useState<SourceDraft[]>(() => sources.map(toSourceDraft));
  const [editingIndex, setEditingIndex] = useState<number | null>(
    sources.length > 0 ? 0 : null,
  );
  // Indices of existing sources the expert has stepped through with "Next". Save only
  // becomes available once every existing source has been confirmed this way.
  const [confirmedIndices, setConfirmedIndices] = useState<Set<number>>(new Set());
  const [newEntry, setNewEntry] = useState<SourceDraft>(EMPTY_SOURCE_DRAFT);
  const [newSourceId, setNewSourceId] = useState<string | null>(null);
  // The other answer's in-progress new_sources record this expert still owns, surfaced
  // so they can confirm switching to this answer before it's released back to pending.
  const [pendingSwitch, setPendingSwitch] = useState<NewSourceRecord | null>(null);
  const editStartedAtRef = useRef<number | null>(null);
  const sessionStartedRef = useRef(false);
  const newSourceIdRef = useRef<string | null>(null);

  const { mutate: startNewSource, isPending: isStarting } = useStartNewSource();
  const { mutate: completeNewSource, isPending: isSaving } = useCompleteNewSource();
  const { mutate: closeNewSource } = useCloseNewSource();
  const { mutate: findActiveElsewhere } = useActiveNewSource();
  const { mutate: releaseNewSource, isPending: isReleasing } = useReleaseNewSource();

  const isEditing = editingIndex !== null;
  const form = isEditing ? drafts[editingIndex] ?? EMPTY_SOURCE_DRAFT : newEntry;
  const isValid =
    form.source.trim().length > 0 &&
    Boolean(form.sourceType) &&
    form.sourceReferenceStatus !== null;
  // With more than one existing source, step through them with "Next" - Save only
  // shows up once confirming the one currently open would leave none unconfirmed, so
  // the last remaining source goes straight to "Save" instead of needing an extra
  // "Next" click first.
  const remainingAfterCurrent = new Set(confirmedIndices);
  if (editingIndex !== null) remainingAfterCurrent.add(editingIndex);
  const showNext =
    isEditing && sources.length > 1 && remainingAfterCurrent.size < sources.length;

  useEffect(() => {
    newSourceIdRef.current = newSourceId;
  }, [newSourceId]);

  // Stamps closedAt when the reviewer moves to another answer or leaves the page,
  // so abandoned edits still get a closing time.
  useEffect(
    () => () => {
      if (newSourceIdRef.current) closeNewSource(newSourceIdRef.current);
    },
    [closeNewSource],
  );

  // Creates the new_sources record as 'in-progress' on the first edit, giving
  // timeTaken a real start point without logging a record for idle browsing.
  const beginSession = () => {
    editStartedAtRef.current = Date.now();
    startNewSource(
      { answerId: answer._id, questionId: answer.questionId ?? "" },
      {
        onSuccess: (result) => {
          if (result?._id) setNewSourceId(result._id);
        },
        // Belt-and-suspenders: the list already hides editing behind isLockedByOther,
        // but another expert could still have started reviewing this answer moments
        // ago, in which case the backend rejects the start - surface that instead of
        // leaving the form silently stuck.
        onError: (err) => {
          toast.error(
            err instanceof Error
              ? err.message
              : "This answer is already being reviewed by another expert.",
          );
          sessionStartedRef.current = false;
        },
      },
    );
  };

  // Before starting a session, checks whether this expert still owns an 'in-progress'
  // source on a different answer - if so, they must confirm switching (which releases
  // that other source back to 'pending') before this one can start.
  const ensureSession = () => {
    if (sessionStartedRef.current || isLockedByOther || isMerged) return;
    sessionStartedRef.current = true;
    findActiveElsewhere(answer._id, {
      onSuccess: (record) => {
        if (record) {
          setPendingSwitch(record);
        } else {
          beginSession();
        }
      },
      // Fail open - don't block editing if the ownership check itself fails.
      onError: () => beginSession(),
    });
  };

  const cancelSwitch = () => {
    setPendingSwitch(null);
    // Let the next edit re-run the ownership check rather than getting stuck unstarted.
    sessionStartedRef.current = false;
  };

  const confirmSwitch = () => {
    if (!pendingSwitch) return;
    releaseNewSource(pendingSwitch._id, {
      onSuccess: () => {
        setPendingSwitch(null);
        beginSession();
      },
      onError: () => {
        toast.error("Couldn't release the other source. Try again.");
      },
    });
  };

  // Merges into whichever source is currently active - an existing one being edited,
  // or the not-yet-added new entry - so every other source's draft is left untouched.
  const updateActive = (patch: Partial<SourceDraft>) => {
    ensureSession();
    if (isEditing) {
      setDrafts((prev) =>
        prev.map((draft, i) => (i === editingIndex ? { ...draft, ...patch } : draft)),
      );
    } else {
      setNewEntry((prev) => ({ ...prev, ...patch }));
    }
  };

  const updateField = (field: keyof SourceItem, value: string) => {
    updateActive({ [field]: value } as Partial<SourceDraft>);
  };

  const selectSource = (index: number) => {
    ensureSession();
    setEditingIndex(index);
  };

  const startBlankSource = () => {
    ensureSession();
    setEditingIndex(null);
    setNewEntry(EMPTY_SOURCE_DRAFT);
  };

  const resetForm = () => {
    if (isEditing) {
      setDrafts((prev) =>
        prev.map((draft, i) => (i === editingIndex ? toSourceDraft(sources[editingIndex]) : draft)),
      );
    } else {
      setNewEntry(EMPTY_SOURCE_DRAFT);
    }
  };

  // Confirms the source currently being edited and advances to the next one that
  // hasn't been confirmed yet, wrapping around. Once every source is confirmed this
  // way, the button below switches from "Next" to "Save".
  const handleNext = () => {
    if (!isValid) {
      toast.error("Enter a source, select a source type, and fetch the source reference first.");
      return;
    }
    if (editingIndex === null) return;

    const updatedConfirmed = new Set(confirmedIndices);
    updatedConfirmed.add(editingIndex);
    setConfirmedIndices(updatedConfirmed);

    if (updatedConfirmed.size < sources.length) {
      let nextIndex = (editingIndex + 1) % sources.length;
      while (updatedConfirmed.has(nextIndex)) {
        nextIndex = (nextIndex + 1) % sources.length;
      }
      selectSource(nextIndex);
    }
  };

  const handleSave = () => {
    if (!isValid) {
      toast.error("Enter a source, select a source type, and fetch the source reference first.");
      return;
    }
    if (!newSourceId) {
      ensureSession();
      toast.error("Still preparing this edit - try again in a moment.");
      return;
    }

    // timeTaken is stored in seconds, not raw milliseconds.
    const timeTaken = editStartedAtRef.current
      ? Math.round((Date.now() - editStartedAtRef.current) / 1000)
      : 0;

    // Every source on the answer is saved together - not just the one being edited -
    // each carrying its own organization, sourceReference and sourceReferenceStatus
    // (from that source's own Fetch Source Reference lookup), plus sourceIndex: its
    // position in the answer's own sources array. Edits are logged to the new_sources
    // collection - the answer's own sources are never modified here.
    const finalSources: NewSourceItem[] = (isEditing ? drafts : [...drafts, newEntry]).map(
      (draft, index) => ({ ...draft, sourceIndex: index }),
    );

    completeNewSource(
      {
        id: newSourceId,
        sources: finalSources,
        timeTaken,
      },
      {
        onSuccess: () => {
          toast.success("Source details saved.");
          closeNewSource(newSourceId);
          setNewSourceId(null);
          sessionStartedRef.current = false;
          editStartedAtRef.current = null;
          setConfirmedIndices(new Set());
        },
        onError: (err) => {
          toast.error(
            err instanceof Error ? err.message : "Failed to save source details.",
          );
        },
      },
    );
  };

  if (isLockedByOther || isMerged) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
        <header className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <LinkIcon className="h-3.5 w-3.5" />
          </span>
          <p className="text-sm font-semibold text-foreground">
            Sources ({sources.length})
          </p>
        </header>
        <p className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          {isMerged
            ? "This answer's sources have been merged and can no longer be edited."
            : "Another expert is currently reviewing this answer's sources. It'll be editable again once they save or it's released back to Pending."}
        </p>
        {sources.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {sources.map((source, index) => (
              <SourceRow key={index} source={source} index={index} isActive={false} onSelect={() => {}} />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="flex cursor-pointer items-center gap-2 text-left"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <LinkIcon className="h-3.5 w-3.5" />
          </span>
          <p className="text-sm font-semibold text-foreground">
            Sources ({sources.length})
          </p>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="cursor-pointer"
          onClick={() => {
            setIsOpen(true);
            startBlankSource();
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add source
        </Button>
      </header>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="sources-editor-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-col gap-3 overflow-hidden"
          >
      {drafts.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {drafts.map((source, index) => (
            <SourceRow
              key={index}
              source={source}
              index={index}
              isActive={editingIndex === index}
              onSelect={() => selectSource(index)}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          No sources yet - fill the form below to add the first one.
        </p>
      )}

      <div className="grid gap-3 rounded-lg border border-border bg-card p-3.5 shadow-sm">
        <p className={SECTION_LABEL_CLASSES}>
          {isEditing ? `Editing source ${editingIndex + 1}` : "New source"}
        </p>

        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-source`} className="text-xs">
            Source <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${fieldId}-source`}
            className="bg-background"
            value={form.source}
            onChange={(e) => updateField("source", e.target.value)}
            placeholder="https://... or the document name"
            required
          />
          <SourceReferenceLookup
            key={editingIndex ?? "new"}
            source={form.source}
            onFound={(id, matchStatus) => {
              updateActive({ sourceReference: id, sourceReferenceStatus: matchStatus });
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
              <SelectTrigger id={`${fieldId}-type`} className="w-full cursor-pointer bg-background">
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
              className="bg-background"
              value={form.page ?? ""}
              onChange={(e) => updateField("page", e.target.value)}
              placeholder="e.g. 1 or 1,2,3"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-name`} className="text-xs">
              Source name
            </Label>
            <Input
              id={`${fieldId}-name`}
              className="bg-background"
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">
            Source and source type are required, and the source reference must be fetched.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={resetForm}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              className="cursor-pointer"
              disabled={!isValid || isSaving || isStarting}
              onClick={showNext ? handleNext : handleSave}
            >
              {isSaving
                ? "Saving..."
                : showNext
                  ? "Next"
                  : isEditing
                    ? "Save changes"
                    : "Add source"}
            </Button>
          </div>
        </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>


      <ConfirmationModal
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) cancelSwitch();
        }}
        title="Switch to this source?"
        description="You still have a source In Progress on another answer. Switching here will send that one back to Pending so another expert can pick it up."
        confirmText="Switch anyway"
        cancelText="Stay there"
        isLoading={isReleasing}
        onConfirm={confirmSwitch}
      />
    </section>
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

const MARKDOWN_COMPONENTS = {
  h1: (props: object) => <h4 className="mt-3 mb-1 text-sm font-semibold first:mt-0" {...props} />,
  h2: (props: object) => <h5 className="mt-3 mb-1 text-sm font-semibold first:mt-0" {...props} />,
  h3: (props: object) => <h6 className="mt-3 mb-1 text-sm font-semibold first:mt-0" {...props} />,
  p: (props: object) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
  ul: (props: object) => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
  ol: (props: object) => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
  strong: (props: object) => <strong className="font-semibold text-foreground" {...props} />,
  blockquote: (props: object) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground" {...props} />
  ),
  code: (props: object) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props} />
  ),
  a: (props: object) => (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2"
      {...props}
    />
  ),
  table: (props: object) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: (props: object) => (
    <th className="border border-border bg-muted/50 px-2 py-1 text-left font-medium" {...props} />
  ),
  td: (props: object) => <td className="border border-border px-2 py-1 align-top" {...props} />,
  hr: (props: object) => <hr className="my-3 border-border" {...props} />,
};

// The answer is reference material here, so it stays folded until asked for.
const AnswerBody = ({ answer }: { answer: ClosedAnswer }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className={SECTION_LABEL_CLASSES}>Answer</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer"
          onClick={() => setIsVisible((prev) => !prev)}
        >
          {isVisible ? (
            <>
              <EyeOff className="h-3.5 w-3.5" />
              Hide answer
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" />
              View answer
            </>
          )}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="break-words text-sm leading-relaxed text-foreground/90"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {formatAiTags(answer.answer)}
            </ReactMarkdown>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NEW_SOURCE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  "in-progress": "In Progress",
  completed: "Completed",
  flagged: "Flagged",
  merged: "Merged",
};

const NEW_SOURCE_STATUS_BADGE_CLASSES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  "in-progress": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  flagged: "bg-red-500/15 text-red-600 dark:text-red-400",
  merged: "bg-primary/15 text-primary",
};

const AnswerListItem = ({
  answer,
  isActive,
  showNewSourceStatus,
  onSelect,
}: {
  answer: ClosedAnswer;
  isActive: boolean;
  showNewSourceStatus: boolean;
  onSelect: () => void;
}) => {
  const sourceCount = answer.sources?.length ?? 0;
  const newSourceStatus = answer.newSourceStatus;

  return (
  <motion.button
    type="button"
    data-answer-id={answer._id}
    onClick={onSelect}
    aria-current={isActive}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.18, ease: "easeOut" }}
    className={cn(
      "flex w-full cursor-pointer flex-col gap-2 border-b border-l-2 border-b-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0",
      isActive
        ? "border-l-primary bg-primary/10"
        : "border-l-transparent hover:bg-accent/60",
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
      {showNewSourceStatus && newSourceStatus && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
            NEW_SOURCE_STATUS_BADGE_CLASSES[newSourceStatus] ?? "bg-muted text-muted-foreground",
          )}
        >
          {NEW_SOURCE_STATUS_LABELS[newSourceStatus] ?? newSourceStatus}
          {newSourceStatus === "in-progress" && !answer.isOwnInProgress ? " · Locked" : ""}
        </span>
      )}
      {showNewSourceStatus && answer.hasNotFoundReference && (
        <span
          className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-none text-red-600 dark:text-red-400"
          title="A source on this answer had no matching reference"
        >
          Not found
        </span>
      )}
    </div>
  </motion.button>
  );
};

const SOURCE_REFERENCE_STATUS_LABELS: Record<string, string> = {
  duplicateMatch: "Duplicate match",
  topLevelMatch: "Top-level match",
  notFound: "Not found",
};

// One entry in the Before/After comparison. `side` colours it: red for the answer's
// current sources, green for what the reviewer recorded. Accepts both SourceItem
// (Before) and NewSourceItem (After) shapes - sourceReferenceStatus only exists on the
// latter and simply doesn't render for Before entries.
type ReviewSource = {
  source: string;
  sourceType?: string;
  sourceName?: string;
  page?: string | number;
  organization?: string;
  sourceReference?: string;
  sourceReferenceStatus?: PopMatchStatus | null;
};

const SOURCE_SIDE_STYLES = {
  before: {
    container: "border-red-500/30 bg-red-500/5",
    rail: "bg-red-500/60",
    icon: "text-red-600 dark:text-red-400",
    iconBg: "bg-red-500/15",
  },
  after: {
    container: "border-emerald-500/30 bg-emerald-500/5",
    rail: "bg-emerald-500/60",
    icon: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/15",
  },
} as const;

const SourceDetailLine = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <p className="flex min-w-0 gap-1.5 text-xs">
    <span className="shrink-0 text-muted-foreground/70">{label}</span>
    <span className="min-w-0 break-all text-foreground/90">{children}</span>
  </p>
);

const SourceChangeItem = ({
  source,
  side,
  index,
}: {
  source: ReviewSource;
  side: "before" | "after";
  index: number;
}) => {
  const styles = SOURCE_SIDE_STYLES[side];

  return (
    <div
      className={cn(
        "relative flex h-full min-w-0 flex-col gap-1 overflow-hidden rounded-lg border py-2 pl-4 pr-3",
        styles.container,
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", styles.rail)} />

      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
            styles.iconBg,
            styles.icon,
          )}
        >
          {side === "before" ? (
            <Minus className="h-3 w-3" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {source.sourceName || `Source ${index + 1}`}
        </p>
        {source.sourceType && (
          <span className="shrink-0 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType}
          </span>
        )}
      </div>

      <SourceDetailLine label="Source">
        {isUrl(source.source) ? (
          <a
            href={source.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {source.source}
          </a>
        ) : (
          source.source || "—"
        )}
      </SourceDetailLine>

      {source.page !== undefined && source.page !== "" && (
        <SourceDetailLine label="Page">{source.page}</SourceDetailLine>
      )}
      {source.organization && (
        <SourceDetailLine label="Org">{source.organization}</SourceDetailLine>
      )}
      {source.sourceReference && (
        <SourceDetailLine label="Reference">{source.sourceReference}</SourceDetailLine>
      )}
      {source.sourceReferenceStatus && (
        <SourceDetailLine label="Match">
          <span
            className={cn(
              source.sourceReferenceStatus === "notFound"
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {SOURCE_REFERENCE_STATUS_LABELS[source.sourceReferenceStatus] ??
              source.sourceReferenceStatus}
          </span>
        </SourceDetailLine>
      )}
    </div>
  );
};

// The three states an admin/moderator can force a record into (see
// NewSourceService.changeStatus) - 'in-progress' and 'completed' are reached by the
// reviewer's own flow, not by an override. Each needs a reason, asked for in a modal.
const STATUS_OVERRIDE_ACTIONS: {
  value: "pending" | "merged" | "flagged";
  label: string;
  icon: typeof Flag;
  title: string;
  description: string;
  confirmLabel: string;
  variant: "secondary" | "destructive" | "default";
}[] = [
  {
    value: "pending",
    label: "Move to pending",
    icon: Undo2,
    title: "Move this review back to pending",
    description:
      "The record returns to the queue so an expert can pick it up and redo the sources.",
    confirmLabel: "Move to pending",
    variant: "secondary",
  },
  {
    value: "flagged",
    label: "Flag",
    icon: Flag,
    title: "Flag this review",
    description:
      "Marks the review as needing attention. It stays visible but is set apart from completed work.",
    confirmLabel: "Flag review",
    variant: "destructive",
  },
  {
    value: "merged",
    label: "Merge",
    icon: GitMerge,
    title: "Mark this review as merged",
    description:
      "Records that the reviewer's sources have been folded into the answer's own sources.",
    confirmLabel: "Mark as merged",
    variant: "default",
  },
];

const StatusOverrideControl = ({
  answer,
  newSourceRecord,
}: {
  answer: ClosedAnswer;
  newSourceRecord: NewSourceRecord;
}) => {
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<
    (typeof STATUS_OVERRIDE_ACTIONS)[number] | null
  >(null);
  const [reason, setReason] = useState("");
  const { mutate: changeStatus, isPending } = useChangeNewSourceStatus();

  const openAction = (action: (typeof STATUS_OVERRIDE_ACTIONS)[number]) => {
    setReason("");
    setActiveAction(action);
  };

  const handleConfirm = () => {
    if (!activeAction) return;
    if (!reason.trim()) {
      toast.error("A reason is required to change this status.");
      return;
    }

    changeStatus(
      { id: newSourceRecord._id, status: activeAction.value, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Status changed to ${activeAction.value}.`);
          setReason("");
          setActiveAction(null);
          queryClient.invalidateQueries({
            queryKey: ["new-source-by-answer", answer._id],
          });
        },
        onError: (error: Error) => {
          toast.error(error.message || "Failed to change status.");
        },
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
      <p className={SECTION_LABEL_CLASSES}>Change status</p>
      <div className="flex flex-wrap gap-2">
        {STATUS_OVERRIDE_ACTIONS.map((action) => {
          const Icon = action.icon;
          const isCurrent = newSourceRecord.status === action.value;

          return (
            <Button
              key={action.value}
              type="button"
              size="sm"
              variant={action.variant}
              className="cursor-pointer gap-1.5"
              disabled={isCurrent || isPending}
              title={isCurrent ? `Already ${action.value}` : action.title}
              onClick={() => openAction(action)}
            >
              <Icon className="h-3.5 w-3.5" />
              {action.label}
            </Button>
          );
        })}
      </div>

      <Dialog
        open={activeAction !== null}
        onOpenChange={(open) => !open && setActiveAction(null)}
      >
        <DialogContent className="w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeAction && <activeAction.icon className="h-4 w-4" />}
              {activeAction?.title}
            </DialogTitle>
            <DialogDescription>{activeAction?.description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="status-change-reason" className="text-xs">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Input
              id="status-change-reason"
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this status changing?"
              className="bg-background"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => setActiveAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeAction?.variant === "destructive" ? "destructive" : "default"}
              className="cursor-pointer"
              disabled={!reason.trim() || isPending}
              onClick={handleConfirm}
            >
              {isPending ? "Applying…" : activeAction?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Formats a duration stored in seconds (NewSourceReviewEntry.timeTaken) as "1h 4m",
// "12m 5s", or "38s" - null/undefined (not yet saved) renders as an em dash.
const formatTimeTaken = (seconds?: number | null) => {
  if (seconds === null || seconds === undefined) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

// Moderator/admin-only: every expert who has reviewed this answer's sources (a record
// can carry more than one entry - e.g. after being released back to 'pending' and picked
// up by someone else), laid out like the allocation queue on the question details page.
const REVIEWER_CARD_STYLES = {
  saved: {
    container: "border-green-300 bg-green-100 dark:border-green-700 dark:bg-green-900/30",
    iconBg: "bg-green-200 dark:bg-green-800/40",
    icon: "text-green-700 dark:text-green-400",
    badge:
      "border border-green-300 bg-green-100 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  open: {
    container: "border-amber-300 bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30",
    iconBg: "bg-amber-200 dark:bg-amber-800/40",
    icon: "text-amber-700 dark:text-amber-400",
    badge:
      "border border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
} as const;

const ReviewersList = ({ reviewArray }: { reviewArray: NewSourceRecord["reviewArray"] }) => (
  <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Users className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm font-semibold text-foreground">
        Reviewers ({reviewArray.length})
      </p>
    </div>

    {reviewArray.length > 0 ? (
      <div className="flex flex-wrap items-start gap-4">
        {reviewArray.map((entry, index) => {
          const styles = entry.isSaved
            ? REVIEWER_CARD_STYLES.saved
            : REVIEWER_CARD_STYLES.open;

          return (
            <div
              key={`${entry.userId}-${index}`}
              className="flex flex-col items-center gap-1.5"
              title={`${entry.name || "Unknown reviewer"} · started ${formatClosedAt(entry.startedAt)}`}
            >
              <div
                className={cn(
                  "flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-full border-2 p-2 text-center transition-all duration-300 hover:scale-105 hover:shadow-lg",
                  styles.container,
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    styles.iconBg,
                    styles.icon,
                  )}
                >
                  {entry.isSaved ? (
                    <UserCheck className="h-4 w-4" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                </span>
                <p className="w-full truncate px-1 text-[11px] font-semibold text-foreground">
                  {entry.name || "Unknown"}
                </p>
              </div>

              <span
                className={cn(
                  "whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  styles.badge,
                )}
              >
                {entry.isSaved ? formatTimeTaken(entry.timeTaken) : "In progress"}
              </span>
            </div>
          );
        })}
      </div>
    ) : (
      <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
        No one has reviewed these sources yet.
      </p>
    )}
  </div>
);

// Compares the answer's sources as they stand in the answers collection (Before, red)
// against what the assigned expert recorded in new_sources (After, green), so a
// moderator/admin can see what changed without opening the edit panel below it, plus
// the reviewer queue and the status-override control.
const SourceChangesSection = ({ answer }: { answer: ClosedAnswer }) => {
  const { data: newSourceRecord, isLoading } = useGetNewSourceByAnswerId(answer._id, {
    enabled: true,
  });
  const beforeSources = answer.sources ?? [];
  const afterSources = newSourceRecord?.sources ?? [];
  const recordStatus = newSourceRecord?.status;
  // Rows are paired by position, so each source lines up with its reviewed counterpart.
  const pairCount = Math.max(beforeSources.length, afterSources.length);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <GitCompare className="h-3.5 w-3.5" />
          </span>
          <p className="text-sm font-semibold text-foreground">Source changes</p>
        </div>
        {recordStatus && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
              NEW_SOURCE_STATUS_BADGE_CLASSES[recordStatus] ?? "bg-muted text-muted-foreground",
            )}
          >
            {NEW_SOURCE_STATUS_LABELS[recordStatus] ?? recordStatus}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          Loading review…
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)]">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Before · on the answer ({beforeSources.length})
            </p>
            <span className="hidden lg:block" />
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              After · reviewer's version ({afterSources.length})
            </p>
          </div>

          {pairCount === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
              No sources on the answer and no review recorded yet.
            </p>
          ) : (
            Array.from({length: pairCount}).map((_, index) => {
              const before = beforeSources[index];
              const after = afterSources[index];

              return (
                <div
                  key={index}
                  className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)]"
                >
                  {before ? (
                    <SourceChangeItem source={before} side="before" index={index} />
                  ) : (
                    <p className="flex items-center rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                      Not on the answer
                    </p>
                  )}

                  <div className="hidden items-center justify-center text-muted-foreground/50 lg:flex">
                    <ArrowRight className="h-4 w-4" />
                  </div>

                  {after ? (
                    <SourceChangeItem source={after} side="after" index={index} />
                  ) : (
                    <p className="flex items-center rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                      Not in the review
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {newSourceRecord && <ReviewersList reviewArray={newSourceRecord.reviewArray} />}

      {newSourceRecord && (
        <StatusOverrideControl answer={answer} newSourceRecord={newSourceRecord} />
      )}
    </div>
  );
};

const AnswerDetail = ({
  answer,
  isModerator,
  isAdmin,
}: {
  answer: ClosedAnswer;
  isModerator: boolean;
  isAdmin: boolean;
}) => (
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

    <div className="grid grid-cols-2 gap-3 border-b border-border/60 pb-3 sm:grid-cols-4">
      <DetailFact label="Answered by" value={answer.author?.name || "—"} />
      <DetailFact label="Approved by" value={answer.approvedBy?.name || "—"} />
      <DetailFact label="Approvals" value={String(answer.approvalCount ?? 0)} />
      <DetailFact
        label="Closed"
        value={formatClosedAt(answer.question?.closedAt ?? answer.updatedAt)}
      />
    </div>

    {(isModerator || isAdmin) && <SourceChangesSection answer={answer} />}

    <AnswerSourcesEditor answer={answer} startCollapsed={isModerator || isAdmin} />

    <AnswerBody answer={answer} />

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

const Kbd = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <kbd
    className={cn(
      "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-sans text-[11px] font-medium text-foreground/80",
      className,
    )}
  >
    {children}
  </kbd>
);

const TOOLTIP_KBD_CLASSES =
  "border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground";

const ANSWERS_PAGE_SIZE = 20;

// A fresh seed reshuffles the list; the same seed keeps paging stable while scrolling.
const createShuffleSeed = () => Math.floor(Math.random() * 999982) + 1;

// Offsets the sticky playground header and the tab container padding so the page fits
// the viewport and only the list and detail panes scroll.
const PAGE_HEIGHT_CLASSES = "h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-8.5rem)]";

export const ClosedAnswersPage = () => {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ClosedAnswerFiltersState>(
    EMPTY_CLOSED_ANSWER_FILTERS,
  );
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [isListOpen, setIsListOpen] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(createShuffleSeed);
  const debouncedSearch = useDebounce(search);
  const observer = useRef<IntersectionObserver | null>(null);
  const { data: currentUser } = useGetCurrentUser({});
  const isModerator = currentUser?.role === "moderator";
  const isAdmin = currentUser?.role === "admin";
  // Moderators and admins review what experts recorded; they don't add sources here.
  const isReviewer = isModerator || isAdmin;
  const pageTitle = isReviewer ? "Source Reviews" : "Answer Sources";
  const pageDescription = isReviewer
    ? "Review the sources experts recorded against each final answer"
    : "Add and update the sources backing each final answer";

  const {
    data,
    error,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useGetClosedAnswers(ANSWERS_PAGE_SIZE, debouncedSearch, {
    ...filters,
    shuffleSeed,
  });

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

  // Moves the selection one row and keeps the newly selected row in view.
  const moveSelection = (offset: number) => {
    if (answers.length === 0) return;
    const currentIndex = answers.findIndex(
      (answer) => answer._id === selectedAnswer?._id,
    );
    const nextIndex = Math.min(
      Math.max(currentIndex + offset, 0),
      answers.length - 1,
    );
    const nextAnswer = answers[nextIndex];
    if (!nextAnswer) return;

    setSelectedAnswerId(nextAnswer._id);
    document
      .querySelector(`[data-answer-id="${nextAnswer._id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  // Rerolls the order and lands the detail pane on the first answer of the new list.
  const shuffleAnswers = () => {
    setShuffleSeed(createShuffleSeed());
    setSelectedAnswerId(null);
  };

  // Arrow keys walk the answer list, as long as the reviewer is not typing.
  useKeyDown((event) => {
    if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      shuffleAnswers();
    }
  });

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn("flex w-full min-w-0 flex-col gap-4", PAGE_HEIGHT_CLASSES)}>
        <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-semibold leading-tight text-foreground">
              {pageTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {pageDescription}
              {totalAnswers > 0 && ` — ${totalAnswers.toLocaleString()} answers`}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search question, answer or paste an ID..."
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer gap-2"
                onClick={shuffleAnswers}
                title="Reshuffle the answer list (S)"
              >
                <Shuffle className="h-3.5 w-3.5" />
                Shuffle
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer gap-2"
                onClick={() => setIsListOpen(true)}
                title="Open the full list"
              >
                <List className="h-3.5 w-3.5" />
                Full list
              </Button>
              <ClosedAnswersFilters
                filters={filters}
                onChange={setFilters}
                showReferenceStatusFilter={isAdmin}
                showReviewStatusFilter={isReviewer}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer text-muted-foreground"
                    aria-label="Keyboard shortcuts"
                  >
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent align="end" className="p-0">
                  <div className="grid gap-1.5 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                      Keyboard shortcuts
                    </p>
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span>Switch answers</span>
                      <span className="flex items-center gap-1">
                        <Kbd className={TOOLTIP_KBD_CLASSES}>↑</Kbd>
                        <Kbd className={TOOLTIP_KBD_CLASSES}>↓</Kbd>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span>Shuffle the list</span>
                      <Kbd className={TOOLTIP_KBD_CLASSES}>S</Kbd>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
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
                    showNewSourceStatus
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

            <div className="min-h-0 min-w-0">
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
                      <AnswerDetail
                        answer={selectedAnswer}
                        isModerator={isModerator}
                        isAdmin={isAdmin}
                      />
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

      <ClosedAnswersListDialog
        open={isListOpen}
        onOpenChange={setIsListOpen}
        answers={answers}
        totalAnswers={totalAnswers}
        selectedAnswerId={selectedAnswer?._id}
        onSelect={setSelectedAnswerId}
        search={search}
        onSearchChange={setSearch}
        filters={filters}
        onFiltersChange={setFilters}
        showReferenceStatusFilter={isAdmin}
        showReviewStatusFilter={isReviewer}
        hasNextPage={Boolean(hasNextPage)}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        formatClosedAt={formatClosedAt}
      />

    </MotionConfig>
  );
};
