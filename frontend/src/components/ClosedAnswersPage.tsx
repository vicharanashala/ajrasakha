import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
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
  UserMinus,
  Minus,
  Flag,
  Undo2,
  ChevronDown,
  History,
  CheckCheck,
  FlagOff,
  MousePointerClick,
  AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Checkbox } from "@/components/atoms/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/atoms/radio-group";
import { Button } from "@/components/atoms/button";
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
import { ClosedAnswersGuide } from "./ClosedAnswersGuide";
import { useGetClosedAnswers } from "@/hooks/api/answer/useGetClosedAnswers";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useSearchOrganizations } from "@/hooks/api/organization/useSearchOrganizations";
import { useLookupPopSource } from "@/hooks/api/pop/useLookupPopSource";
import { useUpdatePopMissingFields } from "@/hooks/api/pop/useUpdatePopMissingFields";
import { useStartNewSource } from "@/hooks/api/newSource/useStartNewSource";
import { useCompleteNewSource } from "@/hooks/api/newSource/useCompleteNewSource";
import { useRecordMissingPopDocument } from "@/hooks/api/newSource/useRecordMissingPopDocument";
import { useCloseNewSource } from "@/hooks/api/newSource/useCloseNewSource";
import { useActiveNewSource } from "@/hooks/api/newSource/useActiveNewSource";
import { useReleaseNewSource } from "@/hooks/api/newSource/useReleaseNewSource";
import { useGetNewSourceByAnswerId } from "@/hooks/api/newSource/useGetNewSourceByAnswerId";
import { useChangeNewSourceStatus } from "@/hooks/api/newSource/useChangeNewSourceStatus";
import { useDebounce } from "@/hooks/ui/useDebounce";
import { formatDate } from "@/utils/formatDate";
import { cn } from "@/lib/utils";
import { ConfirmationModal } from "./confirmation-modal";
import { useStartModeratorReview } from "@/hooks/api/newSource/useStartModeratorReview";
import { useActiveModeratorReview } from "@/hooks/api/newSource/useActiveModeratorReview";
import { useReleaseModeratorReview } from "@/hooks/api/newSource/useReleaseModeratorReview";
import type {
  ClosedAnswer,
  ClosedAnswersResponse,
  ClosedAnswerFilters as ClosedAnswerFiltersState,
  Organization,
  SourceItem,
  SourceType,
} from "@/types";
import type {
  NewSourceItem,
  NewSourceRecord,
  NewSourceReviewEntry,
  ModeratorAction,
  ModeratorActionType,
  PopMatchStatus,
} from "@/hooks/services/newSourceService";
import type { PopLookupResult, PopRequiredField } from "@/hooks/services/popService";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  hyper_local: "Hyper Local",
  state: "State",
  central: "Central",
  district: "District",
  MODERATOR_REVIEW: "Moderator Review",
  other: "Other",
};

// Organization records only ever carry one of these three types (see IOrganization) -
// letting the combobox filter by it narrows a name search across many same-named orgs
// down to the level the expert actually means (e.g. "district" vs "state" office).
const ORG_TYPE_FILTER_OPTIONS: {value: NonNullable<Organization["type"]>; label: string}[] = [
  {value: "central", label: "Central"},
  {value: "state", label: "State"},
  {value: "district", label: "District"},
];

const SECTION_LABEL_CLASSES =
  "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80";

const isUrl = (value: string) => /^https?:\/\//i.test(value);

// Turns free text like "4" or "4, 7, 10-12" into the canonical number[] the backend
// stores - the natural way to type a page reference isn't a dynamic array of number
// inputs, so this is parsed from one text field instead.
const parsePageNumbers = (input: string): number[] => {
  const pages = new Set<number>();
  for (const part of input.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      for (let page = Math.min(start, end); page <= Math.max(start, end); page++) {
        pages.add(page);
      }
      continue;
    }

    const page = Number(trimmed);
    if (Number.isFinite(page)) pages.add(page);
  }
  return Array.from(pages).sort((a, b) => a - b);
};

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

const OrganizationCombobox = ({
  id,
  value,
  onChange,
  runWithSession,
}: {
  id?: string;
  value: string;
  // Passes the whole organization, not just its name - the caller also derives Source
  // type from org.type (see AnswerSourcesEditor), which the trigger label doesn't need.
  onChange: (org: Organization) => void;
  /** Opens the list only once this expert owns the review - the search query is tied to
   *  the popover being open, so a pending switch confirmation makes no request. */
  runWithSession?: (action: () => void) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<
    NonNullable<Organization["type"]> | undefined
  >(undefined);
  const debouncedQuery = useDebounce(query);

  const { data, isFetching } = useSearchOrganizations(
    debouncedQuery,
    open,
    typeFilter,
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setOpen(false);
      return;
    }
    if (runWithSession) {
      runWithSession(() => setOpen(true));
      return;
    }
    setOpen(true);
  };
  const organizations = data?.organizations ?? [];

  return (
    // modal — without it, this Popover (nested inside the Edit Source Dialog) inherits
    // the Dialog's `pointer-events: none` on <body>: it renders but nothing inside is
    // clickable or scrollable. modal makes the Popover re-enable pointer-events on
    // itself, the same way the Source Type Select already does.
    <Popover open={open} onOpenChange={handleOpenChange} modal>
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
          <div className="flex flex-wrap gap-1 border-b border-border/60 p-1.5">
            <Button
              type="button"
              size="sm"
              variant={typeFilter === undefined ? "secondary" : "ghost"}
              className="h-6 cursor-pointer px-2 text-[11px]"
              onClick={() => setTypeFilter(undefined)}
            >
              All types
            </Button>
            {ORG_TYPE_FILTER_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={typeFilter === opt.value ? "secondary" : "ghost"}
                className="h-6 cursor-pointer px-2 text-[11px]"
                onClick={() => setTypeFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
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
                        onChange(org);
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
                      {org.type && (
                        <span className="ml-2 shrink-0 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {SOURCE_TYPE_LABELS[org.type] ?? org.type}
                        </span>
                      )}
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
  // Structural, not SourceItem, so this also accepts a SourceDraft (the editing list) -
  // only these fields are actually used here.
  source: {
    sourceType?: SourceType;
    sourceName?: string;
    source: string;
    yearOfRelease?: string | number;
  };
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
            {source.yearOfRelease !== undefined && source.yearOfRelease !== ""
              ? ` \u00b7 Year ${source.yearOfRelease}`
              : ""}
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

// What a lookup hands back to the caller once a usable match is confirmed (immediately,
// or after the missing-fields modal is saved) - besides the match id/status,
// year_of_release/shareable_name/live_source_link from pop_unique_documents autofill
// this source's display-only fields (see AnswerSourcesEditor).
type SourceReferenceLookupResult = {
  sourceReferenceId: string | undefined;
  matchStatus: PopMatchStatus;
  sourceName: string;
  yearOfRelease: number | string;
  sourceLink: string;
  /** The matched document's own Annam.AI archived copy, when it has one. */
  archivedLink: string;
  // Which of year_of_release/live_source_link/shareable_name were identified as missing
  // on the matched document when it was first fetched - empty when nothing was missing.
  missedFields: PopRequiredField[];
};

// Display labels only - the pop document's own field names (year_of_release,
// live_source_link) are unchanged.
const POP_FIELD_LABELS: Record<PopRequiredField, string> = {
  year_of_release: "Year of publication",
  live_source_link: "Original link",
  shareable_name: "Document name",
};

// These values are written to the shared pop repository, so each field is checked
// against its own rule rather than just being non-empty - a typo here follows every
// answer that cites the document.
const validatePopField = (field: PopRequiredField, rawValue: string): string | null => {
  const value = rawValue.trim();
  if (!value) return `${POP_FIELD_LABELS[field]} is required.`;

  if (field === "year_of_release") {
    if (!/^\d{4}$/.test(value)) return "Enter a 4-digit year, for example 2019.";

    const year = Number(value);
    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear) {
      return `Enter a year between 1900 and ${currentYear}.`;
    }
    return null;
  }

  if (field === "live_source_link") {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return "Enter a full link, for example https://example.com/document.pdf";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "The link must start with http:// or https://";
    }
    if (!parsed.hostname.includes(".")) {
      return "Enter a full link, for example https://example.com/document.pdf";
    }
    return null;
  }

  if (value.length < 3) return "Enter at least 3 characters.";
  if (value.length > 200) return "Keep the name under 200 characters.";
  return null;
};

// Shown when a match is found but is missing one or more of year_of_release/
// live_source_link/shareable_name - the reviewer fills them in before the match is used,
// so a source is never saved against an incomplete pop_unique_documents record.
const PopMissingFieldsModal = ({
  open,
  popId,
  missingFields,
  onSaved,
  onCancel,
}: {
  open: boolean;
  popId: string | null;
  missingFields: PopRequiredField[];
  onSaved: (
    result: PopLookupResult,
    values: Partial<Record<PopRequiredField, string>>,
  ) => void;
  onCancel: () => void;
}) => {
  const [values, setValues] = useState<Partial<Record<PopRequiredField, string>>>({});
  // A field only shows its error once the reviewer has left it or tried to save, so
  // typing a year doesn't flash an error on every keystroke.
  const [touchedFields, setTouchedFields] = useState<PopRequiredField[]>([]);
  const { mutate, isPending } = useUpdatePopMissingFields();

  useEffect(() => {
    if (open) {
      setValues({});
      setTouchedFields([]);
    }
  }, [open]);

  const errors = missingFields.reduce<Partial<Record<PopRequiredField, string>>>(
    (all, field) => {
      const error = validatePopField(field, values[field] ?? "");
      if (error) all[field] = error;
      return all;
    },
    {},
  );
  const hasErrors = Object.keys(errors).length > 0;

  const markTouched = (field: PopRequiredField) =>
    setTouchedFields((prev) => (prev.includes(field) ? prev : [...prev, field]));

  const handleSave = () => {
    if (!popId) return;
    if (hasErrors) {
      setTouchedFields(missingFields);
      return;
    }

    // Only the trimmed values reach the pop repository - stray whitespace would
    // otherwise be saved onto the shared document.
    const trimmedValues = Object.fromEntries(
      missingFields.map((field) => [field, (values[field] ?? "").trim()]),
    ) as Record<PopRequiredField, string>;

    mutate(
      { id: popId, fields: trimmedValues },
      {
        onSuccess: (result) => {
          if (!result) {
            toast.error("Failed to update this document. Try again.");
            return;
          }
          toast.success("Document details saved.");
          onSaved(result, trimmedValues);
        },
        onError: (error: Error) =>
          toast.error(error.message || "Failed to update this document."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Missing document details</DialogTitle>
          <DialogDescription>
            This matched document is missing some details - fill them in to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            Saving writes these values to the document in our pop repository, not just to
            this answer. Every answer that cites this document will use them from now on,
            so please double-check each value before you save.
          </p>
        </div>

        <div className="grid gap-3">
          {missingFields.map((field, index) => {
            const error = touchedFields.includes(field) ? errors[field] : undefined;

            return (
              <div key={field} className="grid gap-1.5">
                <Label htmlFor={`pop-missing-${field}`} className="text-xs">
                  {POP_FIELD_LABELS[field]} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`pop-missing-${field}`}
                  autoFocus={index === 0}
                  value={values[field] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field]: e.target.value }))
                  }
                  onBlur={() => markTouched(field)}
                  inputMode={field === "year_of_release" ? "numeric" : undefined}
                  maxLength={field === "year_of_release" ? 4 : undefined}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `pop-missing-${field}-error` : undefined}
                  placeholder={
                    field === "live_source_link"
                      ? "https://example.com/document.pdf"
                      : field === "year_of_release"
                        ? "2019"
                        : POP_FIELD_LABELS[field]
                  }
                  className={cn(
                    "bg-background",
                    error && "border-destructive focus-visible:ring-destructive/30",
                  )}
                />
                {error && (
                  <p
                    id={`pop-missing-${field}-error`}
                    className="text-xs text-destructive"
                  >
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="cursor-pointer"
            disabled={isPending}
            onClick={handleSave}
          >
            {isPending ? "Saving..." : "Save and continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SourceReferenceLookup = ({
  source,
  onFound,
  runWithSession,
  answerId,
  className,
}: {
  source: string;
  onFound?: (result: SourceReferenceLookupResult) => void;
  /** Runs the lookup only once this expert owns the review - if they still hold one on
   *  another answer, the switch confirmation opens first and no request is made. */
  runWithSession?: (action: () => void) => void;
  /** The answer being reviewed - an incomplete pop document is logged against whichever
   *  updated_sources record currently backs it. */
  answerId: string;
  className?: string;
}) => {
  const { mutate, isPending } = useLookupPopSource();
  const { mutate: recordMissingPopDocument } = useRecordMissingPopDocument();
  const [missingModal, setMissingModal] = useState<{
    id: string;
    fields: PopRequiredField[];
  } | null>(null);
  // Which fields were missing when the match was first fetched, kept around so it still
  // reaches emitFound after the modal resolves them (by then the fresh lookup result's
  // own missingFields is empty).
  const identifiedMissingFieldsRef = useRef<PopRequiredField[]>([]);

  const emitFound = (result: PopLookupResult) => {
    if (result.found && result._id) {
      onFound?.({
        sourceReferenceId: result._id,
        matchStatus: result.matchStatus ?? "topLevelMatch",
        sourceName: result.shareable_name ?? "",
        yearOfRelease: result.year_of_release ?? "",
        sourceLink: result.live_source_link || result.shareable_link || "",
        archivedLink: result.shareable_link ?? "",
        missedFields: identifiedMissingFieldsRef.current,
      });
    } else {
      onFound?.({
        sourceReferenceId: undefined,
        matchStatus: "notFound",
        sourceName: "",
        yearOfRelease: "",
        sourceLink: "",
        archivedLink: "",
        missedFields: [],
      });
    }
  };

  // Writes the gap to this reviewer's own stint in updated_sources: once when it is
  // found (values still blank), again with what they saved, so an abandoned edit still
  // leaves a record of which document was incomplete and what was missing on it.
  const logMissingPopDocument = (
    popId: string,
    fields: PopRequiredField[],
    updatedFields?: Partial<Record<PopRequiredField, string>>,
  ) => {
    if (!popId || fields.length === 0) return;
    recordMissingPopDocument({ answerId, popId, missingFields: fields, updatedFields });
  };

  const fetchReference = () => {
    mutate(source, {
      onSuccess: (result) => {
        if (!result) return;
        identifiedMissingFieldsRef.current = result.missingFields ?? [];

        // A match missing year_of_release/live_source_link/shareable_name is held back
        // until the reviewer fills those in - the modal's onSaved is what actually
        // resolves this lookup, not this success callback.
        if (result.found && result._id && result.missingFields?.length) {
          logMissingPopDocument(result._id, result.missingFields);
          setMissingModal({ id: result._id, fields: result.missingFields });
          return;
        }

        emitFound(result);
      },
    });
  };

  const handleClick = () => {
    if (!source.trim()) {
      toast.error("Enter a Source first.");
      return;
    }
    if (runWithSession) {
      runWithSession(fetchReference);
      return;
    }
    fetchReference();
  };

  return (
    <div className={cn("flex", className)}>
      <Button
        type="button"
        size="sm"
        className="h-9 w-full cursor-pointer whitespace-nowrap sm:w-auto"
        onClick={handleClick}
        disabled={isPending}
      >
        <FileSearch className="h-3.5 w-3.5" />
        {isPending ? "Checking..." : "Fetch source reference"}
      </Button>

      <PopMissingFieldsModal
        open={missingModal !== null}
        popId={missingModal?.id ?? null}
        missingFields={missingModal?.fields ?? []}
        onSaved={(result, values) => {
          logMissingPopDocument(
            missingModal?.id ?? "",
            identifiedMissingFieldsRef.current,
            values,
          );
          setMissingModal(null);
          emitFound(result);
        }}
        onCancel={() => setMissingModal(null)}
      />
    </div>
  );
};

// A source entry as edited in this session. `source` is the raw text/link typed in to
// search pop_unique_documents - only used for the Fetch button, never saved as-is.
// `organizationId`/`sourceReferenceId` are what actually get saved (as `organization`/
// `source` on the updated_sources item); everything else here (sourceType, sourceName,
// yearOfRelease, sourceLink, organizationName) is display-only, filled in by the
// Organization combobox and the Fetch Source Reference lookup. `pages` is manually typed
// by the reviewer, since neither referenced document carries page numbers.
type SourceDraft = {
  source: string;
  sourceType?: SourceType;
  sourceName?: string;
  yearOfRelease?: string | number;
  sourceLink?: string;
  archivedLink?: string;
  organizationName?: string;
  organizationId?: string;
  sourceReferenceId?: string;
  sourceReferenceStatus: PopMatchStatus | null;
  pages: string;
  // Which of year_of_release/live_source_link/shareable_name were identified as missing
  // on the matched document when this source was fetched - persisted as-is on save.
  missedFields: PopRequiredField[];
};

const toSourceDraft = (source: SourceItem): SourceDraft => ({
  source: source.source ?? "",
  sourceType: source.sourceType,
  sourceName: source.sourceName ?? "",
  yearOfRelease: source.yearOfRelease ?? "",
  sourceLink: "",
  archivedLink: "",
  organizationName: source.organization ?? "",
  organizationId: undefined,
  sourceReferenceId: source.sourceReference ?? undefined,
  sourceReferenceStatus: null,
  pages: "",
  missedFields: [],
});

type SourceFieldKey =
  | "source"
  | "sourceReference"
  | "organization"
  | "sourceType"
  | "pages";

const SOURCE_FIELD_KEYS: SourceFieldKey[] = [
  "source",
  "sourceReference",
  "organization",
  "sourceType",
  "pages",
];

// Page input accepts single pages and ranges, e.g. "4" or "4, 7, 10-12".
const PAGE_INPUT_PATTERN = /^\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*$/;

// Each field is checked on its own so the reviewer sees what is missing under that
// input, rather than one combined message when Save does nothing.
const validateSourceDraft = (
  draft: SourceDraft,
): Partial<Record<SourceFieldKey, string>> => {
  const errors: Partial<Record<SourceFieldKey, string>> = {};

  const source = draft.source.trim();
  if (!source) {
    errors.source = "Enter the source link or document name.";
  } else if (source.length < 3) {
    errors.source = "Enter at least 3 characters.";
  }

  if (draft.sourceReferenceStatus === "notFound") {
    errors.sourceReference =
      "This source isn't in the repository - check the link or document name and fetch again.";
  } else if (!draft.sourceReferenceId) {
    errors.sourceReference = "Fetch the source reference to confirm this document.";
  }

  if (!draft.organizationId) {
    errors.organization = "Select the organization that published this document.";
  } else if (!draft.sourceType) {
    // Source type is copied from the chosen organization, so a blank one means that
    // organization record has no type and the source can't be saved against it.
    errors.sourceType =
      "This organization has no source type set. Pick another organization, or ask an admin to set its type.";
  }

  const pages = draft.pages.trim();
  if (!pages) {
    errors.pages = "Enter at least one page number.";
  } else if (!PAGE_INPUT_PATTERN.test(pages)) {
    errors.pages = "Use page numbers or ranges, for example 4 or 4, 7, 10-12.";
  } else if (parsePageNumbers(pages).some((page) => page < 1)) {
    errors.pages = "Page numbers start at 1.";
  }

  return errors;
};

const EMPTY_SOURCE_DRAFT: SourceDraft = {
  source: "",
  sourceType: undefined,
  sourceName: "",
  yearOfRelease: "",
  sourceLink: "",
  archivedLink: "",
  organizationName: "",
  organizationId: undefined,
  sourceReferenceId: undefined,
  sourceReferenceStatus: null,
  pages: "",
  missedFields: [],
};

// The working area of the page: pick a source (or add one) and edit it in place.
// Every action on this page changes what the list badges and the review panel show, so
// both queries are invalidated together rather than leaving stale state behind.
const useAnswerSourcesRefresh = () => {
  const queryClient = useQueryClient();

  return useCallback(
    (answerId?: string) => {
      queryClient.invalidateQueries({ queryKey: ["closed-answers"] });
      queryClient.invalidateQueries({
        queryKey: answerId ? ["new-source-by-answer", answerId] : ["new-source-by-answer"],
      });
    },
    [queryClient],
  );
};

// A saved review leaves the expert's list straight away: invalidation alone waits on a
// round trip, so the answer is dropped from the cached pages first and the refetch that
// follows just confirms it.
const useRemoveAnswerFromList = () => {
  const queryClient = useQueryClient();

  return useCallback(
    (answerId: string) => {
      queryClient.setQueriesData<InfiniteData<ClosedAnswersResponse | null>>(
        { queryKey: ["closed-answers"] },
        (data) => {
          if (!data) return data;

          let removed = 0;
          const pages = data.pages.map((page) => {
            if (!page) return page;
            const answers = page.answers.filter((entry) => entry._id !== answerId);
            removed += page.answers.length - answers.length;
            return { ...page, answers };
          });

          if (removed === 0) return data;

          return {
            ...data,
            pages: pages.map((page, index) =>
              page && index === 0
                ? { ...page, totalAnswers: Math.max(0, page.totalAnswers - removed) }
                : page,
            ),
          };
        },
      );
    },
    [queryClient],
  );
};

// A save is the end of a real piece of work, so the confirmation says so - varied a
// little to stay warm over a long session, without getting silly about it.
const SAVE_CELEBRATIONS = [
  "Sources locked in",
  "That's another one done",
  "Sources recorded",
  "Good work - saved",
  "One more off the pile",
];

const AnswerSourcesEditor = ({
  answer,
  startCollapsed = false,
  isReviewer = false,
}: {
  answer: ClosedAnswer;
  /** Moderators/admins land on the review, so the edit panel starts folded for them. */
  startCollapsed?: boolean;
  /** Moderators/admins keep reviewed answers in their list, experts don't. */
  isReviewer?: boolean;
}) => {
  const sources = answer.sources ?? [];
  const fieldId = useId();
  const [isOpen, setIsOpen] = useState(!startCollapsed);
  // Whoever put this answer's sources 'in-progress' owns finishing the review - any
  // other expert gets a read-only view until it's released back to 'pending'/review-completed.
  const isLockedByOther =
    answer.newSourceStatus === "in-progress" && !answer.isOwnInProgress;
  // A 'merged' record is done for good - an admin/moderator override, not something an
  // expert re-opens by editing sources again.
  const isMerged = answer.newSourceStatus === "merged";
  // Admins/moderators only get to edit sources directly while the record is under
  // moderator attention - already reviewed or currently held in moderation. Anything
  // else (pending, in-progress, flagged) is theirs to look at, not to edit.
  const isReviewerRestricted =
    isReviewer &&
    answer.newSourceStatus !== "review-completed" &&
    answer.newSourceStatus !== "moderator-in-review";
  // Every existing source's in-progress edits, so picking a different source to edit
  // (e.g. to set its own organization) never drops another source's changes.
  const [drafts, setDrafts] = useState<SourceDraft[]>(() => sources.map(toSourceDraft));
  const [editingIndex, setEditingIndex] = useState<number | null>(
    sources.length > 0 ? 0 : null,
  );
  // Indices of existing sources the expert has stepped through with "Next". Save only
  // becomes available once every existing source has been confirmed this way.
  const [confirmedIndices, setConfirmedIndices] = useState<Set<number>>(new Set());
  // Which fields of the source being edited have been interacted with, so errors only
  // appear once they are useful. Cleared whenever another source is opened.
  const [touchedFields, setTouchedFields] = useState<SourceFieldKey[]>([]);
  const [newSourceId, setNewSourceId] = useState<string | null>(null);
  // The other answer's in-progress updated_sources record this expert still owns, surfaced
  // so they can confirm switching to this answer before it's released back to pending.
  const [pendingSwitch, setPendingSwitch] = useState<NewSourceRecord | null>(null);
  const editStartedAtRef = useRef<number | null>(null);
  const sessionStartedRef = useRef(false);
  // A backend action parked until the review session is open - see runWithSession.
  const deferredActionRef = useRef<(() => void) | null>(null);
  const newSourceIdRef = useRef<string | null>(null);

  const { mutate: startNewSource, isPending: isStarting } = useStartNewSource();
  const { mutate: completeNewSource, isPending: isSaving } = useCompleteNewSource();
  const { mutate: closeNewSource } = useCloseNewSource();
  const { mutate: findActiveElsewhere } = useActiveNewSource();
  const { mutate: releaseNewSource, isPending: isReleasing } = useReleaseNewSource();
  const refreshAnswerSources = useAnswerSourcesRefresh();
  const removeAnswerFromList = useRemoveAnswerFromList();

  const isEditing = editingIndex !== null;
  const form = isEditing ? drafts[editingIndex] ?? EMPTY_SOURCE_DRAFT : EMPTY_SOURCE_DRAFT;
  const fieldErrors = validateSourceDraft(form);
  const isValid = isEditing && Object.keys(fieldErrors).length === 0;
  // A field shows its error once the reviewer has left it, acted on it, or pressed
  // Save - so nothing is flagged red before they have had a chance to fill it in.
  // A fetched match is what fills the read-only panel below the Source field.
  const isMatched = Boolean(form.sourceReferenceId);
  const errorFor = (field: SourceFieldKey) =>
    touchedFields.includes(field) ? fieldErrors[field] : undefined;
  const markTouched = (field: SourceFieldKey) =>
    setTouchedFields((prev) => (prev.includes(field) ? prev : [...prev, field]));
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

  // Creates the updated_sources record as 'in-progress' on the first edit, giving
  // timeTaken a real start point without logging a record for idle browsing.
  const beginSession = () => {
    editStartedAtRef.current = Date.now();
    startNewSource(
      { answerId: answer._id, questionId: answer.questionId ?? "" },
      {
        onSuccess: (result) => {
          if (result?._id) {
            newSourceIdRef.current = result._id;
            setNewSourceId(result._id);
          }
          refreshAnswerSources(answer._id);
          runDeferredAction();
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
          deferredActionRef.current = null;
        },
      },
    );
  };

  // Before starting a session, checks whether this expert still owns an 'in-progress'
  // source on a different answer - if so, they must confirm switching (which releases
  // that other source back to 'pending') before this one can start.
  const ensureSession = () => {
    if (sessionStartedRef.current || isLockedByOther || isMerged || isReviewerRestricted) return;
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

  // Defers an action that hits the backend (the source reference lookup) until this
  // expert owns the review. If they still hold one elsewhere, the switch confirmation
  // opens and the action waits for it, so nothing is fetched on a switch they cancel.
  const runWithSession = (action: () => void) => {
    if (isLockedByOther || isMerged || isReviewerRestricted) return;
    if (sessionStartedRef.current && !pendingSwitch) {
      action();
      return;
    }
    deferredActionRef.current = action;
    ensureSession();
  };

  // Runs whatever was waiting on the session, once.
  const runDeferredAction = () => {
    const action = deferredActionRef.current;
    deferredActionRef.current = null;
    action?.();
  };

  const cancelSwitch = () => {
    setPendingSwitch(null);
    // A cancelled switch drops the queued lookup - nothing was fetched for it.
    deferredActionRef.current = null;
    // Let the next edit re-run the ownership check rather than getting stuck unstarted.
    sessionStartedRef.current = false;
  };

  const confirmSwitch = () => {
    if (!pendingSwitch) return;
    releaseNewSource(pendingSwitch._id, {
      onSuccess: () => {
        setPendingSwitch(null);
        refreshAnswerSources();
        beginSession();
      },
      onError: () => {
        toast.error("Couldn't release the other source. Try again.");
      },
    });
  };

  // Merges into the source currently being edited, leaving every other draft untouched.
  const updateActive = (patch: Partial<SourceDraft>) => {
    if (editingIndex === null) return;
    ensureSession();
    setDrafts((prev) =>
      prev.map((draft, i) => (i === editingIndex ? { ...draft, ...patch } : draft)),
    );
  };

  const updateField = (field: keyof SourceDraft, value: string) => {
    updateActive({ [field]: value } as Partial<SourceDraft>);
  };

  const selectSource = (index: number) => {
    ensureSession();
    setEditingIndex(index);
    setTouchedFields([]);
  };

  const resetForm = () => {
    if (editingIndex === null) return;
    setTouchedFields([]);
    setDrafts((prev) =>
      prev.map((draft, i) =>
        i === editingIndex ? toSourceDraft(sources[editingIndex]) : draft,
      ),
    );
  };

  // Confirms the source currently being edited and advances to the next one that
  // hasn't been confirmed yet, wrapping around. Once every source is confirmed this
  // way, the button below switches from "Next" to "Save".
  const handleNext = () => {
    if (!isValid) {
      setTouchedFields(SOURCE_FIELD_KEYS);
      toast.error("Fix the highlighted fields to continue.");
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
      setTouchedFields(SOURCE_FIELD_KEYS);
      toast.error("Fix the highlighted fields to continue.");
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
    // each carrying only the organization/pop_unique_documents _ids it resolved to, its
    // manually-entered pages, and sourceReferenceStatus, plus sourceIndex: its position
    // in the answer's own sources array. Edits are logged to the updated_sources
    // collection - the answer's own sources are never modified here.
    const finalSources: NewSourceItem[] = drafts.map((draft, index) => ({
      organization: draft.organizationId,
      source: draft.sourceReferenceId,
      page: parsePageNumbers(draft.pages),
      sourceReferenceStatus: draft.sourceReferenceStatus,
      sourceIndex: index,
      missedFields: draft.missedFields,
    }));

    completeNewSource(
      {
        id: newSourceId,
        sources: finalSources,
        timeTaken,
      },
      {
        onSuccess: () => {
          const savedSourceCount = finalSources.length;
          toast.success(
            isReviewer
              ? "Source details saved."
              : SAVE_CELEBRATIONS[
                  Math.floor(Math.random() * SAVE_CELEBRATIONS.length)
                ],
            {
              description: isReviewer
                ? "Your changes to this answer's sources are saved."
                : `${savedSourceCount} ${
                    savedSourceCount === 1 ? "source" : "sources"
                  } on this answer are on their way to the moderators.`,
            },
          );
          // Reviewed answers drop out of the expert's list, so take it off screen now
          // rather than after the refetch lands.
          if (!isReviewer) removeAnswerFromList(answer._id);
          closeNewSource(newSourceId, {
            onSuccess: () => refreshAnswerSources(answer._id),
          });
          setNewSourceId(null);
          sessionStartedRef.current = false;
          editStartedAtRef.current = null;
          setConfirmedIndices(new Set());
          refreshAnswerSources(answer._id);
        },
        onError: (err) => {
          toast.error(
            err instanceof Error ? err.message : "Failed to save source details.",
          );
        },
      },
    );
  };

  if (isLockedByOther || isMerged || isReviewerRestricted) {
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
            : isReviewerRestricted
              ? "This answer's sources are read-only here - they can only be edited once it's under moderation."
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
          This answer has no sources to update.
        </p>
      )}

      <div className="grid gap-3 rounded-lg border border-border bg-card p-3.5 shadow-sm">
        <p className={SECTION_LABEL_CLASSES}>
          {isEditing ? `Editing source ${editingIndex + 1}` : "Select a source above"}
        </p>

        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-source`} className="text-xs">
            Source <span className="text-destructive">*</span>
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Input
              id={`${fieldId}-source`}
              value={form.source}
              onChange={(e) => updateField("source", e.target.value)}
              onBlur={() => markTouched("source")}
              placeholder="https://... or the document name"
              aria-invalid={Boolean(errorFor("source"))}
              aria-describedby={
                errorFor("source") ? `${fieldId}-source-error` : undefined
              }
              className={cn(
                "bg-background sm:flex-1",
                errorFor("source") &&
                  "border-destructive focus-visible:ring-destructive/30",
              )}
            />
            <SourceReferenceLookup
              key={editingIndex ?? "new"}
              source={form.source}
              runWithSession={runWithSession}
              answerId={answer._id}
              className="sm:shrink-0"
              onFound={(result) => {
                markTouched("sourceReference");
                updateActive({
                  sourceReferenceId: result.sourceReferenceId,
                  sourceReferenceStatus: result.matchStatus,
                  sourceName: result.sourceName,
                  yearOfRelease: result.yearOfRelease,
                  sourceLink: result.sourceLink,
                  archivedLink: result.archivedLink,
                  missedFields: result.missedFields,
                });
              }}
            />
          </div>
          {(errorFor("source") || errorFor("sourceReference")) && (
            <p id={`${fieldId}-source-error`} className="text-xs text-destructive">
              {errorFor("source") ?? errorFor("sourceReference")}
            </p>
          )}
        </div>

        {/* Filled in by the lookup above - shown so the reviewer can check the match
            before saving, never typed into directly. */}
        <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={SECTION_LABEL_CLASSES}>From the matched document</p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
                isMatched
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {isMatched ? "Matched" : "Not fetched"}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField
              label="Source name"
              value={form.sourceName}
              placeholder="Not fetched yet"
            />
            <ReadOnlyField
              label="Year of release"
              value={form.yearOfRelease ? String(form.yearOfRelease) : ""}
              placeholder="Not fetched yet"
            />
          </div>

          {(form.sourceLink || form.archivedLink) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {form.sourceLink && (
                <a
                  href={form.sourceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Original link
                </a>
              )}
              {form.archivedLink && (
                <a
                  href={form.archivedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Annam.AI archived copy
                </a>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-org`} className="text-xs">
              Organization <span className="text-destructive">*</span>
            </Label>
            <OrganizationCombobox
              id={`${fieldId}-org`}
              value={form.organizationName ?? ""}
              runWithSession={runWithSession}
              onChange={(org) => {
                markTouched("organization");
                markTouched("sourceType");
                updateActive({
                  organizationId: org._id,
                  organizationName: org.org_name,
                  sourceType: org.type,
                });
              }}
            />
            {errorFor("organization") && (
              <p className="text-xs text-destructive">{errorFor("organization")}</p>
            )}
          </div>

          <ReadOnlyField
            label="Source type"
            value={
              form.sourceType
                ? SOURCE_TYPE_LABELS[form.sourceType] ?? form.sourceType
                : ""
            }
            placeholder="Set by the organization"
            required
            error={errorFor("sourceType")}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-pages`} className="text-xs">
            Page(s) <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${fieldId}-pages`}
            value={form.pages}
            onChange={(e) => updateField("pages", e.target.value)}
            onBlur={() => markTouched("pages")}
            placeholder="e.g. 4 or 4, 7, 10-12"
            aria-invalid={Boolean(errorFor("pages"))}
            aria-describedby={`${fieldId}-pages-hint`}
            className={cn(
              "bg-background",
              errorFor("pages") &&
                "border-destructive focus-visible:ring-destructive/30",
            )}
          />
          <p
            id={`${fieldId}-pages-hint`}
            className={cn(
              "text-xs",
              errorFor("pages") ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {errorFor("pages") ??
              "Page numbers aren't part of either document, so they're entered manually."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">
            Fields marked <span className="text-destructive">*</span> are required.
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
              disabled={isSaving || isStarting}
              onClick={showNext ? handleNext : handleSave}
            >
              {isSaving ? "Saving..." : showNext ? "Next" : "Save changes"}
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

// A value that comes from the matched document or the selected organization - shown for
// checking, never edited here.
const ReadOnlyField = ({
  label,
  value,
  placeholder,
  error,
  required = false,
}: {
  label: string;
  value?: string;
  placeholder: string;
  required?: boolean;
  /** Set when the value this field mirrors can't be resolved, e.g. an organization
   *  with no source type. */
  error?: string;
}) => (
  <div className="grid gap-1.5">
    <Label className="text-xs text-muted-foreground">
      {label} {required && <span className="text-destructive">*</span>}
    </Label>
    <p
      title={value || undefined}
      className={cn(
        "flex h-9 items-center truncate rounded-md border bg-muted/40 px-3 text-sm",
        error ? "border-destructive" : "border-border",
        value ? "text-foreground/90" : "text-muted-foreground",
      )}
    >
      {value || placeholder}
    </p>
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
);

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
  "review-completed": "Review Completed",
  "moderator-in-review": "In Moderation",
  flagged: "Flagged",
  merged: "Approved",
};

const NEW_SOURCE_STATUS_BADGE_CLASSES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  "in-progress": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "review-completed": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "moderator-in-review": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
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
// current sources, green for what the reviewer recorded. Before comes from the answer's
// own SourceItem (a raw `source` link/text, a plain-string `organization` name); After
// comes from the updated_sources NewSourceItem, already populated (by
// NewSourceService.getByAnswerId) with organizationName/sourceName/originalLink/
// archivedLink/yearOfRelease looked up from the organization/pop_unique_documents _ids
// it actually stores (its own `source` is that document's _id, never shown directly) -
// sourceReferenceStatus and the populated fields simply don't render for Before entries.
type ReviewSource = {
  source?: string;
  /** After only - the matched document's live_source_link. */
  originalLink?: string | null;
  /** After only - the matched document's own shareable_link (the Annam.AI archive). */
  archivedLink?: string | null;
  sourceType?: string;
  sourceName?: string;
  page?: string | number | number[];
  yearOfRelease?: string | number | null;
  organization?: string;
  organizationName?: string;
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

      {side === "before" ? (
        // Before carries the raw source text/link as entered on the answer.
        source.source && (
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
              source.source
            )}
          </SourceDetailLine>
        )
      ) : (
        // After's own `source` is a pop_unique_documents _id, never shown directly -
        // the matched document's two links stand in instead.
        <>
          {source.originalLink && (
            <SourceDetailLine label="Original link">
              <a
                href={source.originalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {source.originalLink}
              </a>
            </SourceDetailLine>
          )}
          {source.archivedLink && (
            <SourceDetailLine label="Annam.AI Archived Link">
              <a
                href={source.archivedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {source.archivedLink}
              </a>
            </SourceDetailLine>
          )}
        </>
      )}

      {source.page !== undefined && source.page !== "" && (
        <SourceDetailLine label="Page">
          {Array.isArray(source.page) ? source.page.join(", ") : source.page}
        </SourceDetailLine>
      )}
      {source.yearOfRelease !== undefined && source.yearOfRelease !== "" && source.yearOfRelease !== null && (
        <SourceDetailLine label="Year of release">{source.yearOfRelease}</SourceDetailLine>
      )}
      {(source.organizationName || source.organization) && (
        // After's `organization` is the Organization document's _id, not a name - only
        // show it when there's no populated name to fall back to (Before still carries
        // organization as a plain name string).
        <SourceDetailLine label="Org">{source.organizationName || source.organization}</SourceDetailLine>
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

const MODERATOR_ACTION_LABELS: Record<ModeratorActionType, string> = {
  pending: "Moved to pending",
  approve: "Approved",
  flag: "Flagged",
  unflag: "Unflagged",
  release: "Released",
};

const MODERATOR_ACTION_BADGE_CLASSES: Record<ModeratorActionType, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approve: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  flag: "bg-destructive/10 text-destructive",
  unflag: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  release: "bg-muted text-muted-foreground",
};

// Moderator/admin-only: every action a moderator has taken on the record - flag, unflag,
// move to pending, approve, release - newest first, with who did it and their reason.
const ModeratorActionsList = ({
  moderatorActions,
}: {
  moderatorActions: ModeratorAction[];
}) => {
  const entries = [...moderatorActions].reverse();

  return (
    <CollapsibleBlock icon={History} title="Moderator actions" count={entries.length}>
      <ol className="ml-1 flex flex-col gap-3 border-l border-border/60 pl-4">
        {entries.map((entry, index) => (
          <li key={`${entry.changedAt}-${index}`} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-border ring-4 ring-muted/30" />
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
                  MODERATOR_ACTION_BADGE_CLASSES[entry.action] ??
                    "bg-muted text-muted-foreground",
                )}
              >
                {MODERATOR_ACTION_LABELS[entry.action] ?? entry.status}
              </span>
              <span className="text-xs text-foreground/90">
                {entry.changedByName || "Unknown user"}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatClosedAt(entry.changedAt)}
              </span>
            </div>
            {entry.reason && (
              <p className="mt-1 break-words border-l-2 border-border/60 pl-2 text-xs text-muted-foreground">
                {entry.reason}
              </p>
            )}
          </li>
        ))}
      </ol>
    </CollapsibleBlock>
  );
};

// The three states an admin/moderator can force a record into (see
// NewSourceService.changeStatus) - 'in-progress' and 'review-completed' are reached by the
// reviewer's own flow, not by an override. Each needs a reason, asked for in a modal.
const STATUS_OVERRIDE_ACTIONS: {
  value: "pending" | "merged" | "flagged";
  label: string;
  icon: typeof Flag;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
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
    successMessage: "Review moved back to pending.",
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
    successMessage: "Review flagged.",
    variant: "destructive",
  },
  {
    value: "merged",
    label: "Approve",
    icon: CheckCheck,
    title: "Approve this review",
    description:
      "Accepts the reviewer's sources as the correct set for this answer and closes the review.",
    confirmLabel: "Approve review",
    successMessage: "Review approved.",
    variant: "default",
  },
];

// Where a flagged record goes once the flag is lifted - the two paths send it to very
// different places, so each spells out the consequence in the dialog.
const UNFLAG_TARGETS: {
  value: "pending" | "review-completed";
  label: string;
  detail: string;
}[] = [
  {
    value: "pending",
    label: "Send back to the experts",
    detail:
      "Status becomes Pending. The answer returns to the expert list so an expert can redo the sources, and leaves the moderator list until they finish.",
  },
  {
    value: "review-completed",
    label: "Keep it with the moderators",
    detail:
      "Status becomes Review Completed. The answer stays on the moderator list as a finished expert review, ready for someone to take into moderation again.",
  },
];

const UnflagControl = ({
  answer,
  newSourceRecord,
  onCompleted,
}: {
  answer: ClosedAnswer;
  newSourceRecord: NewSourceRecord;
  onCompleted?: () => void;
}) => {
  const refreshAnswerSources = useAnswerSourcesRefresh();
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<"pending" | "review-completed">(
    "review-completed",
  );
  const [reason, setReason] = useState("");
  const { mutate: changeStatus, isPending } = useChangeNewSourceStatus();

  if (newSourceRecord.status !== "flagged") return null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setReason("");
      setTarget("review-completed");
    }
    setIsOpen(nextOpen);
  };

  const handleConfirm = () => {
    if (!reason.trim()) {
      toast.error("A reason is required to unflag this review.");
      return;
    }

    changeStatus(
      { id: newSourceRecord._id, status: target, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(
            target === "pending"
              ? "Unflagged and sent back to the experts."
              : "Unflagged and kept with the moderators.",
          );
          setIsOpen(false);
          refreshAnswerSources(answer._id);
          onCompleted?.();
        },
        onError: (error: Error) =>
          toast.error(error.message || "Failed to unflag this review."),
      },
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 cursor-pointer gap-1.5 px-2 text-xs"
        onClick={() => handleOpenChange(true)}
      >
        <FlagOff className="h-3.5 w-3.5" />
        Unflag
      </Button>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlagOff className="h-4 w-4" />
              Unflag this review
            </DialogTitle>
            <DialogDescription>
              Choose where the answer goes once the flag is lifted.
            </DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={target}
            onValueChange={(value) =>
              setTarget(value as "pending" | "review-completed")
            }
            className="grid gap-2"
          >
            {UNFLAG_TARGETS.map((option) => (
              <label
                key={option.value}
                htmlFor={`unflag-${option.value}`}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                  target === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/50",
                )}
              >
                <RadioGroupItem
                  id={`unflag-${option.value}`}
                  value={option.value}
                  className="mt-0.5 cursor-pointer"
                />
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {option.detail}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>

          <div className="grid gap-1.5">
            <Label htmlFor="unflag-reason" className="text-xs">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Input
              id="unflag-reason"
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is the flag being lifted?"
              className="bg-background"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="cursor-pointer"
              disabled={!reason.trim() || isPending}
              onClick={handleConfirm}
            >
              {isPending
                ? "Unflagging…"
                : target === "pending"
                  ? "Unflag and send back"
                  : "Unflag and keep"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const ReleaseHoldControl = ({
  answer,
  newSourceRecord,
  onReleased,
}: {
  answer: ClosedAnswer;
  newSourceRecord: NewSourceRecord;
  onReleased?: () => void;
}) => {
  const refreshAnswerSources = useAnswerSourcesRefresh();
  const { mutate: releaseModeratorReview, isPending } = useReleaseModeratorReview();

  if (newSourceRecord.status !== "moderator-in-review") return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-7 cursor-pointer gap-1.5 px-2 text-xs"
      disabled={isPending}
      title="Hand this answer back so another moderator can review it"
      onClick={() =>
        releaseModeratorReview(newSourceRecord._id, {
          onSuccess: () => {
            toast.success("Answer released for other moderators.");
            refreshAnswerSources(answer._id);
            onReleased?.();
          },
          onError: () => toast.error("Couldn't release this answer. Try again."),
        })
      }
    >
      <Undo2 className="h-3.5 w-3.5" />
      {isPending ? "Releasing…" : "Release"}
    </Button>
  );
};

const StatusOverrideControl = ({
  answer,
  newSourceRecord,
  actions = ["pending", "merged", "flagged"],
  inline = false,
  advanceToNext,
  onAdvanceToNextChange,
  onCompleted,
}: {
  answer: ClosedAnswer;
  newSourceRecord: NewSourceRecord;
  /** Which overrides to offer here - Flag lives in the section header on its own. */
  actions?: ("pending" | "merged" | "flagged")[];
  /** Renders just the buttons, without the bordered "Change status" row. */
  inline?: boolean;
  /** Whether finishing here should open the next answer - the toggle only renders on
   *  the full row, but the header's Flag honours the same choice. */
  advanceToNext?: boolean;
  onAdvanceToNextChange?: (next: boolean) => void;
  onCompleted?: () => void;
}) => {
  const refreshAnswerSources = useAnswerSourcesRefresh();
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
          toast.success(activeAction.successMessage);
          setReason("");
          setActiveAction(null);
          refreshAnswerSources(answer._id);
          onCompleted?.();
        },
        onError: (error: Error) => {
          toast.error(error.message || "Failed to change status.");
        },
      },
    );
  };

  const visibleActions = STATUS_OVERRIDE_ACTIONS.filter((action) =>
    actions.includes(action.value),
  );

  return (
    <div
      className={cn(
        inline
          ? "flex items-center gap-2"
          : "flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3",
      )}
    >
      {!inline && <p className={SECTION_LABEL_CLASSES}>Change status</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!inline && onAdvanceToNextChange && (
          <label className="mr-1 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={advanceToNext}
              onCheckedChange={(checked) =>
                onAdvanceToNextChange(checked === true)
              }
              className="cursor-pointer"
            />
            Open next answer
          </label>
        )}
        {visibleActions.map((action) => {
          const Icon = action.icon;
          const isCurrent = newSourceRecord.status === action.value;

          return (
            <Button
              key={action.value}
              type="button"
              size="sm"
              // Inline sits beside the status badge in the section header, so it stays
              // light - a full solid button would outweigh everything around it.
              variant={inline ? "ghost" : action.variant}
              className={cn(
                "cursor-pointer gap-1.5",
                inline &&
                  "h-7 px-2 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400",
              )}
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
  // This stint did something - an expert saved their edit, or a moderator acted.
  actioned: {
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
  // Opened, spent some time, closed without doing anything.
  idle: {
    container: "border-border bg-muted/60 dark:bg-muted/30",
    iconBg: "bg-muted-foreground/15",
    icon: "text-muted-foreground",
    badge: "border border-border bg-background text-muted-foreground",
  },
} as const;

const CollapsibleBlock = ({
  icon: Icon,
  title,
  count,
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex cursor-pointer items-center gap-2 text-left"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-sm font-semibold text-foreground">
          {title} ({count})
        </p>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isOpen ? "rotate-180" : "rotate-0",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key={`${title}-body`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// An entry is finished once it has a closing time. timeTaken is only written on an
// expert's save, so a moderator's stint is measured from its own start and close.
const getReviewEntryDuration = (entry: NewSourceReviewEntry) => {
  if (entry.timeTaken !== null && entry.timeTaken !== undefined) {
    return entry.timeTaken;
  }
  if (!entry.closedAt) return null;

  const startedAt = new Date(entry.startedAt).getTime();
  const closedAt = new Date(entry.closedAt).getTime();
  if (Number.isNaN(startedAt) || Number.isNaN(closedAt)) return null;

  return Math.max(0, Math.round((closedAt - startedAt) / 1000));
};

// A record can collect a lot of stints - the same person releasing and picking an answer
// back up - so they read as compact rows with a summary, rather than a wall of avatars.
const ReviewersList = ({
  reviewArray,
}: {
  reviewArray: NewSourceRecord["reviewArray"];
}) => {
  const entries = [...reviewArray].reverse();
  const uniqueReviewers = new Set(reviewArray.map((entry) => entry.userId)).size;
  const totalSeconds = reviewArray.reduce(
    (total, entry) => total + (getReviewEntryDuration(entry) ?? 0),
    0,
  );

  return (
    <CollapsibleBlock icon={Users} title="Reviewers" count={reviewArray.length}>
      {entries.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {uniqueReviewers} {uniqueReviewers === 1 ? "person" : "people"} ·{" "}
            {entries.length} {entries.length === 1 ? "stint" : "stints"} ·{" "}
            {formatTimeTaken(totalSeconds)} total
          </p>

          <ul className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card">
            {entries.map((entry, index) => {
              const isOpen = !entry.closedAt;
              const styles = isOpen
                ? REVIEWER_CARD_STYLES.open
                : entry.isActionTaken
                  ? REVIEWER_CARD_STYLES.actioned
                  : REVIEWER_CARD_STYLES.idle;

              return (
                <li
                  key={`${entry.userId}-${index}`}
                  className="flex items-center gap-3 border-b border-border/50 px-3 py-2 last:border-b-0"
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      styles.iconBg,
                      styles.icon,
                    )}
                  >
                    {isOpen ? (
                      <Clock className="h-3.5 w-3.5" />
                    ) : entry.isActionTaken ? (
                      <UserCheck className="h-3.5 w-3.5" />
                    ) : (
                      <UserMinus className="h-3.5 w-3.5" />
                    )}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="truncate text-xs font-medium text-foreground">
                      {entry.name || "Unknown reviewer"}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {entry.role === "moderator" ? "Moderator" : "Expert"} ·{" "}
                      {formatClosedAt(entry.startedAt)}
                    </p>
                    {(entry.missingPopDocuments ?? []).length > 0 && (
                      <p className="truncate text-[11px] text-amber-600 dark:text-amber-400">
                        {(entry.missingPopDocuments ?? []).length} incomplete{" "}
                        {(entry.missingPopDocuments ?? []).length === 1
                          ? "document"
                          : "documents"}{" "}
                        handled
                      </p>
                    )}
                  </div>

                  <span
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      styles.badge,
                    )}
                  >
                    {isOpen
                      ? "In progress"
                      : entry.isActionTaken
                        ? `${entry.role === "moderator" ? "Acted" : "Saved"} · ${formatTimeTaken(
                            getReviewEntryDuration(entry),
                          )}`
                        : formatTimeTaken(getReviewEntryDuration(entry))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          No one has reviewed these sources yet.
        </p>
      )}
    </CollapsibleBlock>
  );
};


// Required fields missing on a matched pop document are filled in by the expert during
// review and saved to the shared pop repository, not just to this answer - a moderator
// sees here which document was incomplete, what was blank on it and what it now holds.
const PopFieldUpdatesSection = ({
  reviewArray,
}: {
  reviewArray: NewSourceRecord["reviewArray"];
}) => {
  const updates = reviewArray.flatMap((entry) =>
    (entry.missingPopDocuments ?? []).map((document) => ({
      reviewerName: entry.name,
      document,
    })),
  );

  if (updates.length === 0) return null;

  return (
    <CollapsibleBlock
      icon={FileSearch}
      title="Document details filled in"
      count={updates.length}
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Saved to the pop repository, so every answer citing these documents now uses
          them.
        </p>

        {updates.map(({ reviewerName, document }, index) => (
          <div
            key={`${document.popId}-${index}`}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
          >
            <p className="min-w-0 break-all text-xs font-medium text-foreground">
              Document {document.popId}
              {reviewerName ? ` · ${reviewerName}` : ""}
            </p>

            {document.missingFields.map((field) => {
              const value = document.updatedFields?.[field]?.trim();

              return (
                <div
                  key={field}
                  className="grid gap-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_1rem_minmax(0,1fr)] sm:items-center"
                >
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {POP_FIELD_LABELS[field]}
                  </span>
                  <span className="min-w-0 break-all rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1 text-[11px] text-red-700 dark:text-red-300">
                    Missing
                  </span>
                  <ArrowRight className="hidden h-3.5 w-3.5 justify-self-center text-muted-foreground/50 sm:block" />
                  <span
                    className={cn(
                      "min-w-0 break-all rounded-md border px-2 py-1 text-[11px]",
                      value
                        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                        : "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {value || "Not filled in"}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </CollapsibleBlock>
  );
};

// Compares the answer's sources as they stand in the answers collection (Before, red)
// against what the assigned expert recorded in updated_sources (After, green), so a
// moderator/admin can see what changed without opening the edit panel below it, plus
// the reviewer queue and the status-override control.
const SourceChangesSection = ({
  answer,
  onHoldReleased,
  onStatusChanged,
}: {
  answer: ClosedAnswer;
  onHoldReleased?: () => void;
  /** Called after any status override, with whether to open the next answer. */
  onStatusChanged?: (advanceToNext: boolean) => void;
}) => {
  const [advanceToNext, setAdvanceToNext] = useState(true);
  const { data: newSourceRecord, isLoading } = useGetNewSourceByAnswerId(answer._id, {
    enabled: true,
  });
  const beforeSources = answer.sources ?? [];
  const afterSources = newSourceRecord?.sources ?? [];
  const recordStatus = newSourceRecord?.status;
  // The moderator currently holding this record - their stint is the open one.
  const moderatorHold = newSourceRecord?.reviewArray.find(
    (entry) => entry.role === "moderator" && !entry.closedAt,
  );
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
        <div className="flex items-center gap-2">
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
          {recordStatus === "moderator-in-review" && moderatorHold && (
            <span className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <UserCheck className="h-3 w-3" />
              With {moderatorHold.name || "a moderator"} · since{" "}
              {formatClosedAt(moderatorHold.startedAt)}
            </span>
          )}
          {newSourceRecord && (
            <ReleaseHoldControl
              answer={answer}
              newSourceRecord={newSourceRecord}
              onReleased={onHoldReleased}
            />
          )}
          {newSourceRecord && newSourceRecord.status === "flagged" && (
            <UnflagControl
              answer={answer}
              newSourceRecord={newSourceRecord}
              onCompleted={() => onStatusChanged?.(advanceToNext)}
            />
          )}
          {/* Flagging is only offered while the record is under moderator attention -
              already reviewed or currently held in moderation. Pending/in-progress/
              merged records are admin/moderator read-only. */}
          {newSourceRecord &&
            (newSourceRecord.status === "review-completed" ||
              newSourceRecord.status === "moderator-in-review") && (
              <StatusOverrideControl
                answer={answer}
                newSourceRecord={newSourceRecord}
                actions={["flagged"]}
                inline
                onCompleted={() => onStatusChanged?.(advanceToNext)}
              />
            )}
        </div>
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

      {newSourceRecord && (
        <PopFieldUpdatesSection reviewArray={newSourceRecord.reviewArray} />
      )}

      {newSourceRecord && <ReviewersList reviewArray={newSourceRecord.reviewArray} />}

      {newSourceRecord?.moderatorActions &&
        newSourceRecord.moderatorActions.length > 0 && (
          <ModeratorActionsList moderatorActions={newSourceRecord.moderatorActions} />
        )}

      {newSourceRecord && newSourceRecord.status === "merged" ? (
        <p className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-primary">
          This review has been approved and is read-only. Its status can no longer be
          changed.
        </p>
      ) : newSourceRecord &&
        newSourceRecord.status !== "review-completed" &&
        newSourceRecord.status !== "moderator-in-review" &&
        newSourceRecord.status !== "flagged" ? (
        // Pending/in-progress records aren't under moderator attention yet - admins and
        // moderators get a read-only view here until an expert completes the review.
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          This review isn't complete yet, so its status is read-only here.
        </p>
      ) : (
        newSourceRecord &&
        newSourceRecord.status !== "flagged" && (
          <StatusOverrideControl
            answer={answer}
            newSourceRecord={newSourceRecord}
            actions={["pending", "merged"]}
            advanceToNext={advanceToNext}
            onAdvanceToNextChange={setAdvanceToNext}
            onCompleted={() => onStatusChanged?.(advanceToNext)}
          />
        )
      )}
    </div>
  );
};

const AnswerDetail = ({
  answer,
  isModerator,
  isAdmin,
  onHoldReleased,
  onStatusChanged,
}: {
  answer: ClosedAnswer;
  isModerator: boolean;
  isAdmin: boolean;
  /** Clears the selection when a moderator hands the answer back. */
  onHoldReleased?: () => void;
  /** Moves on after a status override, per the "Open next answer" choice. */
  onStatusChanged?: (advanceToNext: boolean) => void;
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

    {(isModerator || isAdmin) && (
      <SourceChangesSection
        answer={answer}
        onHoldReleased={onHoldReleased}
        onStatusChanged={onStatusChanged}
      />
    )}

    {/* Moderators/admins review sources via SourceChangesSection's Before/After view
        above - they don't edit an answer's sources, so this editor is expert-only. */}
    {!(isModerator || isAdmin) && <AnswerSourcesEditor answer={answer} />}

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

// Shown once per browser: taking an answer into moderation makes that reviewer
// responsible for it, so the first claim explains what they are signing up for.
const MODERATION_NOTICE_KEY = "answer-sources:moderation-notice-seen";

const hasSeenModerationNotice = () => {
  try {
    return localStorage.getItem(MODERATION_NOTICE_KEY) === "1";
  } catch {
    // Storage blocked (private window, blocked cookies) - don't nag on every click.
    return true;
  }
};

const markModerationNoticeSeen = () => {
  try {
    localStorage.setItem(MODERATION_NOTICE_KEY, "1");
  } catch {
    // Nothing to do - the notice just shows again next time.
  }
};

const ANSWERS_PAGE_SIZE = 20;

// A fresh seed reshuffles the list; the same seed keeps paging stable while scrolling.
const createShuffleSeed = () => Math.floor(Math.random() * 999982) + 1;

// Offsets the sticky playground header and the tab container padding so the page fits
// the viewport and only the list and detail panes scroll.
const PAGE_HEIGHT_CLASSES = "h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-8.5rem)]";

// Holds the answer a moderator/admin opens, so no other moderator sees it while they
// work on it - the mirror of the expert's in-progress lock.
const useModeratorReviewHold = ({
  enabled,
  selectedAnswer,
  onReleased,
}: {
  enabled: boolean;
  selectedAnswer: ClosedAnswer | null;
  onReleased: () => void;
}) => {
  const [pendingSwitch, setPendingSwitch] = useState<NewSourceRecord | null>(null);
  const heldAnswerIdRef = useRef<string | null>(null);
  const refreshAnswerSources = useAnswerSourcesRefresh();

  const { mutate: startModeratorReview } = useStartModeratorReview();
  const { mutate: findHeldElsewhere } = useActiveModeratorReview();
  const { mutate: releaseModeratorReview, isPending: isReleasing } =
    useReleaseModeratorReview();

  const answerId = selectedAnswer?._id ?? null;
  const questionId = selectedAnswer?.questionId ?? "";
  const isAlreadyHeld = Boolean(selectedAnswer?.isOwnModeratorReview);
  // Auto-claiming into moderation is a status change, so it only makes sense from
  // 'review-completed' (picking it up) or 'moderator-in-review' (this moderator's own
  // hold, or an attempt on someone else's). Pending/in-progress answers haven't reached
  // moderation yet, flagged answers stay flagged until unflagged, and merged is final -
  // opening any of those is a look, not a claim, so their status must stay untouched.
  const canAutoClaim =
    selectedAnswer?.newSourceStatus === "review-completed" ||
    selectedAnswer?.newSourceStatus === "moderator-in-review";

  const takeHold = useCallback(
    (targetId: string, targetQuestionId: string) => {
      startModeratorReview(
        { answerId: targetId, questionId: targetQuestionId },
        {
          onSuccess: () => {
            heldAnswerIdRef.current = targetId;
            refreshAnswerSources(targetId);
          },
          onError: (err) => {
            toast.error(
              err instanceof Error
                ? err.message
                : "Another moderator is already reviewing this answer.",
            );
          },
        },
      );
    },
    [startModeratorReview, refreshAnswerSources],
  );

  // The ref only exists to stop the claim firing twice for one selection. It has to be
  // cleared once the hold is gone - released, approved, flagged - or re-opening that
  // same answer would look like a duplicate claim and quietly do nothing.
  useEffect(() => {
    if (!answerId || (heldAnswerIdRef.current === answerId && !isAlreadyHeld)) {
      heldAnswerIdRef.current = null;
    }
  }, [answerId, isAlreadyHeld]);

  // Selecting an answer claims it, unless this moderator still holds another one - then
  // the confirmation decides, so nothing is claimed behind their back.
  useEffect(() => {
    if (!enabled || !answerId || isAlreadyHeld || !canAutoClaim) return;
    if (heldAnswerIdRef.current === answerId) return;

    findHeldElsewhere(answerId, {
      onSuccess: (record) => {
        if (record) {
          setPendingSwitch(record);
        } else {
          takeHold(answerId, questionId);
        }
      },
      // Fail open - a failed check shouldn't stop the review.
      onError: () => takeHold(answerId, questionId),
    });
  }, [
    enabled,
    answerId,
    questionId,
    isAlreadyHeld,
    canAutoClaim,
    findHeldElsewhere,
    takeHold,
  ]);

  const confirmSwitch = () => {
    if (!pendingSwitch || !answerId) return;
    releaseModeratorReview(pendingSwitch._id, {
      onSuccess: () => {
        setPendingSwitch(null);
        refreshAnswerSources();
        takeHold(answerId, questionId);
      },
      onError: () => toast.error("Couldn't release the other answer. Try again."),
    });
  };

  const cancelSwitch = () => {
    setPendingSwitch(null);
    onReleased();
  };

  return { pendingSwitch, confirmSwitch, cancelSwitch, isReleasing };
};

export const ClosedAnswersPage = () => {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ClosedAnswerFiltersState>(
    EMPTY_CLOSED_ANSWER_FILTERS,
  );
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [isListOpen, setIsListOpen] = useState(false);
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  // Answers this reviewer just handed back - ignored while the refetch catches up, so a
  // released answer doesn't flash back open.
  const [releasedAnswerIds, setReleasedAnswerIds] = useState<string[]>([]);
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
  // A moderator already holding an answer lands back on it; otherwise nothing is picked
  // for them, since opening an answer claims it. Experts have no such side effect, so
  // the first answer is opened for them as before.
  const heldAnswer = isReviewer
    ? answers.find(
        (answer) =>
          answer.isOwnModeratorReview && !releasedAnswerIds.includes(answer._id),
      )
    : undefined;
  const selectedAnswer =
    answers.find((answer) => answer._id === selectedAnswerId) ??
    (isReviewer ? heldAnswer ?? null : answers[0] ?? null);
  const hasActiveFilters = countActiveFilters(filters) > 0;

  const moderatorHold = useModeratorReviewHold({
    enabled: isReviewer,
    selectedAnswer,
    // A moderator who backs out of the switch keeps the answer they already hold.
    onReleased: () => setSelectedAnswerId(null),
  });

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
  // Every way of choosing an answer goes through here, so the first-claim notice can't
  // be side-stepped by the arrow keys or the full-list dialog.
  const selectAnswer = (answerId: string) => {
    setReleasedAnswerIds((prev) => prev.filter((id) => id !== answerId));
    if (isReviewer && !hasSeenModerationNotice()) {
      setPendingClaimId(answerId);
      return;
    }
    setSelectedAnswerId(answerId);
  };

  const confirmClaim = () => {
    if (!pendingClaimId) return;
    markModerationNoticeSeen();
    setSelectedAnswerId(pendingClaimId);
    setPendingClaimId(null);
  };

  // After acting on an answer: step to the next one when the reviewer asked to keep
  // going, otherwise drop back to the pick-an-answer state.
  const handleStatusChanged = (advanceToNext: boolean) => {
    const actedOnId = selectedAnswer?._id;
    if (actedOnId) {
      setReleasedAnswerIds((prev) =>
        prev.includes(actedOnId) ? prev : [...prev, actedOnId],
      );
    }

    if (!advanceToNext) {
      setSelectedAnswerId(null);
      return;
    }

    const currentIndex = answers.findIndex((answer) => answer._id === actedOnId);
    const nextAnswer =
      answers[currentIndex + 1] ?? answers[currentIndex - 1] ?? null;

    if (nextAnswer) {
      selectAnswer(nextAnswer._id);
    } else {
      setSelectedAnswerId(null);
    }
  };

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

    selectAnswer(nextAnswer._id);
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
              <ClosedAnswersGuide isReviewer={isReviewer} />
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
                    onSelect={() => selectAnswer(answer._id)}
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
                        onStatusChanged={handleStatusChanged}
                        onHoldReleased={() => {
                          setReleasedAnswerIds((prev) =>
                            prev.includes(selectedAnswer._id)
                              ? prev
                              : [...prev, selectedAnswer._id],
                          );
                          setSelectedAnswerId(null);
                        }}
                      />
                    </motion.div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <MousePointerClick className="h-6 w-6" />
                      </span>
                      <div className="flex max-w-sm flex-col gap-1.5">
                        <p className="text-sm font-semibold text-foreground">
                          {isReviewer
                            ? "Pick an answer to review"
                            : "Pick an answer to work on"}
                        </p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {isReviewer
                            ? "Choose one from the list to compare the expert's sources against the answer's own. It stays held in moderation while you have it open, so no one else picks it up."
                            : "Choose one from the list to add or update the sources backing that answer."}
                        </p>
                      </div>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Kbd>↑</Kbd>
                        <Kbd>↓</Kbd>
                        to move through the list
                      </span>
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
        onSelect={selectAnswer}
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

      <ConfirmationModal
        open={pendingClaimId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingClaimId(null);
        }}
        title="Take this answer into moderation?"
        description="Opening it marks the answer In Moderation under your name and hides it from other moderators. You're then responsible for approving or flagging it - or you can release it later to hand it back."
        confirmText="Got it, open it"
        cancelText="Not now"
        onConfirm={confirmClaim}
      />

      <ConfirmationModal
        open={moderatorHold.pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) moderatorHold.cancelSwitch();
        }}
        title="Review this answer instead?"
        description="You still hold another answer in moderation. Opening this one sends that answer back so another moderator can pick it up."
        confirmText="Switch anyway"
        cancelText="Stay there"
        isLoading={moderatorHold.isReleasing}
        onConfirm={moderatorHold.confirmSwitch}
      />

    </MotionConfig>
  );
};
