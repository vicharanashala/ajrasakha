import { cn } from "@/lib/utils";
import { Skeleton } from "./atoms/skeleton";
import { ScrollArea } from "./atoms/scroll-area";
import type { IDetailedQuestion } from "@/types";

type QuestionFlagDiff = {
  currentDoc: IDetailedQuestion | null;
  existingDoc: IDetailedQuestion | null;
};

type RequestLike = {
  requestType: string;
  diff?: QuestionFlagDiff;
};

const Legend = () => {
  return (
    <div
      className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"
      aria-hidden="true"
    >
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-destructive/30" />
        removed
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-primary/30" />
        added
      </span>
    </div>
  );
};

const isPrimitive = (v: unknown) => {
  return v == null || ["string", "number", "boolean"].includes(typeof v);
};

const ValueView = ({ value }: { value: unknown }) => {
  if (value == null) return <span className="text-muted-foreground">null</span>;
  if (typeof value === "object") {
    return (
      <pre className="overflow-x-auto rounded bg-muted p-2 text-xs leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return (
    <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
      {String(value)}
    </code>
  );
};

export const diffQuestion = (
  oldDoc: Record<string, any>,
  newDoc: Record<string, any>,
): Array<{
  path: string;
  oldValue: unknown;
  newValue: unknown;
  changed: boolean;
}> => {
  const results: Array<{
    path: string;
    oldValue: unknown;
    newValue: unknown;
    changed: boolean;
  }> = [];

  const visit = (prefix: string, a: any, b: any) => {
    if (isPrimitive(a) && isPrimitive(b)) {
      results.push({
        path: prefix,
        oldValue: a,
        newValue: b,
        changed: a !== b,
      });
      return;
    }
    if ((a == null) !== (b == null)) {
      results.push({ path: prefix, oldValue: a, newValue: b, changed: true });
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      const keys = Array.from(
        new Set([...Object.keys(a), ...Object.keys(b)]),
      ).sort();
      for (const key of keys) {
        const path = prefix ? `${prefix}.${key}` : key;
        visit(path, a?.[key], b?.[key]);
      }
      return;
    }
    results.push({ path: prefix, oldValue: a, newValue: b, changed: a !== b });
  };

  visit("", oldDoc, newDoc);

  return results.map((r) => ({
    ...r,
    path: r.path.startsWith(".") ? r.path.slice(1) : r.path,
  }));
};

export const ReqDetailsDiff = ({
  request,
  requestDiffLoading,
  className,
  title = "Request Diff",
}: {
  request: RequestLike;
  requestDiffLoading: boolean;
  className?: string;
  title?: string;
}) => {
  if (requestDiffLoading) {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        className={["w-full rounded border bg-card p-4", className]
          .filter(Boolean)
          .join(" ")}
      >
        <header className="mb-3">
          <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        </header>
        <div className="flex flex-col gap-2">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton className="w-2/3" />
        </div>
      </section>
    );
  }

  if (request?.requestType !== "question_flag" || !request?.diff) return null;

  const { existingDoc, currentDoc } = request.diff;
  if (!existingDoc || !currentDoc) return null;

  const changes = diffQuestion(existingDoc, currentDoc);
  const allFields = changes.sort((a, b) => {
    if (a.path === "question") return -1;
    if (b.path === "question") return 1;
    const aIsDetails = a.path.startsWith("details");
    const bIsDetails = b.path.startsWith("details");
    if (aIsDetails && !bIsDetails) return 1;
    if (!aIsDetails && bIsDetails) return -1;
    return a.path.localeCompare(b.path);
  });

  return (
    <section
      className="w-full rounded border bg-card p-4"
      role="region"
      aria-label="Request Diff Viewer"
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <Legend />
      </header>
      <ScrollArea className="h-[400px] w-full rounded-md">
        {allFields.length === 0 ? (
          <div
            className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            No changes detected.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 min-w-[700px]">
            <div className="border-r border-border pr-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                Existing
              </h3>
              <ol
                className="space-y-3"
                role="list"
                aria-label="Existing document"
              >
                {allFields.map((f) => (
                  <li
                    key={f.path + "-old"}
                    className={cn(
                      "rounded-md border border-border p-3",
                      f.changed ? "bg-destructive/10" : "bg-muted/20",
                    )}
                  >
                    <div className="text-xs text-muted-foreground mb-1 font-mono">
                      {f.path}
                    </div>
                    <ValueView value={f.oldValue} />
                  </li>
                ))}
              </ol>
            </div>
            <div className="pl-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                Current
              </h3>
              <ol
                className="space-y-3"
                role="list"
                aria-label="Current document"
              >
                {allFields.map((f) => (
                  <li
                    key={f.path + "-new"}
                    className={cn(
                      "rounded-md border border-border p-3",
                      f.changed ? "bg-primary/10" : "bg-muted/20",
                    )}
                  >
                    <div className="text-xs text-muted-foreground mb-1 font-mono">
                      {f.path}
                    </div>
                    <ValueView value={f.newValue} />
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </ScrollArea>
    </section>
  );
};
