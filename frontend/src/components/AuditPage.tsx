import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./atoms/dropdown-menu";
import { useGetAuditTrails } from "@/hooks/api/auditTrails/useGetAuditTrails";
import { Button } from "./atoms/button";
import { ArrowBigDownDashIcon, LayoutGrid, Table2, ChevronDown, ChevronUp } from "lucide-react";
import { Pagination } from "./pagination";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditActor {
  id: string;
  name: string;
  email: string;
  role: string;
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
  outcome: { status: string };
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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
  return Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null;
}

// Unwraps MongoDB { _id: "..." } single-key wrappers
function unwrapMongoId(v: unknown): string | unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 1 && entries[0][0] === "_id") return String(entries[0][1]);
  }
  return v;
}


// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant = "action" | "category" | "role" | "success" | "danger" | "neutral";

const badgeStyles: Record<BadgeVariant, string> = {
  action:   "bg-blue-50   text-blue-800   border-blue-200   dark:bg-blue-950   dark:text-blue-200   dark:border-blue-800",
  category: "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800",
  role:     "bg-green-50  text-green-800  border-green-200  dark:bg-green-950  dark:text-green-200  dark:border-green-800",
  success:  "bg-green-50  text-green-800  border-green-200  dark:bg-green-950  dark:text-green-200  dark:border-green-800",
  danger:   "bg-red-50    text-red-800    border-red-200    dark:bg-red-950    dark:text-red-200    dark:border-red-800",
  neutral:  "bg-gray-50   text-gray-700   border-gray-200   dark:bg-gray-900   dark:text-gray-300   dark:border-gray-700",
};

function Badge({ children, variant = "neutral" }: { children: React.ReactNode; variant?: BadgeVariant }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${badgeStyles[variant]}`}>
      {children}
    </span>
  );
}

// ─── Dynamic value renderer ───────────────────────────────────────────────────

// function renderScalar(val: unknown): string {
//   if (val === null || val === undefined) return "—";
//   if (Array.isArray(val)) return val.length ? val.map(renderScalar).join(", ") : "[]";
//   if (typeof val === "object") return JSON.stringify(val, null, 2);
//   return String(val);
// }

// function renderScalar(val: unknown): string {
//   if (val === null || val === undefined) return "—";
//   if (typeof val === "object") return JSON.stringify(val); // fallback only
//   return String(val);
// }

function renderScalar(val: unknown): string {
  if (val === null || val === undefined) return "—";
  const unwrapped = unwrapMongoId(val);
  if (typeof unwrapped === "string") return unwrapped;
  if (Array.isArray(unwrapped)) return unwrapped.map(renderScalar).join(", ");
  if (typeof unwrapped === "object") return JSON.stringify(unwrapped);
  return String(unwrapped);
}

// Recursively flattens nested object into dot-notation rows: { "details.state": "Uttarakhand" }
// function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
//   return Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
//     const key = prefix ? `${prefix}.${k}` : k;
//     if (v !== null && typeof v === "object" && !Array.isArray(v)) {
//       Object.assign(acc, flattenObject(v as Record<string, unknown>, key));
//     } else {
//       acc[key] = renderScalar(v);
//     }
//     return acc;
//   }, {});
// }

// function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
//   return Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
//     const key = prefix ? `${prefix}.${k}` : k;

//     if (v === null || v === undefined) {
//       acc[key] = "—";
//     } else if (Array.isArray(v)) {
//       if (v.length === 0) {
//         acc[key] = "[]";
//       } else if (typeof v[0] === "object" && v[0] !== null) {
//         // Array of objects → expand with index: experts[0]._id, experts[1].name …
//         v.forEach((item, i) => {
//           Object.assign(
//             acc,
//             flattenObject(item as Record<string, unknown>, `${key}[${i}]`)
//           );
//         });
//       } else {
//         // Array of primitives → join as comma list
//         acc[key] = v.map(renderScalar).join(", ");
//       }
//     } else if (typeof v === "object") {
//       // Check if it's a MongoDB _id wrapper like { "_id": "..." }
//       const entries = Object.entries(v as Record<string, unknown>);
//       if (entries.length === 1 && entries[0][0] === "_id") {
//         acc[key] = String(entries[0][1]);
//       } else {
//         Object.assign(acc, flattenObject(v as Record<string, unknown>, key));
//       }
//     } else {
//       acc[key] = String(v);
//     }

//     return acc;
//   }, {});
// }

function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  return Object.entries(obj).reduce<Record<string, unknown>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    const unwrapped = unwrapMongoId(v);

    if (unwrapped === null || unwrapped === undefined) {
      acc[key] = "—";
    } else if (Array.isArray(unwrapped)) {
      // Keep arrays as-is — DiffViewer will decide how to render them
      acc[key] = unwrapped;
    } else if (typeof unwrapped === "object") {
      Object.assign(acc, flattenObject(unwrapped as Record<string, unknown>, key));
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

function ObjectCard({ item, index }: { item: Record<string, unknown>; index: number }) {
  const keys = sortKeys(Object.keys(item).filter((k) => k !== "_id"));
  const rawId = item["_id"] ? unwrapMongoId(item["_id"]) : null;
  const id = rawId !== null && rawId !== undefined ? String(rawId) : null;

  return (
    <div className="rounded-lg border border-border/60 bg-background p-2.5 space-y-1">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          #{index + 1}
        </span>
        {id && (
          <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[180px]">
            Id: {id}
          </span>
        )}
      </div>
      {keys.map((k) => (
        <div key={k} className="flex items-start gap-2 text-xs">
          <span className="text-muted-foreground w-14 shrink-0 capitalize">{k}</span>
          <span className="font-medium break-all">{renderScalar(item[k])}</span>
        </div>
      ))}
    </div>
  );
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
            <div className={`flex-1 ${onlyAfter ? "opacity-0 pointer-events-none" : ""}`}>
              {b ? (
                <div className={`rounded-lg border p-2.5 space-y-1 ${onlyBefore ? "border-red-300 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20" : "border-border/60 bg-background"}`}>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">#{i + 1}</span>
                  {sortKeys(Object.keys(b).filter(k => k !== "_id")).map(k => (
                    <div key={k} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground w-14 shrink-0 capitalize">{k}</span>
                      <span className="font-medium break-all">{renderScalar(b[k])}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="flex-1" />}
            </div>

            {/* After */}
            <div className={`flex-1 ${onlyBefore ? "opacity-0 pointer-events-none" : ""}`}>
              {a ? (
                <div className={`rounded-lg border p-2.5 space-y-1 ${onlyAfter ? "border-green-300 bg-green-50/40 dark:border-green-800 dark:bg-green-950/20" : "border-border/60 bg-background"}`}>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">#{i + 1}</span>
                  {sortKeys(Object.keys(a)).map(k => (
                    <div key={k} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground w-14 shrink-0 capitalize">{k}</span>
                      <span className="font-medium break-all">{renderScalar(a[k])}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="flex-1" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ─── Diff Viewer ──────────────────────────────────────────────────────────────

// function DiffViewer({
//   before,
//   after,
// }: {
//   before: Record<string, unknown>;
//   after: Record<string, unknown>;
// }) {
//   const flatBefore = flattenObject(before ?? {});
//   const flatAfter = flattenObject(after ?? {});
//   const allKeys = Array.from(new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)]));

//   if (!allKeys.length)
//     return <p className="text-xs text-muted-foreground italic">No fields recorded.</p>;

//   return (
//     <div className="overflow-x-auto">
//       <table className="w-full text-xs border-collapse">
//         <thead>
//           <tr>
//             <th className="text-left p-1.5 text-muted-foreground font-medium w-1/3">Field</th>
//             <th className="text-left p-1.5 text-muted-foreground font-medium w-1/3">Before</th>
//             <th className="text-left p-1.5 text-muted-foreground font-medium w-1/3">After</th>
//           </tr>
//         </thead>
//         <tbody>
//           {allKeys.map((key) => {
//             const bv = flatBefore[key] ?? "—";
//             const av = flatAfter[key] ?? "—";
//             const changed = bv !== av;
//             return (
//               <tr key={key} className="border-t border-border/40">
//                 <td className="p-1.5 font-mono text-muted-foreground align-top">{key}</td>
//                 <td className={`p-1.5 align-top rounded-sm ${changed ? "bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300" : "text-foreground"}`}>
//                   <span className="font-mono">{bv}</span>
//                 </td>
//                 <td className={`p-1.5 align-top rounded-sm ${changed ? "bg-green-50 text-green-800 dark:bg-green-950/60 dark:text-green-300" : "text-foreground"}`}>
//                   <span className="font-mono">{av}</span>
//                 </td>
//               </tr>
//             );
//           })}
//         </tbody>
//       </table>
//     </div>
//   );
// }

function DiffViewer({
  before,
  after,
}: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const flatBefore = flattenObject(before ?? {});
  const flatAfter = flattenObject(after ?? {});
  const allKeys = Array.from(new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)]));

  if (!allKeys.length)
    return <p className="text-xs text-muted-foreground italic">No fields recorded.</p>;

  return (
    <div className="space-y-4">
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
                <span className="flex-1 text-[10px] text-muted-foreground font-medium">Before</span>
                <span className="flex-1 text-[10px] text-muted-foreground font-medium">After</span>
              </div>
              <ArrayOfObjectsDiff beforeArr={bArr} afterArr={aArr} />
            </div>
          );
        }

        // ── Array of primitives ──
        const bStr = Array.isArray(bv) ? bv.map(renderScalar).join(", ") : (bv as string) ?? "—";
        const aStr = Array.isArray(av) ? av.map(renderScalar).join(", ") : (av as string) ?? "—";
        const changed = bStr !== aStr;

        // ── Scalar / flat row ──
        return (
          <div key={key} className="grid grid-cols-[1fr_1fr_1fr] gap-1 text-xs border-t border-border/30 pt-2">
            <span className="font-mono text-muted-foreground self-start">{key}</span>
            <span className={`font-mono px-1.5 py-0.5 rounded ${changed ? "bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300" : "text-foreground"}`}>
              {bStr || "—"}
            </span>
            <span className={`font-mono px-1.5 py-0.5 rounded ${changed ? "bg-green-50 text-green-800 dark:bg-green-950/60 dark:text-green-300" : "text-foreground"}`}>
              {aStr || "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Context Viewer ───────────────────────────────────────────────────────────

// function ContextViewer({ context }: { context: Record<string, unknown> }) {
//   if (!context || !Object.keys(context).length)
//     return <p className="text-xs text-muted-foreground italic">No context.</p>;

//   return (
//     <div className="space-y-1.5">
//       {Object.entries(context).map(([k, v]) => {
//         const vals = Array.isArray(v) ? v : [v];
//         return (
//           <div key={k} className="flex flex-wrap items-center gap-1.5">
//             <span className="text-xs text-muted-foreground font-medium min-w-fit">{k}:</span>
//             {vals.map((x, i) => (
//               <span key={i} className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded border border-border/60">
//                 {renderScalar(x)}
//               </span>
//             ))}
//           </div>
//         );
//       })}
//     </div>
//   );
// }

function ContextViewer({ context }: { context: Record<string, unknown> }) {
  if (!context || !Object.keys(context).length)
    return <p className="text-xs text-muted-foreground italic">No context.</p>;

  // Flatten the entire context object so nested/array-of-object values expand naturally
  const flat = flattenObject(context);

  return (
    <div className="space-y-1.5">
      {Object.entries(flat).map(([k, v]) => (
        <div key={k} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium min-w-fit">{k}:</span>
          <span className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded border border-border/60">
            {renderScalar(v)}
          </span>
        </div>
      ))}
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
            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center justify-center text-xs font-semibold shrink-0">
              {initials(entry.actor.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight truncate">{entry.actor.name}</p>
              <p className="text-xs text-muted-foreground">{fmtDate(entry.createdAt)}</p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="category">{entry.category}</Badge>
            <Badge variant="action">{entry.action}</Badge>
            <Badge variant="role">{entry.actor.role}</Badge>
            <Badge variant={entry.outcome.status === "SUCCESS" ? "success" : "danger"}>
              {entry.outcome.status}
            </Badge>
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
            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center justify-center text-[10px] font-semibold shrink-0">
              {initials(entry.actor.name)}
            </div>
            <div>
              <p className="text-xs font-medium leading-tight">{entry.actor.name}</p>
              <p className="text-[11px] text-muted-foreground">{entry.actor.email}</p>
            </div>
          </div>
        </TableCell>

        <TableCell><Badge variant="action">{entry.action}</Badge></TableCell>
        <TableCell><Badge variant="category">{entry.category}</Badge></TableCell>
        <TableCell><Badge variant="role">{entry.actor.role}</Badge></TableCell>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {fmtDate(entry.createdAt)}
        </TableCell>
        <TableCell>
          <Badge variant={entry.outcome.status === "SUCCESS" ? "success" : "danger"}>
            {entry.outcome.status}
          </Badge>
        </TableCell>
        <TableCell>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen((o) => !o)}
            className="h-7 px-2 text-xs gap-1"
          >
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {open ? "Hide" : "Details"}
          </Button>
        </TableCell>
      </TableRow>

      {/* Expandable panel */}
      {open && (
        <TableRow>
          <TableCell colSpan={7} className="p-0 border-b">
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
                        ["Name",  entry.actor.name],
                        ["Email", entry.actor.email],
                        ["Role",  entry.actor.role],
                        ["ID",    entry.actor.id],
                      ].map(([label, val]) => (
                        <tr key={label}>
                          <td className="text-muted-foreground py-0.5 w-14 align-top">{label}</td>
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
              </div>

              {/* Right: Changes diff */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Changes
                </p>
                <DiffViewer
                  before={entry.changes?.before ?? {}}
                  after={entry.changes?.after ?? {}}
                />
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const AuditPage = () => {
  const [view, setView] = useState<"compact" | "detail">("compact");
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const limit = 10;

  const { data, isLoading, error, refetch } = useGetAuditTrails(
    page,
    limit,
    startDate,
    endDate
  );


  const entries: AuditEntry[] = data?.data ?? [];
  const total: number = data?.totalDocuments ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="p-6 space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Audit Trail</h1>
          {!isLoading && (
            <span className="text-xs bg-purple-50 text-purple-800 border border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-full font-medium">
              {total} entries
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Date filters via DropdownMenu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                <ArrowBigDownDashIcon size={14} />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-3 space-y-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Start date</label>
                <input
                  type="date"
                  value={startDate ?? ""}
                  onChange={(e) => { setStartDate(e.target.value || undefined); setPage(1); }}
                  className="w-full border rounded-md px-2 py-1 text-xs bg-background"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">End date</label>
                <input
                  type="date"
                  value={endDate ?? ""}
                  onChange={(e) => { setEndDate(e.target.value || undefined); setPage(1); }}
                  className="w-full border rounded-md px-2 py-1 text-xs bg-background"
                />
              </div>
              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs mt-1"
                  onClick={() => { setStartDate(undefined); setEndDate(undefined); setPage(1); }}
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
        <div className="py-16 text-center text-sm text-muted-foreground">Loading audit logs…</div>
      )}
      {error && (
        <div className="py-8 text-center text-sm text-red-600">Failed to load audit logs. Please try again.</div>
      )}

      {/* ── Compact: Cards ── */}
      {!isLoading && !error && view === "compact" && (
        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">No audit entries found.</p>
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
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                    No audit entries found.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => <DetailRow key={entry._id} entry={entry} />)
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Pagination ── */}
      {!isLoading && total > limit && (
        <Pagination currentPage={page} onPageChange={setPage} totalPages={totalPages} />
      )}
    </div>
  );
};

export default AuditPage;