// @ts-nocheck
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Square } from 'lucide-react';
import { getNextState, getJob, stopJob } from '../../api';
import PipelineOutput, {
  parsePipelineOutput,
  parsePrePipelineOutput,
  parsePostPipelineOutput,
  PrePipelineOutput,
  PostPipelineOutput,
} from '../JobsPanel/PipelineOutput';

const inputClass =
  'w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow';

// ── MultiSelector ──────────────────────────────────────────────────────────────

export function MultiSelector({ value, onChange, names, placeholder }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [expanded, setExpanded] = useState(false);
  const [expandedRect, setExpandedRect] = useState(null);
  const [dropdownPos, setDropdownPos] = useState(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);

  const filtered = (names || []).filter(
    (c) => !value.includes(c) && c.toLowerCase().includes(search.trim().toLowerCase()),
  );

  useEffect(() => {
    if (listRef.current && highlightedIndex >= 0) {
      const item = listRef.current.children[highlightedIndex];
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  // click-outside closes the inline dropdown
  useEffect(() => {
    if (!open || expanded) return;
    function handler(e) {
      if (containerRef.current?.contains(e.target) || dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
      setHighlightedIndex(-1);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, expanded]);

  function computePos() {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 2, left: r.left, width: r.width });
    }
  }

  function closeAll() { setExpanded(false); setOpen(false); setHighlightedIndex(-1); }

  function addItem(item) { onChange([...value, item]); setSearch(''); setHighlightedIndex(-1); }
  function removeItem(item) { onChange(value.filter((c) => c !== item)); }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (highlightedIndex >= 0 && highlightedIndex < filtered.length) addItem(filtered[highlightedIndex]); }
    else if (e.key === 'Escape') { closeAll(); }
  }

  function handleExpand(e) {
    e.preventDefault();
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setExpandedRect({ left: rect.left, width: rect.width });
    }
    setExpanded(true);
  }

  const listItems = filtered.map((c, i) => (
    <button key={c} type="button"
      className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer ${i === highlightedIndex ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}`}
      onMouseDown={() => addItem(c)} onMouseEnter={() => setHighlightedIndex(i)}>
      {c}
    </button>
  ));

  return (
    <div className="flex flex-col gap-1">
      <div className="relative" ref={containerRef}>
        <input type="text" className={inputClass} placeholder={placeholder} value={search}
          onChange={(e) => { computePos(); setSearch(e.target.value); setOpen(true); setHighlightedIndex(-1); }}
          onFocus={() => { computePos(); setOpen(true); }}
          onBlur={() => { if (!expanded) setTimeout(() => { setOpen(false); setHighlightedIndex(-1); }, 150); }}
          onKeyDown={handleKeyDown} />
        {open && filtered.length > 0 && !expanded && dropdownPos && createPortal(
          <div ref={dropdownRef}
            style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
            className="bg-popover border border-border rounded-md shadow-lg"
            onWheel={(e) => e.stopPropagation()}>
            <div className="flex justify-end px-1 py-0.5 border-b border-border/40">
              <button type="button" title="Expand"
                className="text-muted-foreground hover:text-foreground px-2.5 py-1 rounded hover:bg-accent cursor-pointer text-sm leading-none"
                onMouseDown={handleExpand}>↕</button>
            </div>
            <div ref={listRef} className="max-h-44 overflow-y-auto overscroll-contain">{listItems}</div>
          </div>,
          document.body,
        )}
      </div>
      {expanded && open && filtered.length > 0 && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={closeAll} />
          <div style={{ position: 'fixed', top: 0, bottom: 0, left: expandedRect?.left ?? 0, width: expandedRect?.width ?? 300, zIndex: 9999 }}
            className="bg-popover border border-border rounded-md shadow-xl flex flex-col"
            onWheel={(e) => e.stopPropagation()}>
            <div className="flex justify-end px-1 py-0.5 border-b border-border/40 shrink-0">
              <button type="button" title="Collapse"
                className="text-muted-foreground hover:text-foreground px-2.5 py-1 rounded hover:bg-accent cursor-pointer text-xl font-bold leading-none"
                onClick={closeAll}>×</button>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">{listItems}</div>
          </div>
        </>,
        document.body,
      )}
      {value.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          {value.map((c) => (
            <div key={c} className="flex items-center justify-between bg-accent/40 border border-border rounded px-2 py-0.5 text-xs text-foreground">
              <span>{c}</span>
              <button type="button" className="ml-2 text-muted-foreground hover:text-destructive leading-none cursor-pointer" onClick={() => removeItem(c)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── StateSelector ─────────────────────────────────────────────────────────────

export function StateSelector({ value, onChange, stateNames, placeholder = 'Search state…' }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [expanded, setExpanded] = useState(false);
  const [expandedRect, setExpandedRect] = useState(null);
  const [dropdownPos, setDropdownPos] = useState(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);

  const displayText = value || search;
  const filtered = (stateNames || []).filter(
    (s) => s.toLowerCase().includes((value ? '' : search).toLowerCase()),
  );

  useEffect(() => {
    if (listRef.current && highlightedIndex >= 0) {
      const item = listRef.current.children[highlightedIndex];
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  // click-outside closes the inline dropdown
  useEffect(() => {
    if (!open || expanded) return;
    function handler(e) {
      if (containerRef.current?.contains(e.target) || dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
      setHighlightedIndex(-1);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, expanded]);

  function computePos() {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 2, left: r.left, width: r.width });
    }
  }

  function closeAll() { setExpanded(false); setOpen(false); setHighlightedIndex(-1); }

  function selectState(state) { onChange(state); setSearch(''); closeAll(); }
  function handleInput(e) { onChange(''); computePos(); setSearch(e.target.value); setOpen(true); setHighlightedIndex(-1); }
  function handleClear(e) { e.preventDefault(); onChange(''); setSearch(''); setHighlightedIndex(-1); }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (highlightedIndex >= 0 && highlightedIndex < filtered.length) selectState(filtered[highlightedIndex]); }
    else if (e.key === 'Escape') { closeAll(); }
  }

  function handleExpand(e) {
    e.preventDefault();
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setExpandedRect({ left: rect.left, width: rect.width });
    }
    setExpanded(true);
  }

  const listItems = filtered.map((s, i) => (
    <button key={s} type="button"
      className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer ${i === highlightedIndex ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}`}
      onMouseDown={() => selectState(s)} onMouseEnter={() => setHighlightedIndex(i)}>
      {s}
    </button>
  ));

  return (
    <div className="flex flex-col gap-1">
      <div className="relative" ref={containerRef}>
        <input type="text" className={inputClass} placeholder={placeholder} value={displayText}
          onChange={handleInput} onFocus={() => { computePos(); setOpen(true); }}
          onBlur={() => { if (!expanded) setTimeout(() => { setOpen(false); setHighlightedIndex(-1); }, 150); }}
          onKeyDown={handleKeyDown} />
        {value && (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive leading-none cursor-pointer" onMouseDown={handleClear}>×</button>
        )}
        {open && filtered.length > 0 && !expanded && dropdownPos && createPortal(
          <div ref={dropdownRef}
            style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
            className="bg-popover border border-border rounded-md shadow-lg"
            onWheel={(e) => e.stopPropagation()}>
            <div className="flex justify-end px-1 py-0.5 border-b border-border/40">
              <button type="button" title="Expand"
                className="text-muted-foreground hover:text-foreground px-2.5 py-1 rounded hover:bg-accent cursor-pointer text-sm leading-none"
                onMouseDown={handleExpand}>↕</button>
            </div>
            <div ref={listRef} className="max-h-44 overflow-y-auto overscroll-contain">{listItems}</div>
          </div>,
          document.body,
        )}
      </div>
      {expanded && open && filtered.length > 0 && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={closeAll} />
          <div style={{ position: 'fixed', top: 0, bottom: 0, left: expandedRect?.left ?? 0, width: expandedRect?.width ?? 300, zIndex: 9999 }}
            className="bg-popover border border-border rounded-md shadow-xl flex flex-col"
            onWheel={(e) => e.stopPropagation()}>
            <div className="flex justify-end px-1 py-0.5 border-b border-border/40 shrink-0">
              <button type="button" title="Collapse"
                className="text-muted-foreground hover:text-foreground px-2.5 py-1 rounded hover:bg-accent cursor-pointer text-xl font-bold leading-none"
                onClick={closeAll}>×</button>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">{listItems}</div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// ── Phase detection ───────────────────────────────────────────────────────────

function detectPhase(stdout) {
  if (!stdout) return 'pre';
  if (stdout.includes('LLM Deduplication') || stdout.includes('Collect Final FAQ')) return 'post';
  if (stdout.match(/\[INFO\] (?:Filtered to|Found) \d+ unique crop/)) return 'pipeline';
  return 'pre';
}

const MEGA_STAGES = ['Pre-Pipeline', 'Pipeline', 'Post-Pipeline'];
const PHASE_TO_IDX = { pre: 0, pipeline: 1, post: 2 };

function MegaStageBar({ phase, jobStatus }) {
  const activeIdx = PHASE_TO_IDX[phase] ?? 0;
  return (
    <div className="flex items-center gap-0 w-full">
      {MEGA_STAGES.map((label, i) => {
        const isDone = jobStatus === 'done' ? true : i < activeIdx;
        const isActive = jobStatus !== 'done' && i === activeIdx;
        const dotCls = isDone
          ? 'bg-green-500 border-green-500'
          : isActive
          ? 'bg-blue-400 border-blue-400 animate-pulse'
          : 'bg-transparent border-muted-foreground/25';
        const labelCls = isDone ? 'text-green-400' : isActive ? 'text-blue-400' : 'text-muted-foreground/35';
        const lineLeft = isDone || isActive;
        const lineRight = isDone;
        return (
          <div key={label} className="flex flex-col items-center flex-1 min-w-0">
            <div className="flex items-center w-full">
              <div className={`h-px flex-1 transition-colors ${i === 0 ? 'invisible' : lineLeft ? 'bg-green-500/50' : 'bg-border/40'}`} />
              <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 transition-colors ${dotCls}`} />
              <div className={`h-px flex-1 transition-colors ${i === MEGA_STAGES.length - 1 ? 'invisible' : lineRight ? 'bg-green-500/50' : 'bg-border/40'}`} />
            </div>
            <span className={`text-[10px] mt-1 text-center leading-none font-medium ${labelCls}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function buildInitialValues(fields) {
  const vals = {};
  for (const f of fields) {
    if (f.type === 'crops-selector' || f.type === 'domains-selector') vals[f.key] = [];
    else if (f.type === 'states-selector') vals[f.key] = '';
    else if (f.type === 'checkbox') vals[f.key] = f.defaultValue !== undefined ? f.defaultValue : false;
    else vals[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
  }
  return vals;
}

// ── RunTile ───────────────────────────────────────────────────────────────────

export default function RunTile({ title, description, fields, onRun, cropNames, domainNames, stateNames, stateDistrictMap, onJobDone, tileKey }) {
  const [values, setValues] = useState(() => buildInitialValues(fields));
  const [submitting, setSubmitting] = useState(false);

  const [jobId, setJobId] = useState(null);
  const [jobData, setJobData] = useState(null);
  const [stateName, setStateName] = useState(null);
  const [lastRunDomains, setLastRunDomains] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const pollRef = useRef(null);

  function setValue(key, val) { setValues((prev) => ({ ...prev, [key]: val })); }

  const prevStateRef = useRef(values['state']);
  useEffect(() => {
    if (prevStateRef.current !== values['state']) {
      prevStateRef.current = values['state'];
      setValue('district', '');
    }
  }, [values['state']]);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  function persistJob(jid, sName, domains) {
    if (!tileKey) return;
    localStorage.setItem(`tile:${tileKey}`, JSON.stringify({ jobId: jid, stateName: sName, lastRunDomains: domains }));
  }

  function startPolling(jid) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await getJob(jid);
        setJobData(data);
        if (data.status === 'done' || data.status === 'failed' || data.status === 'stopped') {
          stopPolling();
          onJobDone?.();
        }
      } catch {
        // ignore transient errors
      }
    }, 3000);
  }

  useEffect(() => {
    if (!tileKey) return;
    const saved = localStorage.getItem(`tile:${tileKey}`);
    if (!saved) return;
    try {
      const { jobId: savedJid, stateName: savedName, lastRunDomains: savedDomains } = JSON.parse(saved);
      if (!savedJid) return;
      setStateName(savedName || '');
      setLastRunDomains(savedDomains || []);
      getJob(savedJid).then((data) => {
        setJobId(savedJid);
        setJobData(data);
        if (data.status === 'running') {
          startPolling(savedJid);
        } else {
          onJobDone?.();
        }
      }).catch(() => {
        if (tileKey) localStorage.removeItem(`tile:${tileKey}`);
      });
    } catch {
      if (tileKey) localStorage.removeItem(`tile:${tileKey}`);
    }
  }, []);

  async function handleRun() {
    const body = {};
    for (const f of fields) {
      const raw = values[f.key];
      if (f.type === 'checkbox') body[f.key] = Boolean(raw);
      else if (f.type === 'crops-selector' || f.type === 'domains-selector') { if (raw.length > 0) body[f.key] = raw; }
      else if (f.type === 'states-selector') { if (raw) body[f.key] = raw; }
      else { if (raw !== '' && raw !== undefined && raw !== null) body[f.key] = raw; }
    }

    setSubmitting(true);
    try {
      const stateValue = values['state'] || '';
      const districtValue = values['district'] || '';
      const domains = values['domains'] || [];
      const nextState = await getNextState(stateValue, domains, districtValue);
      const innerFolder = nextState.name;
      const stateSlug = nextState.state;
      body.pre_output = `${stateSlug}/${innerFolder}/${innerFolder}.csv`;

      setStateName(innerFolder);
      setLastRunDomains(domains);
      const result = await onRun(body);
      const jid = result.job_id;
      setJobId(jid);
      setJobData({ job_id: jid, status: 'running', stdout: '', stderr: '' });
      toast.success(`Job queued → ${jid}`);
      persistJob(jid, innerFolder, domains);
      startPolling(jid);
    } catch (err) {
      toast.error(err.message || 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStop() {
    if (!jobId) return;
    try { await stopJob(jobId); } catch { /* ignore */ }
  }

  const isRunning = jobData?.status === 'running';
  const isSettled = jobData && !isRunning;

  if (isRunning) {
    const phase = detectPhase(jobData.stdout);
    const hasPre = parsePrePipelineOutput(jobData.stdout) !== null;
    const hasPipeline = parsePipelineOutput(jobData.stdout) !== null;
    const hasPost = parsePostPipelineOutput(jobData.stdout) !== null;

    return (
      <div className="bg-card text-card-foreground rounded-lg border border-border shadow-sm p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
            <span className="text-sm font-bold text-foreground">Running</span>
            {stateName && (
              <span className="text-xs font-mono bg-accent/50 border border-border rounded px-1.5 py-0.5 text-foreground">{stateName}</span>
            )}
          </div>
          <button
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 text-xs transition-colors cursor-pointer"
            onClick={handleStop}
          >
            <Square size={11} /> Stop
          </button>
        </div>

        {lastRunDomains.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {lastRunDomains.map((d) => (
              <span key={d} className="text-[10px] bg-accent/40 border border-border rounded px-1.5 py-0.5 text-muted-foreground">{d}</span>
            ))}
          </div>
        )}

        <div className="bg-background/35 border border-border/50 rounded-md px-3 py-2.5">
          <MegaStageBar phase={phase} jobStatus="running" />
        </div>

        {hasPre && <PrePipelineOutput stdout={jobData.stdout} />}
        {hasPipeline && <PipelineOutput stdout={jobData.stdout} />}
        {hasPost && <PostPipelineOutput stdout={jobData.stdout} />}
      </div>
    );
  }

  const STATUS_COLORS = {
    done: 'text-green-400', failed: 'text-destructive', stopped: 'text-amber-400',
  };

  return (
    <div className="bg-card text-card-foreground rounded-lg border border-border shadow-sm p-4 flex flex-col gap-3">
      <div>
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      <div className="flex flex-col gap-2">
        {fields.map((f) => {
          if (f.type === 'checkbox') return (
            <div key={f.key} className="flex items-center gap-2">
              <input id={`tile-${f.key}`} type="checkbox" className="w-4 h-4 rounded accent-primary cursor-pointer"
                checked={Boolean(values[f.key])} onChange={(e) => setValue(f.key, e.target.checked)} />
              <label htmlFor={`tile-${f.key}`} className="text-xs font-medium text-muted-foreground cursor-pointer select-none">{f.label}</label>
            </div>
          );
          if (f.type === 'select') return (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
              <select className={inputClass} value={values[f.key]} onChange={(e) => setValue(f.key, e.target.value)}>
                {(f.options || []).map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          );
          if (f.type === 'crops-selector') return (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
              <MultiSelector value={values[f.key]} onChange={(v) => setValue(f.key, v)} names={cropNames} placeholder="Search crops…" />
              {f.hint && <p className="text-xs text-muted-foreground/70 italic">{f.hint}</p>}
            </div>
          );
          if (f.type === 'domains-selector') return (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
              <MultiSelector value={values[f.key]} onChange={(v) => setValue(f.key, v)} names={domainNames} placeholder="Search domains…" />
              {f.hint && <p className="text-xs text-muted-foreground/70 italic">{f.hint}</p>}
            </div>
          );
          if (f.type === 'states-selector') return (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
              <StateSelector value={values[f.key]} onChange={(v) => setValue(f.key, v)} stateNames={stateNames} />
            </div>
          );
          if (f.type === 'district-selector') {
            const districtNames = (stateDistrictMap && values['state'])
              ? (stateDistrictMap[values['state']] || [])
              : [];
            return (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <StateSelector
                  value={values[f.key]}
                  onChange={(v) => setValue(f.key, v)}
                  stateNames={districtNames}
                  placeholder="Search district…"
                />
                {f.hint && <p className="text-xs text-muted-foreground/70 italic">{f.hint}</p>}
              </div>
            );
          }
          return (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
              <input type={f.type} className={inputClass} value={values[f.key]} onChange={(e) => setValue(f.key, e.target.value)} />
              {f.hint && <p className="text-xs text-muted-foreground/70 italic">{f.hint}</p>}
            </div>
          );
        })}
      </div>

      <button
        className="w-full mt-auto bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] rounded-md py-2 text-sm font-medium transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        onClick={handleRun}
        disabled={submitting}
      >
        {submitting ? 'Starting…' : 'Run'}
      </button>

      {isSettled && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold capitalize ${STATUS_COLORS[jobData.status] || 'text-muted-foreground'}`}>
                Last run: {jobData.status}
              </span>
              {stateName && (
                <span className="text-xs font-mono bg-accent/50 border border-border rounded px-1.5 py-0.5 text-muted-foreground">{stateName}</span>
              )}
            </div>
            <button className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer" onClick={() => setShowLog((v) => !v)}>
              {showLog ? 'hide log' : 'view log'}
            </button>
          </div>
          {showLog && (
            <div className="flex flex-col gap-2">
              {jobData.status === 'done' && (
                <>
                  {parsePrePipelineOutput(jobData.stdout) && <PrePipelineOutput stdout={jobData.stdout} />}
                  {parsePipelineOutput(jobData.stdout) && <PipelineOutput stdout={jobData.stdout} />}
                  {parsePostPipelineOutput(jobData.stdout) && <PostPipelineOutput stdout={jobData.stdout} />}
                  {!parsePrePipelineOutput(jobData.stdout) && !parsePipelineOutput(jobData.stdout) && !parsePostPipelineOutput(jobData.stdout) && (
                    <pre className="font-mono text-xs bg-slate-900 text-slate-400 p-2 max-h-60 overflow-y-auto rounded whitespace-pre-wrap">{jobData.stdout || '(empty)'}</pre>
                  )}
                </>
              )}
              {(jobData.status === 'failed' || jobData.status === 'stopped') && (
                <pre className="font-mono text-xs bg-red-950 text-red-300 p-2 max-h-60 overflow-y-auto rounded whitespace-pre-wrap">{jobData.stderr || jobData.stdout || '(empty)'}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
