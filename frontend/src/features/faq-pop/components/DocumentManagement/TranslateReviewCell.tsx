// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import {
  translateDashboardDocument,
  deleteDashboardTranslation,
  uploadDashboardReview,
  deleteDashboardReview,
  getDashboardUniqueDocument,
} from "../../api";
import FileActionIcons from "./FileActionIcons";
import StatusBadge from "./StatusBadge";

// Verified against dashboard/schemas.py::UniqueDocumentOut in the POP-Translation repo — only
// `*_shareable_link` is exposed for translation/review (no zoho file id). Backend API changes
// (2026-08-24): `translation_shareable_link`/`review_shareable_link` are now actually set by
// routes_translation.py on translate-success / review-upload, so this works the same for
// historical/migrated documents and anything translated/reviewed through this dashboard.
const KIND_CONFIG = {
  translation: { statusKey: "translation_status", linkKey: "translation_shareable_link" },
  review: { statusKey: "review_status", linkKey: "review_shareable_link" },
};

// Shared Translate/Review column cell — button (not yet done) -> in-progress badge (translation
// only, review has no async job) -> file icons + delete (done). Used identically by both tables'
// Translation and Review columns (spec §7).
export default function TranslateReviewCell({ kind, doc, translationAvailable, onChanged, onTranslationStarted }) {
  const cfg = KIND_CONFIG[kind];
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }
  useEffect(() => () => stopPolling(), []);

  function startPolling(id) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await getDashboardUniqueDocument(id);
        onChanged?.(fresh);
        if (fresh[cfg.statusKey] !== "in_progress") stopPolling();
      } catch {
        // ignore transient errors
      }
    }, 3000);
  }

  async function handleTranslate() {
    setBusy(true);
    try {
      await translateDashboardDocument(doc.id);
      toast.success("Translation queued");
      onChanged?.({ ...doc, [cfg.statusKey]: "in_progress" });
      startPolling(doc.id);
      // Backend API changes (2026-08-24 round 2): translations now also show up in the separate
      // Translation Queue panel (spec §8, backed by translation_jobs) — nudge it to refetch
      // immediately rather than waiting for its own 30s poll.
      onTranslationStarted?.();
    } catch (err) {
      toast.error(err.message || "Failed to start translation");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTranslation() {
    if (!window.confirm("Delete this translation?")) return;
    setBusy(true);
    try {
      await deleteDashboardTranslation(doc.id);
      onChanged?.({ ...doc, [cfg.statusKey]: "not_started", [cfg.linkKey]: null });
    } catch (err) {
      toast.error(err.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReviewFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await uploadDashboardReview(doc.id, file);
      toast.success("Review uploaded");
      const fresh = await getDashboardUniqueDocument(doc.id);
      onChanged?.(fresh);
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function handleDeleteReview() {
    if (!window.confirm("Delete this review?")) return;
    setBusy(true);
    try {
      await deleteDashboardReview(doc.id);
      onChanged?.({ ...doc, [cfg.statusKey]: "not_started", [cfg.linkKey]: null });
    } catch (err) {
      toast.error(err.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const status = doc?.[cfg.statusKey] || "not_started";
  const link = doc?.[cfg.linkKey];

  if (status === "done") {
    return (
      <div className="flex items-center gap-1.5">
        <StatusBadge status={status} />
        <FileActionIcons
          shareableLink={link}
          onDelete={kind === "translation" ? handleDeleteTranslation : handleDeleteReview}
          deleting={busy}
        />
      </div>
    );
  }

  if (status === "in_progress") {
    return <StatusBadge status={status} />;
  }

  if (kind === "translation") {
    return (
      <button
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={handleTranslate}
        disabled={busy || !translationAvailable}
        title={!translationAvailable ? "Translation is currently out of order" : undefined}
      >
        Translate
      </button>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleReviewFile}
        disabled={busy}
      />
      <button
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
      >
        <Upload size={11} /> Upload review
      </button>
    </>
  );
}
