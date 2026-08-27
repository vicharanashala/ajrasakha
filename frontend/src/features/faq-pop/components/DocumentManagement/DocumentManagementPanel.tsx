// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import {
  getDashboardConfig,
  getDashboardUniqueDocument,
  getDashboardUploads,
  cancelDashboardUpload,
  addUploadToMatch,
  addUploadAsNew,
  cancelPendingDuplicateUpload,
  getDashboardTranslationJobs,
  cancelDashboardTranslationJob,
} from "../../api";
import MainTable from "./MainTable";
import UniqueDocumentsTable from "./UniqueDocumentsTable";
import AddDocumentForm from "./AddDocumentForm";
import UploadQueuePanel from "./UploadQueuePanel";
import TranslationQueuePanel from "./TranslationQueuePanel";
import ResizableSplitPanel from "./ResizableSplitPanel";

const MODES = [
  { id: "add-document", label: "Add Document" },
  { id: "main-table", label: "Main Table" },
  { id: "unique-documents", label: "Unique Documents" },
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

// Document Management dashboard (docs/dashboard_frontend_plan.md) — third mode alongside
// FAQ-Cluster/POP-Translation, wired in as a TABS entry in ../../DataProcessingDashboard.tsx.
//
// This component owns everything that must survive switching between its own 3 sub-modes
// (spec §1): the Upload Queue + Translation Queue poll (spec §8/§9 — both load on initial page
// load and share one interval, not gated behind opening "Add Document" mode) and the shared
// unique-document expand-fetch cache. All 3 sub-components stay mounted permanently — visibility
// toggles via a `hidden` className, not conditional unmount — so polling is never torn down by a
// sub-mode switch.
export default function DocumentManagementPanel() {
  const [activeMode, setActiveMode] = useState("main-table");
  const [focusUniqueDocId, setFocusUniqueDocId] = useState(null);

  const [translationAvailable, setTranslationAvailable] = useState(false);
  useEffect(() => {
    getDashboardConfig()
      .then((cfg) => setTranslationAvailable(Boolean(cfg?.translation_available)))
      .catch(() => setTranslationAvailable(false));
  }, []);

  const uniqueDocCacheRef = useRef({});
  function cacheUniqueDoc(id, data) {
    uniqueDocCacheRef.current[id] = { ...uniqueDocCacheRef.current[id], ...data };
  }
  async function fetchUniqueDocCached(id) {
    if (uniqueDocCacheRef.current[id]) return uniqueDocCacheRef.current[id];
    const data = await getDashboardUniqueDocument(id);
    cacheUniqueDoc(id, data);
    return data;
  }

  // Upload Queue (spec §4.3/§4.4) + Translation Queue (spec §8) — separate queues, both present
  // by default (empty state until something's happening), both refetched by the same shared
  // 30s-toggle-or-manual-refresh interval (spec §9) rather than each running its own poll.
  const [queueItems, setQueueItems] = useState([]);
  const [translationJobs, setTranslationJobs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [busyUploadId, setBusyUploadId] = useState(null);
  const [stoppingJobIds, setStoppingJobIds] = useState(() => new Set());
  // "New" (spec §4.4, round 6) is async — a real Zoho upload happens server-side, and the item
  // stays at status=awaiting_review the whole time (no interim status change). Track it locally
  // so the row can show "Processing…" until a poll finds the item either gone (succeeded) or
  // flipped to status=failed.
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

  async function refetchAll() {
    await Promise.all([refetchUploads(), refetchTranslationJobs()]);
    setLastUpdated(Date.now());
  }

  // Both queues load up front regardless of which sub-mode is active (spec §8).
  useEffect(() => {
    refetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared 30s interval while auto-refresh is on; off means manual-refresh-only (spec §9).
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refetchAll, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

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

  async function handleAddUpload(item) {
    setBusyUploadId(item.id);
    try {
      const res = await addUploadToMatch(item.id);
      toast.success(`Linked — ${res?.placements_created ?? 0} new placement(s) created`);
      setQueueItems((prev) => prev.filter((it) => it.id !== item.id));
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

  function handleJumpToUniqueDoc(id) {
    setFocusUniqueDocId(id);
    setActiveMode("unique-documents");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 border-b border-border pb-2">
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
                  onJumpToUniqueDoc={handleJumpToUniqueDoc}
                  busyId={busyUploadId}
                  processingIds={processingUploadIds}
                />
              }
              bottom={
                <TranslationQueuePanel
                  jobs={translationJobs}
                  onCancel={handleCancelTranslationJob}
                  onJumpToUniqueDoc={handleJumpToUniqueDoc}
                  stoppingIds={stoppingJobIds}
                />
              }
            />
          </div>
        </div>
      </div>
      <div className={activeMode === "main-table" ? "" : "hidden"}>
        <MainTable
          fetchUniqueDocCached={fetchUniqueDocCached}
          onJumpToUniqueDoc={handleJumpToUniqueDoc}
          translationAvailable={translationAvailable}
          onTranslationStarted={refetchTranslationJobs}
        />
      </div>
      <div className={activeMode === "unique-documents" ? "" : "hidden"}>
        <UniqueDocumentsTable
          fetchUniqueDocCached={fetchUniqueDocCached}
          cacheUniqueDoc={cacheUniqueDoc}
          focusId={focusUniqueDocId}
          clearFocus={() => setFocusUniqueDocId(null)}
          translationAvailable={translationAvailable}
          onTranslationStarted={refetchTranslationJobs}
        />
      </div>
    </div>
  );
}
