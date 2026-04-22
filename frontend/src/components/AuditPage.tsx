import { useState } from "react";
import {
  Card,
  // CardHeader,
  // CardTitle,
  CardContent,
  // CardDescription,
} from "./atoms/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./atoms/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  // DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./atoms/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";
import {
  useGetAuditTrails,
  // type AuditFilters,
} from "@/hooks/api/auditTrails/useGetAuditTrails";
import { Button } from "./atoms/button";
import {
  ArrowBigDownDashIcon,
  LayoutGrid,
  Table2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  ArrowLeft,
  CheckCheck,
} from "lucide-react";
import { Pagination } from "./pagination";
import AvatarComponent from "./avatar-component";
import { Input } from "./atoms/input";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditActor {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

interface AuditEntry {
  _id: string;
  category: string;
  action: string;
  actor: AuditActor;
  context: Record<string, unknown>;
  changes: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  outcome: { status: string,
    errorCode?: string;
    errorMessage?: string;
    errorName?: string;
    errorStack?: string;
   };
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// function initials(name: string) {
//   return name
//     .trim()
//     .split(/\s+/)
//     .map((w) => w[0])
//     .join("")
//     .slice(0, 2)
//     .toUpperCase();
// }

function fmtDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    ", " +
    d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  );
}

// Checks if a value is an array of objects (not primitives)
function isArrayOfObjects(v: unknown): v is Record<string, unknown>[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    typeof v[0] === "object" &&
    v[0] !== null
  );
}

// Unwraps MongoDB { _id: "..." } single-key wrappers
function unwrapMongoId(v: unknown): string | unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 1 && entries[0][0] === "_id")
      return String(entries[0][1]);
  }
  return v;
}

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant =
  | "action"
  | "category"
  | "role"
  | "success"
  | "danger"
  | "neutral";

const badgeStyles: Record<BadgeVariant, string> = {
  action:
    "bg-blue-50   text-blue-800   border-blue-200   dark:bg-blue-950   dark:text-blue-200   dark:border-blue-800",
  category:
    "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800",
  role: "bg-green-50  text-green-800  border-green-200  dark:bg-green-950  dark:text-green-200  dark:border-green-800",
  success:
    "bg-green-50  text-green-800  border-green-200  dark:bg-green-950  dark:text-green-200  dark:border-green-800",
  danger:
    "bg-red-50    text-red-800    border-red-200    dark:bg-red-950    dark:text-red-200    dark:border-red-800",
  neutral:
    "bg-gray-50   text-gray-700   border-gray-200   dark:bg-gray-900   dark:text-gray-300   dark:border-gray-700",
};

function Badge({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${badgeStyles[variant]}`}
    >
      {children}
    </span>
  );
}

// ─── Dynamic value renderer ───────────────────────────────────────────────────

function renderScalar(val: unknown): string {
  if (val === null || val === undefined) return "—";
  const unwrapped = unwrapMongoId(val);
  if (typeof unwrapped === "string") return unwrapped;
  if (Array.isArray(unwrapped)) return unwrapped.map(renderScalar).join(", ");
  if (typeof unwrapped === "object") return JSON.stringify(unwrapped);
  return String(unwrapped);
}


function flattenObject(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, unknown> {
  return Object.entries(obj).reduce<Record<string, unknown>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    const unwrapped = unwrapMongoId(v);

    if (unwrapped === null || unwrapped === undefined) {
      acc[key] = "—";
    } else if (Array.isArray(unwrapped)) {
      // Keep arrays as-is — DiffViewer will decide how to render them
      acc[key] = unwrapped;
    } else if (typeof unwrapped === "object") {
      Object.assign(
        acc,
        flattenObject(unwrapped as Record<string, unknown>, key),
      );
    } else {
      acc[key] = String(unwrapped);
    }

    return acc;
  }, {});
}

const PRIORITY_KEYS = ["name", "email", "role", "_id", "id"];

function sortKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ai = PRIORITY_KEYS.indexOf(a);
    const bi = PRIORITY_KEYS.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// ─── Array Diff: side-by-side cards ──────────────────────────────────────────

function ArrayOfObjectsDiff({
  beforeArr,
  afterArr,
}: {
  beforeArr: Record<string, unknown>[];
  afterArr: Record<string, unknown>[];
}) {
  const maxLen = Math.max(beforeArr.length, afterArr.length);

  return (
    <div className="space-y-2">
      {Array.from({ length: maxLen }).map((_, i) => {
        const b = beforeArr[i];
        const a = afterArr[i];
        const onlyAfter = !b && !!a;
        const onlyBefore = !!b && !a;

        return (
          <div key={i} className="flex gap-2">
            {/* Before */}
            <div
              className={`flex-1 ${onlyAfter ? "opacity-0 pointer-events-none" : ""}`}
            >
              {b ? (
                <div
                  className={`rounded-lg border p-2.5 space-y-1 ${onlyBefore ? "border-red-300 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20" : "border-border/60 bg-background"}`}
                >
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                    #{i + 1}
                  </span>
                  {sortKeys(Object.keys(b).filter((k) => k !== "_id")).map(
                    (k) => (
                      <div key={k} className="flex items-start gap-2 text-xs">
                        <span className="text-muted-foreground w-14 shrink-0 capitalize">
                          {k}
                        </span>
                        <span className="font-medium break-all">
                          {renderScalar(b[k])}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="flex-1" />
              )}
            </div>

            {/* After */}
            <div
              className={`flex-1 ${onlyBefore ? "opacity-0 pointer-events-none" : ""}`}
            >
              {a ? (
                <div
                  className={`rounded-lg border p-2.5 space-y-1 ${onlyAfter ? "border-green-300 bg-green-50/40 dark:border-green-800 dark:bg-green-950/20" : "border-border/60 bg-background"}`}
                >
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                    #{i + 1}
                  </span>
                  {sortKeys(Object.keys(a)).map((k) => (
                    <div key={k} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground w-14 shrink-0 capitalize">
                        {k}
                      </span>
                      <span className="font-medium break-all">
                        {renderScalar(a[k])}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DiffViewer({
  before,
  after,
}: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {

  const flatBefore = flattenObject(before ?? {});
  const flatAfter = flattenObject(after ?? {});
  const allKeys = Array.from(
    new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)]),
  );
  if (!allKeys.length)
    return (
      <p className="text-xs text-muted-foreground italic">
        No fields recorded.
      </p>
    );

  return (
    <div className="space-y-4 m-1">
      {allKeys.map((key) => {
        const bv = flatBefore[key];
        const av = flatAfter[key];

        const bIsArrObj = isArrayOfObjects(bv);
        const aIsArrObj = isArrayOfObjects(av);

        // ── Array of objects: render as card grid ──
        if (bIsArrObj || aIsArrObj) {
          const bArr = bIsArrObj ? (bv as Record<string, unknown>[]) : [];
          const aArr = aIsArrObj ? (av as Record<string, unknown>[]) : [];

          return (
            <div key={key}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {key}
              </p>
              {/* Column headers */}
              <div className="flex gap-2 mb-1.5">
                <span className="flex-1 text-[10px] text-muted-foreground font-medium">
                  Before
                </span>
                <span className="flex-1 text-[10px] text-muted-foreground font-medium">
                  After
                </span>
              </div>
              <ArrayOfObjectsDiff beforeArr={bArr} afterArr={aArr} />
            </div>
          );
        }

        // ── Array of primitives ──
        const bStr = Array.isArray(bv)
          ? bv.map(renderScalar).join(", ")
          : ((bv as string) ?? "—");
        const aStr = Array.isArray(av)
          ? av.map(renderScalar).join(", ")
          : ((av as string) ?? "—");
        const changed = bStr !== aStr;

        // ── Scalar / flat row ──
        return (
          <div
            key={key}
            className="grid grid-cols-[1fr_1fr_1fr] gap-1 text-xs border-t border-border/30 pt-2"
          >
            <span className="font-mono text-muted-foreground self-start">
              {key?.split(".")?.pop()?.toUpperCase()}
            </span>
            <span
              className={`font-mono px-1.5 py-0.5 rounded ${changed ? "bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300" : "text-foreground"} text-wrap`}
            >
              {bStr || "—"}
            </span>
            <span
              className={`font-mono px-1.5 py-0.5 rounded ${changed ? "bg-green-50 text-green-800 dark:bg-green-950/60 dark:text-green-300" : "text-foreground"} text-wrap`}
            >
              {aStr || "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}


function ContextViewer({ context }: { context: Record<string, unknown> }) {
  if (!context || !Object.keys(context).length)
    return <p className="text-xs text-muted-foreground italic">No context.</p>;

  // Flatten the entire context object so nested/array-of-object values expand naturally
  const flat = flattenObject(context);

  return (
    <div className="space-y-1.5">
      {Object.entries(flat).map(([k, v]) => (
        <div key={k} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium min-w-fit">
            {k}:
          </span>
          <span className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded border border-border/60">
            {renderScalar(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ErrorViewer({ outcome }: { outcome: { status: string; errorCode?: string; errorMessage?: string; errorName?: string; errorStack?: string } }) {
  if (outcome.status !== "FAILED"){
    return (
      <div className="inline-flex items-center gap-2 text-sm text-green-700 bg-green-50/40 dark:bg-green-950/20 dark:text-green-300 rounded px-3 py-1">
        <CheckCheck size={16} />
        Action succeeded without errors.
      </div>
    );
  };

  return (
    <div className="bg-red-50/40 dark:bg-red-950/20 border border-red-300 dark:border-red-800 rounded p-3 space-y-2">
      <p className="text-xs font-semibold text-red-800 dark:text-red-300">
        Error Details
      </p>
      {outcome.errorCode && (
        <div>
          <p className="text-[11px] text-muted-foreground">Code:</p>
          <pre className="text-xs bg-red-50 dark:bg-red-900 p-2 rounded overflow-x-auto">
            {outcome.errorCode}
          </pre>
        </div>
      )}
      {outcome.errorName && (
        <div>
          <p className="text-[11px] text-muted-foreground">Name:</p>
          <pre className="text-xs bg-red-50 dark:bg-red-900 p-2 rounded overflow-x-auto">
            {outcome.errorName}
          </pre>
        </div>
      )}
      {outcome.errorMessage && (
        <div>
          <p className="text-[11px] text-muted-foreground">Message:</p>
          <pre className="text-xs bg-red-50 dark:bg-red-900 p-2 rounded overflow-x-auto">
            {outcome.errorMessage}
          </pre>
        </div>
      )}
      {outcome.errorStack && (
        <div>
          <p className="text-[11px] text-muted-foreground">Stack Trace:</p>
          <pre className="text-xs bg-red-50 dark:bg-red-900 p-2 rounded overflow-x-auto whitespace-pre-wrap">
            {outcome.errorStack}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Compact Card ─────────────────────────────────────────────────────────────

function CompactCard({ entry }: { entry: AuditEntry }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Avatar + name */}
          <div className="flex items-center gap-3 min-w-0">
            <AvatarComponent
              name={entry.actor.name}
              image={entry.actor.avatar}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight truncate">
                {entry.actor.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(entry.createdAt)}
              </p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="category">{entry.category}</Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Category</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="action">{entry.action}</Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Action</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="role">{entry.actor.role}</Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Role</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Badge
                  variant={
                    entry.outcome.status === "SUCCESS" ? "success" : "danger"
                  }
                >
                  {entry.outcome.status}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Outcome</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Detail Expandable Row ────────────────────────────────────────────────────

function DetailRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow className="hover:bg-muted/40 transition-colors">
        {/* Actor */}
        <TableCell>
          <div className="flex items-center gap-2">
            <AvatarComponent
              name={entry.actor.name}
              image={entry.actor.avatar}
            />
            <div>
              <p className="text-xs font-medium leading-tight">
                {entry.actor.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {entry.actor.email}
              </p>
            </div>
          </div>
        </TableCell>

        <TableCell>
          <Badge variant="action">{entry.action}</Badge>
        </TableCell>
        <TableCell>
          <Badge variant="category">{entry.category}</Badge>
        </TableCell>
        <TableCell>
          <Badge variant="role">{entry.actor.role}</Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {fmtDate(entry.createdAt)}
        </TableCell>
        <TableCell>
          <Badge
            variant={entry.outcome.status === "SUCCESS" ? "success" : "danger"}
          >
            {entry.outcome.status}
          </Badge>
        </TableCell>
        <TableCell>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen((o) => !o)}
            className="h-7 px-2 text-xs gap-1 transition-all duration-300 group"
          >
            {open ? (
              <ChevronUp size={12} className="transition-transform" />
            ) : (
              <ChevronDown size={12} className="transition-transform" />
            )}
            {open ? "Hide" : "Details"}
          </Button>
        </TableCell>
      </TableRow>

      {/* Expandable panel */}
      {/* {open && ( */}
      <TableRow>
        <TableCell colSpan={7} className="p-0 border-b">
          <div
            className={`overflow-scroll transition-all duration-300 
                ${open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
          >
            <div className="bg-muted/30 px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Actor + Context */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Actor
                  </p>
                  <table className="text-xs w-full">
                    <tbody>
                      {[
                        ["Name", entry.actor.name],
                        ["Email", entry.actor.email],
                        ["Role", entry.actor.role],
                        ["ID", entry.actor.id],
                      ].map(([label, val]) => (
                        <tr key={label}>
                          <td className="text-muted-foreground py-0.5 w-14 align-top">
                            {label}
                          </td>
                          <td className="py-0.5 break-all">{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Context
                  </p>
                  <ContextViewer context={entry.context} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Error
                  </p>
                  <ErrorViewer outcome={entry.outcome} />
                </div>

              </div>

              {/* Right: Changes diff */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                  Changes
                </p>
                <DiffViewer
                  before={entry.changes?.before ?? {}}
                  after={entry.changes?.after ?? {}}
                />
              </div>
            </div>
          </div>
        </TableCell>
      </TableRow>
      {/* )} */}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const AuditPage = () => {
  const [view, setView] = useState<"compact" | "detail">("compact");
  const [page, setPage] = useState(1);
  const [startDateTime, setStartDateTime] = useState<string | undefined>();
  const [endDateTime, setEndDateTime] = useState<string | undefined>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [outComeStatus, setOutComeStatus] = useState<string>("");
  const limit = 10;

  enum AuditCategory {
    QUESTION = "Question",
    EXPERTS_CATEGORY = "Experts Category",
    EXPERTS_MANAGEMENT = "Experts Management",
    REQUEST_QUEUE = "Request Queue",
    ANALYTICS = "Analytics",
    CROP_MANAGEMENT = "Crop Management",
    OUTREACH_REPORT = "Outreach Report",
    AGENTS_INTERFACE = "Agents Interface",
    DOWNLOAD_REPORTS = "Download Reports",
    ANSWER = "Answer",
  }

  enum AuditAction {
    ALL = "All",
    QUESTION_ADD = "Question Add",
    QUESTION_UPDATE = "Question Update",
    QUESTION_DELETE = "Question Delete",
    QUESTION_BULK_CREATE = "Question Bulk Create",
    QUESTION_BULK_UPDATE = "Question Bulk Update",
    QUESTION_BULK_DELETE = "Question Bulk Delete",
    REALLOCATE_QUESTIONS = "Reallocate Questions",
    EXPERTS_AUTO_ALLOCATE = "Experts Auto Allocate",
    SELECT_EXPERT = "Select Expert",
    DELETE_EXPERT = "Delete Expert",
    EXPERTS_ADD_COMMENT = "Experts Add Comment",
    BLOCK_EXPERT = "Block Expert",
    UNBLOCK_EXPERT = "Unblock Expert",
    CHANGE_STATUS = "Change Status",
    DELETE_REQUEST = "Delete Request",
    ANALYTICS_EXPORT_PDF = "Analytics Export PDF",
    ADD_CROP = "Add Crop",
    UPDATE_CROP = "Update Crop",
    SEND_OUTREACH_REPORT = "Send Outreach Report",
    DOWNLOAD = "Download",
    APPROVE_ANSWER = "Approve Answer",
    REROUTE_ANSWER = "Reroute Answer",
    REROUTE_REJECTION = "Reroute Rejection",
  }

  enum reverseActionEnum {
    "Question Add" = "QUESTION_ADD",
    "Question Update" = "QUESTION_UPDATE",
    "Question Delete" = "QUESTION_DELETE",
    "Question Bulk Create" = "QUESTION_BULK_CREATE",
    "Question Bulk Update" = "QUESTION_BULK_UPDATE",
    "Question Bulk Delete" = "QUESTION_BULK_DELETE",
    "Reallocate Questions" = "REALLOCATE_QUESTIONS",
    "Experts Auto Allocate" = "EXPERTS_AUTO_ALLOCATE",
    "Select Expert" = "SELECT_EXPERT",
    "Delete Expert" = "DELETE_EXPERT",
    "Experts Add Comment" = "EXPERTS_ADD_COMMENT",
    "Block Expert" = "BLOCK_EXPERT",
    "Unblock Expert" = "UNBLOCK_EXPERT",
    "Change Status" = "CHANGE_STATUS",
    "Delete Request" = "DELETE_REQUEST",
    "Analytics Export PDF" = "ANALYTICS_EXPORT_PDF",
    "Add Crop" = "ADD_CROP",
    "Update Crop" = "UPDATE_CROP",
    "Send Outreach Report" = "SEND_OUTREACH_REPORT",
    "Download" = "DOWNLOAD",
    "Approve Answer" = "APPROVE_ANSWER",
    "Reroute Answer" = "REROUTE_ANSWER",
    "Reroute Rejection" = "REROUTE_REJECTION",
  }

  const actionObject = {
    QUESTION: [
      AuditAction.ALL,
      AuditAction.QUESTION_ADD,
      AuditAction.QUESTION_UPDATE,
      AuditAction.QUESTION_DELETE,
      AuditAction.QUESTION_BULK_CREATE,
      AuditAction.QUESTION_BULK_UPDATE,
      AuditAction.QUESTION_BULK_DELETE,
      AuditAction.REALLOCATE_QUESTIONS,
    ],
    EXPERTS_CATEGORY: [
      AuditAction.ALL,
      AuditAction.EXPERTS_AUTO_ALLOCATE,
      AuditAction.SELECT_EXPERT,
      AuditAction.DELETE_EXPERT,
      AuditAction.EXPERTS_ADD_COMMENT,
    ],
    EXPERTS_MANAGEMENT: [
      AuditAction.ALL,
      AuditAction.BLOCK_EXPERT,
      AuditAction.UNBLOCK_EXPERT,
    ],
    REQUEST_QUEUE: [
      AuditAction.ALL,
      AuditAction.CHANGE_STATUS,
      AuditAction.DELETE_REQUEST,
    ],
    ANALYTICS: [AuditAction.ALL, AuditAction.ANALYTICS_EXPORT_PDF],
    CROP_MANAGEMENT: [
      AuditAction.ALL,
      AuditAction.ADD_CROP,
      AuditAction.UPDATE_CROP,
    ],
    OUTREACH_REPORT: [AuditAction.ALL, AuditAction.SEND_OUTREACH_REPORT],
    DOWNLOAD_REPORTS: [AuditAction.ALL, AuditAction.DOWNLOAD],
    ANSWER: [
      AuditAction.ALL,
      AuditAction.APPROVE_ANSWER,
      AuditAction.REROUTE_ANSWER,
      AuditAction.REROUTE_REJECTION,
    ],
  };

  enum AuditOutcomeStatus {
    SUCCESS = "Success",
    FAILED = "Failed",
    PARTIAL = "Partial",
  }

  enum AuditOrder {
    asc = "Oldest first",
    desc = "Newest first",
  }

  const { data, isLoading, error, refetch } = useGetAuditTrails(
    page,
    limit,
    startDateTime,
    endDateTime,
    category,
    action,
    order,
    outComeStatus,
  );

  const entries: AuditEntry[] = data?.data ?? [];
  const total: number = data?.totalDocuments ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const handleBack = () => {
    window.history.back();
  };

  return (
    <div className="p-6 space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex justify-between items-center">
          <div
            className="flex items-center gap-2 mb-4 sm:mb-6 group cursor-pointer w-fit"
            onClick={handleBack}
          >
            <div className="flex items-center gap-2">
              <ArrowLeft className="mb-12 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:-translate-x-1 transition-transform duration-200" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCheck />
            <h1 className="text-lg font-semibold">Audit Trail</h1>

            {!isLoading && (
              <span className="text-xs bg-purple-50 text-purple-800 border border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-full font-medium">
                {total} entries
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Date filters via DropdownMenu */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsRefreshing(true);
                setTimeout(() => {
                  refetch();
                  setIsRefreshing(false);
                }, 2000);
              }}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="animate-spin w-4 h-4" />
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Refresh
                </>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  <ArrowBigDownDashIcon size={14} />
                  {category
                    ? AuditCategory[category as keyof typeof AuditCategory]
                    : "Category"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-3 space-y-2">
                <DropdownMenuRadioGroup
                  value={category ?? undefined}
                  onValueChange={(value) => {
                    setCategory(value);
                  }}
                >
                  <DropdownMenuRadioItem value="">All</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="QUESTION">
                    Question
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="EXPERTS_CATEGORY">
                    Experts Category
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="EXPERTS_MANAGEMENT">
                    Experts Management
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="REQUEST_QUEUE">
                    Request Queue
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="ANALYTICS">
                    Analytics
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="CROP_MANAGEMENT">
                    Crop Management
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="OUTREACH_REPORT">
                    Outreach Report
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="AGENTS_INTERFACE">
                    Agents Interface
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="DOWNLOAD_REPORTS">
                    Download Reports
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="ANSWER">
                    Answer
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {category && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 text-xs">
                    <ArrowBigDownDashIcon size={14} />
                    {action
                      ? AuditAction[action as keyof typeof AuditAction]
                      : "Action"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-3 space-y-2">
                  <DropdownMenuRadioGroup
                    value={action ?? undefined}
                    onValueChange={(value) => {
                      setAction(value);
                    }}
                  >
                    {actionObject[category as keyof typeof actionObject]?.map(
                      (act) => (
                        <DropdownMenuRadioItem
                          key={act}
                          value={
                            reverseActionEnum[
                              act as keyof typeof reverseActionEnum
                            ]
                          }
                        >
                          {act}
                        </DropdownMenuRadioItem>
                      ),
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                <ArrowBigDownDashIcon size={14} />
                  {outComeStatus ? AuditOutcomeStatus[outComeStatus as keyof typeof AuditOutcomeStatus] : "Outcome"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-3 space-y-2">
              <DropdownMenuRadioGroup
                value={outComeStatus}
                onValueChange={(value) => {
                  setOutComeStatus(value);
                }}
              >
                <DropdownMenuRadioItem value="SUCCESS">Success</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="FAILED">Failed</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="PARTIAL">Partial</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>


          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                <ArrowBigDownDashIcon size={14} />
                {order ? AuditOrder[order as keyof typeof AuditOrder] : "Order"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-3 space-y-2">
              <DropdownMenuRadioGroup
                value={order}
                onValueChange={(value) => {
                  setOrder(value as "asc" | "desc");
                }}
              >
                <DropdownMenuRadioItem value="asc">
                  Oldest first
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="desc">
                  Newest first
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                <ArrowBigDownDashIcon size={14} />
                Date and Time
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-3 space-y-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">
                  Start date
                </label>
                <Input
                  type="datetime-local"
                  value={startDateTime ?? ""}
                  onChange={(e) => {
                    setStartDateTime(e.target.value || undefined);
                    setPage(1);
                  }}
                  className="w-full border rounded-md px-2 py-1 text-xs bg-background"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">
                  End date
                </label>
                <Input
                  type="datetime-local"
                  value={endDateTime ?? ""}
                  onChange={(e) => {
                    setEndDateTime(e.target.value || undefined);
                    setPage(1);
                  }}
                  className="w-full border rounded-md px-2 py-1 text-xs bg-background"
                />
              </div>
              {(startDateTime || endDateTime) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs mt-1"
                  onClick={() => {
                    setStartDateTime(undefined);
                    setEndDateTime(undefined);
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Compact / Detail toggle */}
          <div className="flex border rounded-lg overflow-hidden">
            <button
              onClick={() => setView("compact")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                view === "compact"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <LayoutGrid size={13} />
              Compact
            </button>
            <button
              onClick={() => setView("detail")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-l transition-colors ${
                view === "detail"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <Table2 size={13} />
              Detail
            </button>
          </div>
        </div>
      </div>

      {/* ── States ── */}
      {isLoading && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Loading audit logs…
        </div>
      )}
      {error && (
        <div className="py-8 text-center text-sm text-red-600">
          Failed to load audit logs. Please try again.
        </div>
      )}

      {/* ── Compact: Cards ── */}
      {!isLoading && !error && view === "compact" && (
        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              No audit entries found.
            </p>
          )}
          {entries.map((entry) => (
            <CompactCard key={entry._id} entry={entry} />
          ))}
        </div>
      )}

      {/* ── Detail: Table ── */}
      {!isLoading && !error && view === "detail" && (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className="text-xs w-[22%]">Actor</TableHead>
                <TableHead className="text-xs w-[18%]">Action</TableHead>
                <TableHead className="text-xs w-[12%]">Category</TableHead>
                <TableHead className="text-xs w-[10%]">Role</TableHead>
                <TableHead className="text-xs w-[18%]">Timestamp</TableHead>
                <TableHead className="text-xs w-[10%]">Status</TableHead>
                <TableHead className="text-xs w-[10%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground py-12"
                  >
                    No audit entries found.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <DetailRow key={entry._id} entry={entry} />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Pagination ── */}
      {!isLoading && total > limit && (
        <Pagination
          currentPage={page}
          onPageChange={setPage}
          totalPages={totalPages}
        />
      )}
    </div>
  );
};

export default AuditPage;
