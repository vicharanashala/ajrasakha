import { useMemo, useState } from "react";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Textarea } from "@/components/atoms/textarea";
import { diffWords } from "@/utils/wordDifference";
import { ArrowLeft, ArrowUpRight, Check, Pencil, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { effectiveResult } from "../types";
import { SOURCE_TYPE_LABELS } from "../types";
import type { GdbSourceType, IGdbCleaningItem, IGdbSource } from "../types";
import { GdbFlagsPanel } from "./GdbFlagsPanel";
import { HighlightedText } from "./HighlightedText";
import { StatusBadge } from "./GdbListView";

const REMOVED = "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
const ADDED = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";

interface GdbDetailViewProps {
  item: IGdbCleaningItem;
  onBack: () => void;
  onAccept: (comment: string) => void;
  onDismiss: (comment: string) => void;
  // resolves once the correction is saved
  onSaveCorrection: (text: string) => Promise<unknown>;
  // resolves once the change is saved
  onEditFlag: (parameter: string, result: "PASS" | "FAIL", comment: string) => Promise<unknown>;
  // resolves once the sources are saved
  onSaveSources: (sources: IGdbSource[]) => Promise<unknown>;
  // replaces the golden answer with the accepted correction; resolves once it is done
  onPush: () => Promise<unknown>;
  // the AI draft in the predefined structure; null when it could not be made
  onDraftWithAi: () => Promise<string | null>;
  drafting?: boolean;
  busy?: boolean;
}

export const GdbDetailView = ({
  item,
  onBack,
  onAccept,
  onDismiss,
  onSaveCorrection,
  onEditFlag,
  onSaveSources,
  onPush,
  onDraftWithAi,
  drafting = false,
  busy = false,
}: GdbDetailViewProps) => {
  const [editing, setEditing] = useState(false);
  const [editingSources, setEditingSources] = useState(false);
  const [sourceDraft, setSourceDraft] = useState<IGdbSource[]>([]);
  const [draft, setDraft] = useState("");
  const [comment, setComment] = useState(item.comment ?? "");

  const corrected = item.correctedAnswer;
  const diff = useMemo(
    () => (corrected ? diffWords(item.answer, corrected) : null),
    [item.answer, corrected]
  );
  // the words a failed check found in the answer, for example the banned chemical
  const flaggedWords = useMemo(
    () => item.checks.filter((check) => effectiveResult(check) === "FAIL").flatMap((check) => check.highlight ?? []),
    [item.checks]
  );
  const decided = item.status === "fixed" || item.status === "dismissed";
  // an answer can be changed while it is to do or has no flags; a decided one is closed
  const locked = item.status !== "todo" && item.status !== "clean";

  const startSourceEdit = () => {
    setSourceDraft(item.sources.map((source) => ({ ...source })));
    setEditingSources(true);
  };

  const changeSource = (index: number, field: keyof IGdbSource, value: string) =>
    setSourceDraft((draft) =>
      draft.map((source, i) =>
        i === index ? { ...source, [field]: field === "sourceType" ? value || undefined : value } : source
      )
    );

  // a source needs a link, and a name to show
  const sourcesValid = sourceDraft.every((source) => source.source.trim() && source.sourceName.trim());

  // the draft goes into the correction box; nothing is saved until the expert saves it
  const draftWithAi = async () => {
    const text = await onDraftWithAi();
    if (text) {
      setDraft(text);
      setEditing(true);
    }
  };

  const startEdit = () => {
    setDraft(corrected ?? item.answer);
    setEditing(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to list
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{item.id}</span>
          <StatusBadge status={item.status} />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">{item.question}</h2>
        <div className="flex flex-wrap gap-2">
          {[item.state, item.crop, item.domain].filter(Boolean).map((value) => (
            <Badge key={value} className="bg-foreground/10 text-foreground border-foreground/20">
              {value}
            </Badge>
          ))}
        </div>
      </div>

      {item.status === "pending" ? (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          The quality checks have not run on this answer yet.
        </div>
      ) : (
        <GdbFlagsPanel checks={item.checks} editable={!locked} busy={busy} onEditFlag={onEditFlag} />
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm font-medium text-foreground">Answer review</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className={`inline-block w-3 h-3 rounded-sm ${REMOVED}`} /> Removed, wrong or flagged
            </span>
            <span className="flex items-center gap-1">
              <span className={`inline-block w-3 h-3 rounded-sm ${ADDED}`} /> Added or fixed
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4 bg-muted/50">
            <p className="text-xs font-semibold mb-2 text-foreground">Original answer</p>
            <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
              {diff
                ? diff.map((part, idx) =>
                    part.type === "added" ? null : (
                      <span key={idx} className={part.type === "removed" ? REMOVED : undefined}>
                        {part.value}
                      </span>
                    )
                  )
                : (
                    <HighlightedText
                      text={item.answer}
                      words={flaggedWords}
                      className={`${REMOVED} rounded px-0.5 font-semibold`}
                    />
                  )}
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-muted/50">
            <p className="text-xs font-semibold mb-2 text-foreground">Suggested correction</p>
            {editing ? (
              <div className="space-y-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-h-[220px] text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await onSaveCorrection(draft);
                        setEditing(false);
                      } catch {
                        // the error is shown by the save itself, the text stays in the box
                      }
                    }}
                    disabled={!draft.trim() || busy}
                  >
                    Save correction
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : diff ? (
              <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                {diff.map((part, idx) =>
                  part.type === "removed" ? null : (
                    <span key={idx} className={part.type === "added" ? ADDED : undefined}>
                      {part.value}
                    </span>
                  )
                )}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground space-y-3">
                <p>No correction has been written for this answer.</p>
                <Button size="sm" variant="outline" onClick={startEdit} disabled={locked}>
                  <Pencil className="w-4 h-4 mr-1" />
                  Write a correction
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => onAccept(comment.trim())}
            disabled={!corrected || editing || locked || busy}
          >
            <Check className="w-4 h-4 mr-1" />
            Accept correction
          </Button>
          <Button variant="outline" onClick={startEdit} disabled={editing || locked || busy}>
            <Pencil className="w-4 h-4 mr-1" />
            Edit correction
          </Button>
          <Button variant="outline" onClick={draftWithAi} disabled={locked || busy || drafting}>
            <Sparkles className="w-4 h-4 mr-1" />
            {drafting ? "Drafting..." : "Draft with AI"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onDismiss(comment.trim())}
            disabled={editing || locked || busy || item.status === "clean"}
          >
            <X className="w-4 h-4 mr-1" />
            Dismiss flags
          </Button>
        </div>
        <div className="flex-1 min-w-0">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={locked}
            placeholder="Add a comment (optional)"
            className="min-h-[40px] text-sm"
          />
          {decided && (
            <p className="mt-1 text-xs text-muted-foreground">
              This answer has already been decided.
            </p>
          )}
          {item.status === "fixed" && (
            <div className="mt-2">
              {item.pushedAt && (
                <p className="mb-1 text-xs text-green-700 dark:text-green-300">
                  Pushed to the golden database on {new Date(item.pushedAt).toLocaleString()}.
                </p>
              )}
              {!item.pushedAt || item.sourcesEdited ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Replace the golden answer with this accepted correction? The original text stays saved on this row."
                      )
                    ) {
                      onPush().catch(() => undefined);
                    }
                  }}
                >
                  <Send className="w-4 h-4 mr-1" />
                  {item.pushedAt ? "Push again (sources changed)" : "Push to GDB"}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">Source URLs</p>
          {!editingSources && (
            <Button size="sm" variant="outline" onClick={startSourceEdit} disabled={locked || busy}>
              <Pencil className="w-4 h-4 mr-1" />
              Edit sources
            </Button>
          )}
        </div>

        {editingSources ? (
          <div className="space-y-3">
            {sourceDraft.map((source, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/30 p-3 md:grid-cols-[200px_1fr_90px_130px_auto]"
              >
                <Input
                  value={source.sourceName}
                  onChange={(e) => changeSource(idx, "sourceName", e.target.value)}
                  placeholder="Name"
                />
                <Input
                  value={source.source}
                  onChange={(e) => changeSource(idx, "source", e.target.value)}
                  placeholder="Link"
                />
                <Input
                  value={source.page}
                  onChange={(e) => changeSource(idx, "page", e.target.value)}
                  placeholder="Page"
                />
                <select
                  value={source.sourceType ?? ""}
                  onChange={(e) => changeSource(idx, "sourceType", e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  aria-label="Source type"
                >
                  <option value="">Type</option>
                  {(Object.keys(SOURCE_TYPE_LABELS) as GdbSourceType[]).map((type) => (
                    <option key={type} value={type}>
                      {SOURCE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Remove this source"
                  onClick={() => setSourceDraft((draft) => draft.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSourceDraft((draft) => [...draft, { sourceName: "", source: "", page: "", sourceType: undefined }])}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add a source
            </Button>
            <p className="text-xs text-muted-foreground">
              Saving changes the sources on this answer. The original sources are kept.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!sourcesValid || busy}
                onClick={async () => {
                  try {
                    await onSaveSources(sourceDraft);
                    setEditingSources(false);
                  } catch {
                    // the error is shown by the save itself, the edits stay in the boxes
                  }
                }}
              >
                Save sources
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingSources(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : item.sources.length > 0 ? (
          <div className="space-y-2">
            {item.sources.map((source, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[180px_1fr_auto_auto] items-center gap-4 rounded-lg border bg-muted/30 p-3"
              >
                <span className="text-xs font-medium truncate">{source.sourceName}</span>
                <span className="text-sm truncate text-blue-600 dark:text-blue-400">{source.source}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {source.sourceType ? `${SOURCE_TYPE_LABELS[source.sourceType]} · ` : ""}
                  {source.page ? `pg ${source.page}` : "no page"}
                </span>
                <a
                  href={source.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-muted/20"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No source is attached to this answer.</p>
        )}

        {item.sourcesEdited && !editingSources && (
          <p className="mt-2 text-xs text-muted-foreground">
            Edited by an expert. The original sources:{" "}
            {item.originalSources.length
              ? item.originalSources.map((s) => `${s.sourceName}${s.page ? ` (pg ${s.page})` : ""}`).join("; ")
              : "none"}
            .
          </p>
        )}
      </div>
    </div>
  );
};
