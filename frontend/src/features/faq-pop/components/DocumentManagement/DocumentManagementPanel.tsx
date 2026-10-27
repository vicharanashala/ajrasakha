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
  translateUniqueDocument,
  getDashboardUploadsHistory,
  getPendingUploads,
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
  // Doc-id -> most recent failed/cancelled job, kept up to date regardless of whether the Failed/
  // Cancelled tab in the Translation Queue panel is open (unlike finishedJobs, which is lazy and
  // only reflects whichever single tab was last toggled on). Seeds TranslateReviewCell's own mode
  // dropdown so it doesn't silently diverge from the queue's "Translate again" dropdown — see
  // TranslateReviewCell.tsx's lastTerminalJob prop.
  const [terminalJobsByDocId, setTerminalJobsByDocId] = useState({});
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

  function jobDocId(job) {
    return job.document_id || job.unique_document_id;
  }

  async function refetchTerminalJobs() {
    try {
      const [failed, cancelled] = await Promise.all([
        getDashboardTranslationJobs("failed"),
        getDashboardTranslationJobs("cancelled"),
      ]);
      const map = {};
      for (const job of [...(failed || []), ...(cancelled || [])]) {
        map[jobDocId(job)] = job;
      }
      setTerminalJobsByDocId(map);
    } catch {
      // ignore transient errors, next poll/manual refresh will retry
    }
  }

  // Finished jobs — hidden by default, one status at a time behind a Succeeded/Failed/Cancelled
  // segmented control (null = none selected, nothing fetched). The API only takes one `status` at
  // a time, so switching tabs re-fetches rather than filtering a merged list.
  const [finishedFilter, setFinishedFilterState] = useState(null); // null | "done" | "failed" | "cancelled"
  const [finishedJobs, setFinishedJobs] = useState([]);
  // Mirrors finishedFilter for the mount-only SSE effect below, whose "translation" handler would
  // otherwise close over the value from mount time forever.
  const finishedFilterRef = useRef(finishedFilter);
  finishedFilterRef.current = finishedFilter;
  const [removingJobIds, setRemovingJobIds] = useState(() => new Set());
  const [redoingJobIds, setRedoingJobIds] = useState(() => new Set());
  async function refetchFinishedJobs() {
    if (!finishedFilterRef.current) return;
    try {
      const jobs = (await getDashboardTranslationJobs(finishedFilterRef.current)) || [];
      setFinishedJobs(jobs);
    } catch {
      // ignore transient errors, next toggle/manual refresh will retry
    }
  }
  function setFinishedFilter(status) {
    // Clicking the active tab again toggles it off (the "toggle" half of the segmented control).
    setFinishedFilterState((prev) => (prev === status ? null : status));
  }
  useEffect(() => {
    if (finishedFilter) refetchFinishedJobs();
    else setFinishedJobs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedFilter]);

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

  // Retry a failed job — same job id, backend only re-translates the pages whose link is "".
  // Success means the job goes back to queued/running, which arrives over SSE like any other
  // translation update (handled below), so no local state update is needed here beyond busy
  // tracking and surfacing a 409 ("already in progress") if it somehow races another trigger.
  async function handleRedoTranslationJob(job, mode) {
    const docId = job.document_id || job.unique_document_id;
    setRedoingJobIds((prev) => new Set(prev).add(job.id));
    try {
      await translateUniqueDocument(docId, currentUserName, mode || job.mode);
      toast.success("Translation queued");
    } catch (err) {
      toast.error(err.message || "Failed to retry translation");
    } finally {
      setRedoingJobIds((prev) => {
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
      refetchTerminalJobs(),
      ...(finishedFilter ? [refetchFinishedJobs()] : []),
    ]);
  }

  // Both queues load up front regardless of which sub-mode is active.
  useEffect(() => {
    refetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback only — GET /dashboard/events (below) is the primary way these queues stay live. Runs
  // unconditionally every 60s (no user-facing toggle — SSE is the real mechanism now). Recreated
  // on finishedFilter too, so it doesn't leave the interval's refetchAll closure stale (it
  // decides whether to include the finished-jobs fetch).
  useEffect(() => {
    const id = setInterval(refetchAll, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedFilter]);

  // refetchAll's own closure goes stale if captured once by the mount-only SSE effect below (it
  // reads finishedFilter) — mirror it in a ref so the "open" handler always calls the current
  // version instead.
  const refetchAllRef = useRef(refetchAll);
  refetchAllRef.current = refetchAll;
  const refetchUploadsRef = useRef(refetchUploads);
  refetchUploadsRef.current = refetchUploads;
  const uploadRefetchTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(uploadRefetchTimerRef.current), []);

  // Upload Queue has three views, toggled inside UploadQueuePanel itself rather than separate
  // modals: the live queue (default), History (read-only finished uploads, GET
  // /dashboard/uploads/history), and Pending (this caller's own not-yet-forwarded uploads, GET
  // /pop-uploads — see backend/src/modules/popUploads). Pending behaves exactly like History:
  // fetched on demand when opened, not polled or pushed — the live queue is the only one with a
  // push/SSE update path (see the dashboardEvents subscription below). viewRef mirrors view for
  // the mount-only SSE effect below, same reason refetchUploadsRef exists.
  const [view, setView] = useState("queue"); // "queue" | "pending" | "history"
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingItems, setPendingItems] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const viewRef = useRef("queue");
  viewRef.current = view;
  const historyRefetchTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(historyRefetchTimerRef.current), []);

  async function refetchHistory() {
    try {
      const items = (await getDashboardUploadsHistory()) || [];
      setHistoryItems(items);
    } catch {
      // ignore transient errors, next toggle/manual refresh will retry
    }
  }

  async function refetchPending() {
    try {
      const items = (await getPendingUploads()) || [];
      setPendingItems(items);
    } catch {
      // ignore transient errors, next toggle/manual refresh will retry
    }
  }

  useEffect(() => {
    if (view === "history") {
      setHistoryLoading(true);
      refetchHistory().finally(() => setHistoryLoading(false));
    } else if (view === "pending") {
      setPendingLoading(true);
      refetchPending().finally(() => setPendingLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

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
        // An item leaving the queue (deleted:true) is exactly when it lands in history — refetch
        // the history view too, same debounce, but only while it's actually showing.
        if (viewRef.current === "history") {
          clearTimeout(historyRefetchTimerRef.current);
          historyRefetchTimerRef.current = setTimeout(refetchHistory, 300);
        }
      },
      translation: (job) => {
        // translationJobs mirrors GET /dashboard/translation-jobs' default (queued+running only)
        // — a job that just finished belongs in finishedJobs (if that tab is open), not here. A
        // job can also go the other way (retried from "failed" back to queued/running), in which
        // case it needs to drop out of whichever finished tab was showing it.
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
        }
        setFinishedJobs((prev) => {
          const filtered = prev.filter((j) => j.id !== job.id);
          const belongsHere = !job.deleted && finished && job.status === finishedFilterRef.current;
          return belongsHere ? [...filtered, job] : filtered;
        });
        setTerminalJobsByDocId((prev) => {
          const docId = jobDocId(job);
          const isTerminal = !job.deleted && (job.status === "failed" || job.status === "cancelled");
          if (isTerminal) return { ...prev, [docId]: job };
          if (prev[docId]?.id === job.id) {
            const next = { ...prev };
            delete next[docId];
            return next;
          }
          return prev;
        });
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
                  view={view}
                  onSetView={setView}
                  historyItems={historyItems}
                  historyLoading={historyLoading}
                  pendingItems={pendingItems}
                  pendingLoading={pendingLoading}
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
                    finishedFilter={finishedFilter}
                    onSetFinishedFilter={setFinishedFilter}
                    onRemove={handleRemoveTranslationJob}
                    removingIds={removingJobIds}
                    onRedo={handleRedoTranslationJob}
                    redoingIds={redoingJobIds}
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
          terminalJobsByDocId={terminalJobsByDocId}
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
        currentUserName={currentUserName}
        translationJobs={translationJobs}
        terminalJobsByDocId={terminalJobsByDocId}
      />
    </div>
  );
}
