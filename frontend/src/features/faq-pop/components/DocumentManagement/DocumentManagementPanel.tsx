// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import {
  getDashboardConfig,
  getStats,
  getDashboardUploads,
  cancelDashboardUpload,
  addUploadToMatch,
  addUploadAsNew,
  updateDashboardUpload,
  approveDashboardUpload,
  declineDashboardUpload,
  resubmitDashboardUpload,
  removeDashboardUpload,
  getDashboardTranslationJobs,
  cancelDashboardTranslationJob,
  deleteDashboardTranslationJob,
} from "../../api";
import { subscribeDashboardEvents } from "../../dashboardEvents";
import MainTable from "./MainTable";
import UniqueDocumentsTable from "./UniqueDocumentsTable";
import AddDocumentForm from "./AddDocumentForm";
import UploadQueuePanel from "./UploadQueuePanel";
import TranslationQueuePanel from "./TranslationQueuePanel";
import ResizableSplitPanel from "./ResizableSplitPanel";
import DocumentDetailModal from "./DocumentDetailModal";

const MODES = [
  { id: "add-document", label: "Add Document" },
  { id: "main-table", label: "Main Table" },
  { id: "unique-documents", label: "Documents" },
];

// Document Management dashboard (docs/first_render_frontend.md) — third mode alongside
// FAQ-Cluster/POP-Translation, wired in as a TABS entry in ../../DataProcessingDashboard.tsx.
//
// This component owns everything that must survive switching between its own 3 sub-modes: the
// Upload Queue + Translation Queue poll (both load on initial page load and share one interval,
// not gated behind opening "Add Document" mode) and the single Document Detail modal, opened by
// document id from any sub-mode or queue row rather than switching tabs to a dedicated "Unique
// Documents" table row (the old cross-tab jump/pin/focus mechanism). All 3 sub-tables stay
// mounted permanently — visibility toggles via a `hidden` className, not conditional unmount — so
// polling is never torn down by a sub-mode switch.
export default function DocumentManagementPanel({
  canEdit = false,
  canTranslate = false,
  canApproveUploads = false,
  isAdmin = false,
}) {
  const [activeMode, setActiveMode] = useState("main-table");
  // approved_by (approver/admin columns) — the signed-in user's display name, same source as
  // uploaded_by/translated_by (see TranslateReviewCell.tsx).
  const currentUserName = useAuthStore((s) => s.user?.name);

  const [translationAvailable, setTranslationAvailable] = useState(false);
  useEffect(() => {
    getDashboardConfig()
      .then((cfg) => setTranslationAvailable(Boolean(cfg?.translation_available)))
      .catch(() => setTranslationAvailable(false));
  }, []);

  const [stats, setStats] = useState(null);
  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  // Document Detail modal — opened by unique-document id from a placement row, a document row, or
  // a queue jump-link. Bumping refreshKey tells the currently-loaded tables to re-fetch their
  // current page after something changes inside the modal (edit, merge, placement delete).
  const [detailDocId, setDetailDocId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  function openDetail(id) {
    if (id) setDetailDocId(id);
  }
  function bumpRefresh() {
    setRefreshKey((n) => n + 1);
  }

  // Upload Queue + Translation Queue — separate queues, both present by default (empty state
  // until something's happening). Kept live by the shared SSE subscription below (GET
  // /dashboard/events); the interval further down is now just a slow fallback in case that
  // stream is unavailable, not the primary refresh mechanism.
  const [queueItems, setQueueItems] = useState([]);
  // GET /dashboard/uploads returns, per caller: own uploads at ANY level, plus level 1 (approver)
  // items if an upload approver, plus level 2 (admin) items if admin — but each queue should only
  // show items that are actually THIS person's turn to act on right now, not every level they can
  // merely see. `level` (0=with the uploader, 1=with the approvers, 2=with the admins) moves on
  // every add/decline/resubmit, so this is re-derived from the live item on every render, not
  // cached. `stage` is the same thing as a label, still sent — used here only as a fallback for an
  // item that hasn't been re-fetched with `level` yet.
  const LEVEL_BY_STAGE = { expert: 0, approver: 1, admin: 2 };
  function itemLevel(i) {
    return typeof i.level === "number" ? i.level : LEVEL_BY_STAGE[i.stage];
  }
  const visibleQueueItems = queueItems.filter((i) => {
    const level = itemLevel(i);
    if (canApproveUploads && isAdmin) return level === 1 || level === 2;
    if (canApproveUploads) return level === 1;
    if (isAdmin) return level === 2;
    return level === 0;
  });
  const [translationJobs, setTranslationJobs] = useState([]);
  const [busyUploadId, setBusyUploadId] = useState(null);
  const [stoppingJobIds, setStoppingJobIds] = useState(() => new Set());
  // "New" is async — a real Zoho upload happens server-side, and the item stays at
  // status=awaiting_review the whole time (no interim status change). Track it locally so the row
  // can show "Processing…" until an "upload" event (or the fallback poll) finds the item either
  // gone (succeeded) or flipped to status=failed.
  const [processingUploadIds, setProcessingUploadIds] = useState(() => new Set());

  async function refetchUploads() {
    try {
      const items = (await getDashboardUploads()) || [];
      setQueueItems(items);
      setProcessingUploadIds((prev) => {
        const next = new Set(prev);
        for (const id of prev) {
          const item = items.find((it) => it.id === id);
          if (!item || item.status !== "awaiting_review") next.delete(id);
        }
        return next;
      });
    } catch {
      // ignore transient errors, next poll/manual refresh will retry
    }
  }

  async function refetchTranslationJobs() {
    try {
      const jobs = (await getDashboardTranslationJobs()) || [];
      setTranslationJobs(jobs);
      const stillActive = new Set(jobs.map((j) => j.id));
      setStoppingJobIds((prev) => new Set([...prev].filter((id) => stillActive.has(id))));
    } catch {
      // ignore transient errors, next poll/manual refresh will retry
    }
  }

  // Finished jobs (done/failed/cancelled) — hidden by default (default GET only lists
  // queued+running), fetched on demand once the panel's "show finished" toggle is on. The API
  // takes one `status` at a time, so history is 3 calls merged rather than one.
  const [finishedJobs, setFinishedJobs] = useState([]);
  const [showFinishedJobs, setShowFinishedJobs] = useState(false);
  // Mirrors showFinishedJobs for the mount-only SSE effect below, whose "translation" handler
  // would otherwise close over the value from mount time forever.
  const showFinishedJobsRef = useRef(showFinishedJobs);
  showFinishedJobsRef.current = showFinishedJobs;
  const [removingJobIds, setRemovingJobIds] = useState(() => new Set());
  async function refetchFinishedJobs() {
    try {
      const [done, failed, cancelled] = await Promise.all([
        getDashboardTranslationJobs("done"),
        getDashboardTranslationJobs("failed"),
        getDashboardTranslationJobs("cancelled"),
      ]);
      setFinishedJobs([...(done || []), ...(failed || []), ...(cancelled || [])]);
    } catch {
      // ignore transient errors, next toggle/manual refresh will retry
    }
  }
  useEffect(() => {
    if (showFinishedJobs) refetchFinishedJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFinishedJobs]);

  async function handleRemoveTranslationJob(job) {
    setRemovingJobIds((prev) => new Set(prev).add(job.id));
    try {
      await deleteDashboardTranslationJob(job.id);
      setFinishedJobs((prev) => prev.filter((j) => j.id !== job.id));
    } catch (err) {
      toast.error(err.message || "Failed to remove");
    } finally {
      setRemovingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  }

  async function refetchAll() {
    await Promise.all([
      refetchUploads(),
      refetchTranslationJobs(),
      ...(showFinishedJobs ? [refetchFinishedJobs()] : []),
    ]);
  }

  // Both queues load up front regardless of which sub-mode is active.
  useEffect(() => {
    refetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback only — GET /dashboard/events (below) is the primary way these queues stay live. Runs
  // unconditionally every 60s (no user-facing toggle — SSE is the real mechanism now). Recreated
  // on showFinishedJobs too, so it doesn't leave the interval's refetchAll closure stale (it
  // decides whether to include the finished-jobs fetch).
  useEffect(() => {
    const id = setInterval(refetchAll, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFinishedJobs]);

  // refetchAll's own closure goes stale if captured once by the mount-only SSE effect below (it
  // reads showFinishedJobs) — mirror it in a ref so the "open" handler always calls the current
  // version instead.
  const refetchAllRef = useRef(refetchAll);
  refetchAllRef.current = refetchAll;
  const refetchUploadsRef = useRef(refetchUploads);
  refetchUploadsRef.current = refetchUploads;
  const uploadRefetchTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(uploadRefetchTimerRef.current), []);

  // GET /dashboard/events — one shared SSE connection (see dashboardEvents.ts) driving live
  // updates for both queues, instead of polling. No replay on reconnect, so every (re)connect
  // refetches both queues from scratch via the "open" handler. Mount-only: state setters below are
  // all stable, and refetchAllRef.current always points at the latest closure.
  useEffect(() => {
    const unsubscribe = subscribeDashboardEvents({
      open: () => refetchAllRef.current(),
      // GET /dashboard/uploads is now per-caller (own uploads + approver-stage items if an upload
      // approver + admin-stage items if admin) rather than one shared list, so the event's own
      // payload can no longer be upserted into local state directly — it may not even be an item
      // this caller is allowed to see. Refetch instead (debounced — an upload moving through
      // several stages fires several events in quick succession).
      upload: () => {
        clearTimeout(uploadRefetchTimerRef.current);
        uploadRefetchTimerRef.current = setTimeout(refetchUploadsRef.current, 300);
      },
      translation: (job) => {
        // translationJobs mirrors GET /dashboard/translation-jobs' default (queued+running only)
        // — a job that just finished belongs in finishedJobs (if that's being shown), not here.
        const finished = job.deleted || ["done", "failed", "cancelled"].includes(job.status);
        setTranslationJobs((prev) => {
          if (finished) return prev.filter((j) => j.id !== job.id);
          const idx = prev.findIndex((j) => j.id === job.id);
          if (idx === -1) return [...prev, job];
          const next = [...prev];
          next[idx] = job;
          return next;
        });
        if (finished) {
          setStoppingJobIds((prev) => {
            if (!prev.has(job.id)) return prev;
            const next = new Set(prev);
            next.delete(job.id);
            return next;
          });
          setFinishedJobs((prev) => {
            if (!showFinishedJobsRef.current) return prev;
            const filtered = prev.filter((j) => j.id !== job.id);
            return job.deleted ? filtered : [...filtered, job];
          });
        }
      },
      document: () => bumpRefresh(),
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUploadQueued() {
    refetchUploads();
  }

  // 404 means this upload isn't (or is no longer) visible to this caller at all; 409 means
  // someone else just moved it to another stage; 403 covers losing standing to act on it (e.g.
  // removed as an approver, or it moved to a stage that isn't this caller's) — in every case the
  // locally-held item/queue is stale, so resync from the server instead of leaving a dead row the
  // next click will just 403/404/409 again.
  function isStaleUploadError(err) {
    return err?.status === 403 || err?.status === 404 || err?.status === 409;
  }

  async function handleCancelUpload(item) {
    setBusyUploadId(item.id);
    try {
      await cancelDashboardUpload(item.id);
      setQueueItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      toast.error(err.message || "Failed to cancel");
      if (isStaleUploadError(err)) refetchUploads();
    } finally {
      setBusyUploadId(null);
    }
  }

  async function handleAddUpload(item, documentId, candidate) {
    setBusyUploadId(item.id);
    try {
      const res = await addUploadToMatch(item.id, documentId, currentUserName);
      // The upload moves to status "uploading" right away and the worker creates placements
      // afterward, so created_row_ids (and placements_created) in this reply is always empty —
      // count from the candidate's own new_placements, what the row already showed as "would
      // file it under N new place(s)".
      const count = candidate?.new_placements?.length ?? res?.placements_created ?? 0;
      toast.success(`Linked — ${count} new placement(s) created`);
      setQueueItems((prev) => prev.filter((it) => it.id !== item.id));
      bumpRefresh();
    } catch (err) {
      toast.error(err.message || "Failed to add");
      if (isStaleUploadError(err)) refetchUploads();
    } finally {
      setBusyUploadId(null);
    }
  }

  // Async — the item stays in the queue at status=awaiting_review while the real Zoho upload
  // happens server-side; mark it "processing" and let the fast follow-up poll above discover
  // when it's actually resolved rather than assuming this call alone finished the job.
  async function handleNewUpload(item) {
    setBusyUploadId(item.id);
    try {
      await addUploadAsNew(item.id, currentUserName);
      setProcessingUploadIds((prev) => new Set(prev).add(item.id));
    } catch (err) {
      toast.error(err.message || "Failed to process as a new document");
      if (isStaleUploadError(err)) refetchUploads();
    } finally {
      setBusyUploadId(null);
    }
  }

  // Upload approver: moves the item from stage "approver" to "admin".
  async function handleApproveUpload(item) {
    setBusyUploadId(item.id);
    try {
      const updated = await approveDashboardUpload(item.id, currentUserName);
      setQueueItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      toast.success("Approved");
    } catch (err) {
      toast.error(err.message || "Failed to approve");
      if (isStaleUploadError(err)) refetchUploads();
    } finally {
      setBusyUploadId(null);
    }
  }

  // Approver or admin declining with a required note — sends it back a stage (approver -> expert,
  // admin -> approver). The backend 400s on an empty note, so the panel below only calls this once
  // the note box has content.
  async function handleDeclineUpload(item, note) {
    setBusyUploadId(item.id);
    try {
      const updated = await declineDashboardUpload(item.id, note);
      setQueueItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      toast.success("Declined");
    } catch (err) {
      toast.error(err.message || "Failed to decline");
      if (isStaleUploadError(err)) refetchUploads();
    } finally {
      setBusyUploadId(null);
    }
  }

  // Editing the upload's own submitted fields/placements — offered while actions.can_edit is true
  // (approver or admin stage, whoever's turn it is). Only ever called with keys the backend
  // actually accepts (language/placements/district_id/kvk_id/format_original/an upload-form
  // metadata field) — it 422s on anything else, uploaded_by included.
  async function handleEditUpload(item, fields) {
    setBusyUploadId(item.id);
    try {
      const updated = await updateDashboardUpload(item.id, fields);
      setQueueItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      toast.success("Saved");
    } catch (err) {
      toast.error(err.message || "Failed to save");
      if (isStaleUploadError(err)) refetchUploads();
    } finally {
      setBusyUploadId(null);
    }
  }

  // The uploading expert sending their declined upload back to the approvers — offered while
  // actions.can_resubmit is true (stage "expert", status awaiting_review only). The item stays in
  // the expert's own list afterward (they always see their own uploads) but moves to stage
  // "approver", with no actions left for them until it's decided again.
  async function handleResubmitUpload(item) {
    setBusyUploadId(item.id);
    try {
      const updated = await resubmitDashboardUpload(item.id);
      setQueueItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      toast.success("Resubmitted");
    } catch (err) {
      toast.error(err.message || "Failed to resubmit");
      if (isStaleUploadError(err)) refetchUploads();
    } finally {
      setBusyUploadId(null);
    }
  }

  // Admin discard (stage "admin") — same DELETE route as the uploader's own Remove below, kept as
  // a separate handler so the two read as distinct actions even though the request is identical.
  async function handleDiscardUpload(item) {
    setBusyUploadId(item.id);
    try {
      await cancelDashboardUpload(item.id);
      setQueueItems((prev) => prev.filter((it) => it.id !== item.id));
      toast.success("Discarded");
    } catch (err) {
      toast.error(err.message || "Failed to discard");
      if (isStaleUploadError(err)) refetchUploads();
    } finally {
      setBusyUploadId(null);
    }
  }

  // The uploading expert removing an item returned to them (stage "expert" only).
  async function handleRemoveUpload(item) {
    setBusyUploadId(item.id);
    try {
      await removeDashboardUpload(item.id);
      setQueueItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      toast.error(err.message || "Failed to remove");
      if (isStaleUploadError(err)) refetchUploads();
    } finally {
      setBusyUploadId(null);
    }
  }

  // Real cancellation, confirmed asynchronously by the backend — don't optimistically remove the
  // row, just mark it "stopping" and let a poll (the scheduled quick follow-up, or the shared
  // interval/manual refresh) discover it's actually gone from the active list.
  async function handleCancelTranslationJob(job) {
    setStoppingJobIds((prev) => new Set(prev).add(job.id));
    try {
      await cancelDashboardTranslationJob(job.id);
      setTimeout(refetchTranslationJobs, 3000);
    } catch (err) {
      toast.error(err.message || "Failed to stop translation");
      setStoppingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveMode(m.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer
                ${activeMode === m.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {stats && (
          <span className="text-[11px] text-muted-foreground">
            {stats.documents?.toLocaleString?.() ?? stats.documents} placements ·{" "}
            {stats.files?.toLocaleString?.() ?? stats.files} documents · {stats.states} states ·{" "}
            {stats.crops} crops · {stats.translated} translated · {stats.reviewed} reviewed
          </span>
        )}
      </div>

      <div className={activeMode === "add-document" ? "" : "hidden"}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <div className="w-full min-w-0">
            <AddDocumentForm onUploadQueued={handleUploadQueued} />
          </div>
          <div className="w-full min-w-0 flex flex-col gap-2">
            <div className="flex items-center justify-end">
              <div className="flex items-center gap-2">
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={refetchAll}
                >
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>
            </div>
            <ResizableSplitPanel
              top={
                <UploadQueuePanel
                  items={visibleQueueItems}
                  onCancelQueued={handleCancelUpload}
                  onAdd={handleAddUpload}
                  onNew={handleNewUpload}
                  onApprove={handleApproveUpload}
                  onDecline={handleDeclineUpload}
                  onEdit={handleEditUpload}
                  onResubmit={handleResubmitUpload}
                  onDiscard={handleDiscardUpload}
                  onRemove={handleRemoveUpload}
                  onOpenDetail={openDetail}
                  busyId={busyUploadId}
                  processingIds={processingUploadIds}
                />
              }
              bottom={
                canTranslate ? (
                  <TranslationQueuePanel
                    jobs={translationJobs}
                    onCancel={handleCancelTranslationJob}
                    onOpenDetail={openDetail}
                    stoppingIds={stoppingJobIds}
                    finishedJobs={finishedJobs}
                    showFinished={showFinishedJobs}
                    onToggleFinished={setShowFinishedJobs}
                    onRemove={handleRemoveTranslationJob}
                    removingIds={removingJobIds}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground italic">
                    Translation Queue is only visible to admins.
                  </div>
                )
              }
            />
          </div>
        </div>
      </div>
      <div className={activeMode === "main-table" ? "" : "hidden"}>
        <MainTable onOpenDetail={openDetail} refreshKey={refreshKey} canEdit={canEdit} />
      </div>
      <div className={activeMode === "unique-documents" ? "" : "hidden"}>
        <UniqueDocumentsTable
          onOpenDetail={openDetail}
          translationAvailable={translationAvailable}
          canTranslate={canTranslate}
          refreshKey={refreshKey}
          onDataChanged={bumpRefresh}
          canEdit={canEdit}
        />
      </div>

      <DocumentDetailModal
        documentId={detailDocId}
        open={Boolean(detailDocId)}
        onOpenChange={(o) => {
          if (!o) {
            setDetailDocId(null);
            bumpRefresh();
          }
        }}
        translationAvailable={translationAvailable}
        canTranslate={canTranslate}
        onTranslationStarted={refetchTranslationJobs}
        onPlacementsChanged={bumpRefresh}
        canEdit={canEdit}
      />
    </div>
  );
}
