// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import {
  getDashboardConfig,
  getStats,
  getDashboardUploads,
  cancelDashboardUpload,
  addUploadToMatch,
  addUploadAsNew,
  cancelPendingDuplicateUpload,
  getDashboardTranslationJobs,
  cancelDashboardTranslationJob,
  deleteDashboardTranslationJob,
} from "../../api";
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

function TimeAgo({ ts }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!ts) return null;
  return <span>{Math.max(0, Math.round((Date.now() - ts) / 1000))}s ago</span>;
}

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
export default function DocumentManagementPanel() {
  const [activeMode, setActiveMode] = useState("main-table");

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
  // until something's happening), both refetched by the same shared 30s-toggle-or-manual-refresh
  // interval rather than each running its own poll.
  const [queueItems, setQueueItems] = useState([]);
  const [translationJobs, setTranslationJobs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [busyUploadId, setBusyUploadId] = useState(null);
  const [stoppingJobIds, setStoppingJobIds] = useState(() => new Set());
  // "New" is async — a real Zoho upload happens server-side, and the item stays at
  // status=awaiting_review the whole time (no interim status change). Track it locally so the row
  // can show "Processing…" until a poll finds the item either gone (succeeded) or flipped to
  // status=failed.
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

  // Fast follow-up polling only while a "New" action is actually in flight — the shared 30s
  // interval alone would leave the row stuck on "Processing…" for up to half a minute.
  useEffect(() => {
    if (processingUploadIds.size === 0) return;
    const id = setInterval(refetchUploads, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processingUploadIds.size]);

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
    setLastUpdated(Date.now());
  }

  // Both queues load up front regardless of which sub-mode is active.
  useEffect(() => {
    refetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared 30s interval while auto-refresh is on; off means manual-refresh-only. Recreated on
  // showFinishedJobs too, so toggling it doesn't leave the interval's refetchAll closure stale
  // (it decides whether to include the finished-jobs fetch).
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refetchAll, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, showFinishedJobs]);

  function handleUploadQueued() {
    refetchUploads();
  }

  async function handleCancelUpload(item) {
    setBusyUploadId(item.id);
    try {
      await cancelDashboardUpload(item.id);
      setQueueItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      toast.error(err.message || "Failed to cancel");
    } finally {
      setBusyUploadId(null);
    }
  }

  async function handleAddUpload(item, documentId) {
    setBusyUploadId(item.id);
    try {
      const res = await addUploadToMatch(item.id, documentId);
      toast.success(`Linked — ${res?.placements_created ?? 0} new placement(s) created`);
      setQueueItems((prev) => prev.filter((it) => it.id !== item.id));
      bumpRefresh();
    } catch (err) {
      toast.error(err.message || "Failed to add");
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
      await addUploadAsNew(item.id);
      setProcessingUploadIds((prev) => new Set(prev).add(item.id));
    } catch (err) {
      toast.error(err.message || "Failed to process as a new document");
    } finally {
      setBusyUploadId(null);
    }
  }

  async function handleCancelDuplicateUpload(item) {
    setBusyUploadId(item.id);
    try {
      await cancelPendingDuplicateUpload(item.id);
      setQueueItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      toast.error(err.message || "Failed to cancel");
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
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="accent-primary"
                />
                Auto-refresh (30s)
              </label>
              <div className="flex items-center gap-2">
                {!autoRefresh && <span className="text-[10px] text-muted-foreground">Updated <TimeAgo ts={lastUpdated} /></span>}
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
                  items={queueItems}
                  onCancelQueued={handleCancelUpload}
                  onAdd={handleAddUpload}
                  onNew={handleNewUpload}
                  onCancelDuplicate={handleCancelDuplicateUpload}
                  onOpenDetail={openDetail}
                  busyId={busyUploadId}
                  processingIds={processingUploadIds}
                />
              }
              bottom={
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
              }
            />
          </div>
        </div>
      </div>
      <div className={activeMode === "main-table" ? "" : "hidden"}>
        <MainTable onOpenDetail={openDetail} refreshKey={refreshKey} />
      </div>
      <div className={activeMode === "unique-documents" ? "" : "hidden"}>
        <UniqueDocumentsTable
          onOpenDetail={openDetail}
          translationAvailable={translationAvailable}
          refreshKey={refreshKey}
          onDataChanged={bumpRefresh}
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
        onTranslationStarted={refetchTranslationJobs}
        onPlacementsChanged={bumpRefresh}
      />
    </div>
  );
}
