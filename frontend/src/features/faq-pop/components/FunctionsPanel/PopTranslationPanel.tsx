// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Square, FileText, Check, ChevronRight } from 'lucide-react';
import { MultiSelector, StateSelector } from './RunTile';
import { getPopStateTable, runPop, getPopJob, stopPopJob } from '../../api';
import PopStateTable from './PopStateTable';

const inputClass =
  'w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow';

const labelClass = 'text-xs font-medium text-foreground/70';

function parseStdoutProgress(stdout) {
  if (!stdout) return null;
  const lines = stdout.split('\n');
  let totalDocs = null;
  const docs = [];
  let currentIdx = -1;

  for (const line of lines) {
    const totalMatch = line.match(/\[POP\] Total docs: (\d+)/);
    if (totalMatch) { totalDocs = parseInt(totalMatch[1]); continue; }

    const processingMatch = line.match(/\[POP\] Processing: (.+)/);
    if (processingMatch) {
      if (currentIdx >= 0 && docs[currentIdx].status === 'running') docs[currentIdx].status = 'done';
      docs.push({ name: processingMatch[1].trim(), pagesTotal: null, pagesDone: 0, status: 'running' });
      currentIdx = docs.length - 1;
      continue;
    }

    const startedMatch = line.match(/Translation stage started \| pages=(\d+)/);
    if (startedMatch && currentIdx >= 0) {
      docs[currentIdx].pagesTotal = parseInt(startedMatch[1]);
      continue;
    }

    const progressMatch = line.match(/Translation progress \| completed (\d+)\/(\d+)/);
    if (progressMatch && currentIdx >= 0) {
      docs[currentIdx].pagesDone = parseInt(progressMatch[1]);
      docs[currentIdx].pagesTotal = parseInt(progressMatch[2]);
      continue;
    }

    if (line.trim() === 'DONE' && currentIdx >= 0) {
      docs[currentIdx].status = 'done';
      continue;
    }
  }

  const runningDoc = docs.find((d) => d.status === 'running');
  return {
    totalDocs,
    docsDone: docs.filter((d) => d.status === 'done').length,
    currentDoc: runningDoc?.name ?? null,
    currentPage: runningDoc?.pagesDone ?? null,
    currentTotalPages: runningDoc?.pagesTotal ?? null,
    docs,
  };
}

function getProgressData(jobData) {
  if (jobData?.progress) {
    const p = jobData.progress;
    return {
      totalDocs: p.total_docs ?? null,
      docsDone: p.docs_done ?? 0,
      currentDoc: p.current_doc ?? null,
      currentPage: p.current_page ?? null,
      currentTotalPages: p.current_total_pages ?? null,
      docs: (p.docs || []).map((d) => ({
        name: d.name,
        status: d.status,
        pagesTotal: d.pages_total ?? null,
        pagesDone: d.pages_done ?? 0,
      })),
    };
  }
  return parseStdoutProgress(jobData?.stdout);
}

function PopProgress({ jobData }) {
  const data = getProgressData(jobData);
  if (!data || (data.totalDocs === null && data.docs.length === 0)) return null;

  const pct = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0);

  return (
    <div className="flex flex-col gap-2">
      {data.currentDoc && (
        <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
            <span className="text-xs font-medium text-foreground flex-shrink-0">Processing</span>
            <span className="text-xs text-foreground/80 truncate min-w-0" title={data.currentDoc}>{data.currentDoc}</span>
          </div>
          {data.currentTotalPages !== null && (
            <>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Page {data.currentPage ?? 0} / {data.currentTotalPages}</span>
                <span>{pct(data.currentPage ?? 0, data.currentTotalPages)}%</span>
              </div>
              <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-400 animate-pulse transition-all duration-300"
                  style={{ width: `${pct(data.currentPage ?? 0, data.currentTotalPages)}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {data.docs.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-border/50 bg-muted/10 px-3 py-2">
          {data.totalDocs !== null && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
              <FileText size={11} />
              <span>Docs: {data.docsDone} / {data.totalDocs}</span>
            </div>
          )}
          {data.docs.map((doc, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                {doc.status === 'done'    && <Check size={11} className="text-green-500 flex-shrink-0" />}
                {doc.status === 'running' && <ChevronRight size={11} className="text-blue-400 flex-shrink-0" />}
                {doc.status === 'pending' && <span className="w-[11px] text-center text-[10px] text-muted-foreground/40 flex-shrink-0">—</span>}
                <span
                  className={`text-xs truncate flex-1 min-w-0 ${doc.status === 'done' ? 'text-muted-foreground' : doc.status === 'running' ? 'text-foreground' : 'text-muted-foreground/40'}`}
                  title={doc.name}
                >
                  {doc.name}
                </span>
                <span className="text-[10px] shrink-0 text-muted-foreground">
                  {doc.status === 'done'    && doc.pagesTotal !== null ? `${doc.pagesTotal}p` : ''}
                  {doc.status === 'running' && doc.pagesTotal !== null ? `${doc.pagesDone}/${doc.pagesTotal}p` : ''}
                  {doc.status === 'done'    && doc.pagesTotal === null ? 'Done' : ''}
                  {doc.status === 'pending' ? 'Pending' : ''}
                </span>
              </div>
              {doc.pagesTotal !== null && (
                <div className="h-0.5 w-full bg-muted/30 rounded-full overflow-hidden pl-[15px]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${doc.status === 'done' ? 'bg-green-500' : 'bg-blue-400 animate-pulse'}`}
                    style={{ width: `${pct(doc.pagesDone ?? 0, doc.pagesTotal)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const POP_TILE_KEY = 'tile:pop-translation';

export default function PopTranslationPanel({ onJobCreated }) {
  const [state, setState] = useState('');
  const [crop, setCrop] = useState('');
  const [docs, setDocs] = useState([]);
  const [concurrency, setConcurrency] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [jobId, setJobId] = useState(null);
  const [jobData, setJobData] = useState(null);
  const [jobLabel, setJobLabel] = useState('');
  const pollRef = useRef(null);

  const [tableRows, setTableRows] = useState([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError] = useState(null);

  const formRef = useRef(null);
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setStacked(!entry.isIntersecting),
      { threshold: 0 }
    );
    if (formRef.current) observer.observe(formRef.current);
    return () => observer.disconnect();
  }, []);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }
  useEffect(() => () => stopPolling(), []);

  function startPolling(jid) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await getPopJob(jid);
        setJobData(data);
        if (data.status === 'done' || data.status === 'failed' || data.status === 'stopped') {
          stopPolling();
          loadTable();
        }
      } catch { /* ignore */ }
    }, 3000);
  }

  useEffect(() => {
    const saved = localStorage.getItem(POP_TILE_KEY);
    if (!saved) return;
    try {
      const { jobId: savedJid, label: savedLabel } = JSON.parse(saved);
      if (!savedJid) return;
      setJobLabel(savedLabel || '');
      getPopJob(savedJid).then((data) => {
        setJobId(savedJid);
        setJobData(data);
        if (data.status === 'running') startPolling(savedJid);
        else { loadTable(); }
      }).catch(() => localStorage.removeItem(POP_TILE_KEY));
    } catch { localStorage.removeItem(POP_TILE_KEY); }
  }, []);

  async function loadTable() {
    setTableLoading(true);
    setTableError(null);
    try {
      const data = await getPopStateTable();
      setTableRows(data.rows || []);
    } catch (err) {
      setTableError(err.message || 'Failed to load');
    } finally {
      setTableLoading(false);
    }
  }

  useEffect(() => { loadTable(); }, []);

  useEffect(() => { setCrop(''); setDocs([]); }, [state]);
  useEffect(() => { setDocs([]); }, [crop]);

  const stateOptions = [...new Set(tableRows.map((r) => r.state).filter(Boolean))].sort();
  const cropOptions = [...new Set(
    tableRows.filter((r) => r.state === state).map((r) => r.crop).filter(Boolean)
  )].sort();
  const docOptions = tableRows
    .filter((r) => r.state === state && r.crop === crop && r.doc_name)
    .map((r) => r.doc_name);

  async function handleRun() {
    if (!state || !crop) return;
    const body = { state, crop, concurrency };
    if (docs.length > 0) body.docs = docs;
    const label = `${state} / ${crop}`;
    setSubmitting(true);
    try {
      const result = await runPop(body);
      const jid = result.job_id;
      setJobId(jid);
      setJobData({ job_id: jid, status: 'running', stdout: '', stderr: '' });
      setJobLabel(label);
      localStorage.setItem(POP_TILE_KEY, JSON.stringify({ jobId: jid, label }));
      toast.success(`POP job queued — ${jid.slice(0, 8)}`);
      if (onJobCreated) onJobCreated();
      startPolling(jid);
    } catch (err) {
      toast.error(err.message || 'Failed to start POP translation');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStop() {
    if (!jobId) return;
    try { await stopPopJob(jobId); } catch { /* ignore */ }
  }

  const isRunning = jobData?.status === 'running';
  const isSettled = jobData && !isRunning;
  const STATUS_COLORS = { done: 'text-green-400', failed: 'text-destructive', stopped: 'text-amber-400' };

  return (
    <div className="flex flex-col">
      <div ref={formRef} className="max-w-3xl mx-auto w-full">
      <div className="flex justify-center">
      <div className="w-full max-w-md bg-card rounded-lg border border-border shadow-sm p-5 flex flex-col gap-4">

      {isRunning && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-bold text-foreground">Running</span>
              {jobLabel && <span className="text-xs bg-accent/50 border border-border rounded px-1.5 py-0.5 text-foreground">{jobLabel}</span>}
            </div>
            <button
              className="flex items-center gap-1 px-2.5 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 text-xs transition-colors cursor-pointer"
              onClick={handleStop}
            >
              <Square size={11} /> Stop
            </button>
          </div>
          {jobData && <PopProgress jobData={jobData} />}
        </>
      )}

      {isSettled && (
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold capitalize ${STATUS_COLORS[jobData.status] || 'text-muted-foreground'}`}>
            Last run: {jobData.status}
          </span>
          {jobLabel && <span className="text-xs bg-accent/50 border border-border rounded px-1.5 py-0.5 text-muted-foreground">{jobLabel}</span>}
        </div>
      )}
        <div>
          <h2 className="text-base font-semibold text-foreground">POP Translation</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Translate agricultural POP PDFs to English using Gemini
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>State</label>
            <StateSelector
              value={state}
              onChange={setState}
              stateNames={stateOptions}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Crop</label>
            <select
              className={inputClass}
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
              disabled={!state || cropOptions.length === 0}
            >
              <option value="">
                {!state ? 'Select a state first' : cropOptions.length === 0 ? 'No crops found' : '— select crop —'}
              </option>
              {cropOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Documents <span className="font-normal text-muted-foreground">(leave empty to translate all)</span></label>
            <MultiSelector
              value={docs}
              onChange={setDocs}
              names={docOptions}
              placeholder={!crop ? 'Select a crop first' : docOptions.length === 0 ? 'No PDFs found' : 'Select documents…'}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Parallel pages (concurrency)</label>
            <input
              type="number"
              className={inputClass}
              min={1}
              max={10}
              value={concurrency}
              onChange={(e) => setConcurrency(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
            />
          </div>
        </div>

        <button
          className="mt-1 w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium
            hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleRun}
          disabled={!state || !crop || submitting || isRunning}
        >
          {submitting ? 'Submitting…' : isRunning ? 'Running…' : 'Run Translation'}
        </button>
      </div>
      </div>
      </div>
      <div className={`sticky top-0 z-10 bg-background pt-6 h-screen ${stacked ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        <div className="max-w-4xl mx-auto w-full">
          <PopStateTable rows={tableRows} loading={tableLoading} error={tableError} onRefresh={loadTable} />
        </div>
      </div>
    </div>
  );
}
