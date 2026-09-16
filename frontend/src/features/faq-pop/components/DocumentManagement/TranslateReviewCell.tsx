// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import {
  translateDashboardDocument,
  translateUniqueDocument,
  deleteDashboardTranslation,
  uploadDashboardTranslation,
  uploadUniqueDocumentTranslation,
  uploadDashboardReview,
  getDashboardDocument,
  getDashboardUniqueDocument,
  getDashboardTranslationJobs,
  cancelDashboardTranslationJob,
} from "../../api";
import FileActionIcons from "./FileActionIcons";
import StatusBadge from "./StatusBadge";

// `*_shareable_link` is a raw workdrive.zoho.in URL — fine for "View" (opens Zoho's own viewer)
// but NOT for Download: it demands a Zoho login. Downloads go through the backend's
// `/dashboard/files/{id}/download` proxy instead, keyed by `*_file_id` (confirmed by the backend,
// same convention as the Original file's `representative_file_id`). Jobs are per DOCUMENT, not
// per placement: translating from any one placement translates the whole document, and every
// sibling placement then shows translation_status: "done".
const KIND_CONFIG = {
  translation: {
    statusKey: "translation_status",
    linkKey: "translation_shareable_link",
    fileIdKey: "translation_file_id",
  },
  review: {
    statusKey: "review_status",
    linkKey: "review_shareable_link",
    fileIdKey: "review_file_id",
  },
};

// Shared Translate/Review column cell — button (not yet done) -> in-progress badge -> file icons
// + delete/upload (done). Both kinds are document-level, not placement-level — a placement id
// only shows up as a URL parameter, the effect always lands on the whole document — so this is
// only ever rendered with scope="document" now (Main Table dropped these controls entirely: they
// were duplicating the same document's state across every one of its placement rows).
// scope="placement" still works (translateDashboardDocument/uploadDashboardTranslation etc. take
// a placement id directly) in case a placement-scoped context returns.
//
// Delete-translation and review-upload are placement-addressed only (DELETE
// /documents/{id}/translation, POST /documents/{id}/review) — from document scope they need SOME
// placement id to call through: `reviewUploadId` is a static id (Document Detail already has its
// Placements list loaded, so it just passes placements[0].id); `resolvePlacementId` is an async
// fallback for callers that don't have one on hand yet (Documents tab rows only have the
// document) — called lazily, right when the action happens, rather than fetching placements for
// every row up front. Translation-upload got its own document-addressed route
// (POST /unique-documents/{id}/translation), so it needs neither.
export default function TranslateReviewCell({
  kind,
  doc,
  scope = "placement",
  reviewUploadId,
  resolvePlacementId,
  translationAvailable,
  onChanged,
  onTranslationStarted,
}) {
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

  // In a placement context, re-fetch the placement row (translation_status lives there too, since
  // it's joined onto every row of the document); in a document context, re-fetch the document.
  function refetchOne(id) {
    return scope === "placement" ? getDashboardDocument(id) : getDashboardUniqueDocument(id);
  }

  function startPolling(id) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await refetchOne(id);
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
      if (scope === "placement") await translateDashboardDocument(doc.id);
      else await translateUniqueDocument(doc.id);
      toast.success("Translation queued");
      onChanged?.({ ...doc, [cfg.statusKey]: "in_progress" });
      startPolling(doc.id);
      // Translations also show up in the separate Translation Queue panel (backed by
      // translation-jobs) — nudge it to refetch immediately rather than waiting on its own poll.
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
      const targetId = scope === "placement" ? doc.id : await resolvePlacementId();
      await deleteDashboardTranslation(targetId);
      onChanged?.({ ...doc, [cfg.statusKey]: "not_started", [cfg.linkKey]: null });
    } catch (err) {
      toast.error(err.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleTranslationFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      if (scope === "placement") await uploadDashboardTranslation(doc.id, file);
      else await uploadUniqueDocumentTranslation(doc.id, file);
      toast.success("Translation uploaded");
      const fresh = await refetchOne(doc.id);
      onChanged?.(fresh);
    } catch (err) {
      const message = err.message || "Upload failed";
      if (/already running/i.test(message)) {
        // The 409 means a job for this document is queued/running and would overwrite what we
        // just tried to attach — look up that specific job (jobs carry unique_document_id) so the
        // toast can offer a direct "Cancel job" action rather than just pointing at the queue.
        let job = null;
        try {
          const jobs = await getDashboardTranslationJobs();
          const targetDocId = scope === "placement" ? doc.unique_document_id : doc.id;
          job = (jobs || []).find((j) => j.unique_document_id === targetDocId);
        } catch {
          // ignore — fall back to a plain message with no action
        }
        toast.error(
          message,
          job
            ? {
                action: {
                  label: "Cancel job",
                  onClick: async () => {
                    try {
                      await cancelDashboardTranslationJob(job.id);
                      toast.success("Cancelling — try uploading again once it stops");
                      onTranslationStarted?.();
                    } catch (cancelErr) {
                      toast.error(cancelErr.message || "Failed to cancel the job");
                    }
                  },
                },
              }
            : undefined,
        );
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function handleReviewFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const targetId = reviewUploadId || (scope === "placement" ? doc.id : await resolvePlacementId());
      await uploadDashboardReview(targetId, file);
      toast.success("Review uploaded");
      const fresh = await refetchOne(doc.id);
      onChanged?.(fresh);
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const status = doc?.[cfg.statusKey] || "not_started";
  const link = doc?.[cfg.linkKey];
  const fileId = doc?.[cfg.fileIdKey];

  // Review has no delete endpoint at any scope — POST .../review just overwrites whatever was
  // there, so re-uploading (not deleting) is how a review gets redone. Unlike Translate, keep the
  // button available once done, not just before — it doubles as "Replace".
  const canUploadReview =
    kind === "review" && (scope === "placement" || reviewUploadId || resolvePlacementId);
  const reviewUploadControl = canUploadReview && (
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
        title={status === "done" ? "Replace the uploaded review" : undefined}
      >
        <Upload size={11} /> {busy ? "Uploading…" : status === "done" ? "Replace" : "Upload review"}
      </button>
    </>
  );

  // Manual translation upload — for someone comparing two candidate translations and attaching
  // the one they picked, instead of (or after) running the auto-translate job. Available whether
  // or not a job has already produced a translation (it doubles as "Replace"), and even while a
  // job is running — that attempt is what surfaces the 409/cancel-job flow in handleTranslationFile.
  const translationUploadControl = kind === "translation" && (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleTranslationFile}
        disabled={busy}
      />
      <button
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        title={
          status === "done"
            ? "Replace with a different translation file"
            : "Upload a translation file directly, instead of running Translate"
        }
      >
        <Upload size={11} /> {busy ? "Uploading…" : status === "done" ? "Replace" : "Upload"}
      </button>
    </>
  );

  if (status === "done") {
    // Delete-translation is placement-addressed but works from document scope too as long as
    // there's a way to get a placement id (resolvePlacementId) — see handleDeleteTranslation.
    // Redoing a translation goes through this delete (then Translate reappears), since there's no
    // confirmed "re-queue while already done" endpoint — or Replace, above, to swap the file
    // directly without resetting status at all.
    const onDelete =
      kind === "translation" && (scope === "placement" || resolvePlacementId)
        ? handleDeleteTranslation
        : undefined;
    return (
      <div className="flex items-center gap-1.5">
        <StatusBadge status={status} />
        <FileActionIcons shareableLink={link} fileId={fileId} onDelete={onDelete} deleting={busy} />
        {reviewUploadControl}
        {translationUploadControl}
      </div>
    );
  }

  if (status === "in_progress") {
    return (
      <div className="flex items-center gap-1.5">
        <StatusBadge status={status} />
        {translationUploadControl}
      </div>
    );
  }

  if (kind === "translation") {
    return (
      <div className="flex items-center gap-1.5">
        <button
          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleTranslate}
          disabled={busy || !translationAvailable}
          title={!translationAvailable ? "Translation is currently out of order" : undefined}
        >
          Translate
        </button>
        {translationUploadControl}
      </div>
    );
  }

  return reviewUploadControl || null;
}
