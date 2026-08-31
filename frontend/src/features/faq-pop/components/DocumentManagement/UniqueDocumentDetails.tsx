// @ts-nocheck
import { ALL_UNIQUE_DOCUMENT_FIELDS } from "./fields";
import FileActionIcons from "./FileActionIcons";
import TranslateReviewCell from "./TranslateReviewCell";

// Read-only field grid for a row-expand panel (spec §2.1, §3 expand) — shared by MainTable and
// UniqueDocumentsTable, fed by the lazy-fetch-and-cache lookup owned in DocumentManagementPanel.
// `hideFiles` skips the Original/Translation/Review row — UniqueDocumentsTable renders those as
// dedicated columns (§3.1) rather than duplicating them inside its own expand panel.
export default function UniqueDocumentDetails({ doc, translationAvailable, onChanged, onTranslationStarted, hideFiles }) {
  if (!doc) {
    return <div className="text-xs text-muted-foreground italic py-2">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
        {ALL_UNIQUE_DOCUMENT_FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              {f.label}
            </span>
            <span className="text-xs text-foreground break-words">
              {doc[f.key] || <span className="text-muted-foreground/40">—</span>}
            </span>
          </div>
        ))}
      </div>
      {!hideFiles && (
        <div className="flex flex-wrap items-center gap-4 border-t border-border/50 pt-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Original
            </span>
            <FileActionIcons shareableLink={doc.shareable_link} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Translation
            </span>
            <TranslateReviewCell
              kind="translation"
              doc={doc}
              translationAvailable={translationAvailable}
              onChanged={onChanged}
              onTranslationStarted={onTranslationStarted}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Review
            </span>
            <TranslateReviewCell
              kind="review"
              doc={doc}
              translationAvailable={translationAvailable}
              onChanged={onChanged}
            />
          </div>
        </div>
      )}
    </div>
  );
}
