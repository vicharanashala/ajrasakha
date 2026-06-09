// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Download, Upload, FolderPlus, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { uploadPopDoc, createPopState, createPopCrop, popDownloadUrl, popOutputDownloadUrl, deletePopDoc, deleteEmptyPopCrop, deleteEmptyPopState, deletePopFile, uploadPopAuditedFile } from '../../api';
import ColumnFilter from './ColumnFilter';

const inputClass =
  'bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow';

function AutocompleteInput({ value, onChange, suggestions, placeholder, className }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  const filtered = suggestions.filter(
    s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()
  );

  function updatePos() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left, width: r.width });
    }
  }

  useEffect(() => {
    function onClickOutside(e) {
      if (
        inputRef.current && !inputRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={e => { onChange(e.target.value); updatePos(); setOpen(true); }}
        onFocus={() => { updatePos(); setOpen(true); }}
      />
      {open && filtered.length > 0 && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: Math.max(pos.width, 112), zIndex: 9999 }}
          className="max-h-40 overflow-y-auto overscroll-contain rounded-md border border-border bg-card shadow-lg"
        >
          {filtered.map(opt => (
            <button
              key={opt}
              onMouseDown={e => { e.preventDefault(); onChange(opt); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/30 text-foreground cursor-pointer"
            >
              {opt}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function formatFinishedAt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function PopAuditCell({ row, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadPopAuditedFile(file, row.state, row.crop, row.doc_name);
      onUploaded?.();
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDelete() {
    if (!row.audit_file) return;
    if (!window.confirm('Delete audited file?')) return;
    setDeleting(true);
    try {
      await deletePopFile(row.audit_file);
      onUploaded?.();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {row.audit_file && (
        <a
          href={popDownloadUrl(row.audit_file)}
          className="flex items-center gap-1 text-[10px] text-green-400 hover:text-green-300 transition-colors"
          download
        >
          <Download size={11} /> {row.audit_file.split('/').pop()}
        </a>
      )}
      <input ref={inputRef} type="file" className="hidden" onChange={handleFile} disabled={uploading} />
      <button
        className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer
          ${uploading
            ? 'border-border/40 text-muted-foreground/30 cursor-not-allowed'
            : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
          }`}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        <Upload size={11} />
        {uploading ? 'uploading…' : row.audit_file ? 'replace' : 'upload'}
      </button>
      {row.audit_file && (
        <button
          className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer
            ${deleting
              ? 'border-border/40 text-muted-foreground/30 cursor-not-allowed'
              : 'border-destructive/40 text-destructive/70 hover:border-destructive hover:text-destructive hover:bg-destructive/5'
            }`}
          onClick={handleDelete}
          disabled={deleting}
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

function UploadControls({ onDone, stateOptions, stateCropMap }) {
  const fileRef = useRef(null);
  const [uploadState, setUploadState] = useState('');
  const [uploadCrop, setUploadCrop] = useState('');
  const [uploading, setUploading] = useState(false);

  const [addStateInput, setAddStateInput] = useState('');
  const [creatingState, setCreatingState] = useState(false);

  const [folderState, setFolderState] = useState('');
  const [folderCrop, setFolderCrop] = useState('');
  const [creatingCrop, setCreatingCrop] = useState(false);

  const cropSuggestionsFor = (s) => {
    const key = stateOptions.find(o => o.toLowerCase() === s.toLowerCase());
    return key && stateCropMap[key] ? [...stateCropMap[key]].sort() : [];
  };

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!uploadState.trim() || !uploadCrop.trim()) {
      alert('Please enter both state and crop before uploading.');
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      await uploadPopDoc(file, uploadState.trim(), uploadCrop.trim());
      onDone?.();
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleAddState() {
    if (!addStateInput.trim()) { alert('Please enter a state name.'); return; }
    setCreatingState(true);
    try {
      await createPopState(addStateInput.trim());
      onDone?.();
      setAddStateInput('');
    } catch (err) {
      alert(`Create state failed: ${err.message}`);
    } finally {
      setCreatingState(false);
    }
  }

  async function handleAddCrop() {
    if (!folderState.trim() || !folderCrop.trim()) {
      alert('Please enter both state and crop.');
      return;
    }
    setCreatingCrop(true);
    try {
      await createPopCrop(folderState.trim(), folderCrop.trim());
      onDone?.();
      setFolderState('');
      setFolderCrop('');
    } catch (err) {
      alert(`Create crop failed: ${err.message}`);
    } finally {
      setCreatingCrop(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Upload PDF to</label>
          <div className="flex items-center gap-1">
            <AutocompleteInput
              value={uploadState}
              onChange={v => { setUploadState(v); setUploadCrop(''); }}
              suggestions={stateOptions}
              placeholder="state"
              className={`${inputClass} w-28`}
            />
            <span className="text-muted-foreground text-sm">/</span>
            <AutocompleteInput
              value={uploadCrop}
              onChange={setUploadCrop}
              suggestions={cropSuggestionsFor(uploadState)}
              placeholder="crop"
              className={`${inputClass} w-28`}
            />
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors cursor-pointer
            ${uploading ? 'border-border/40 text-muted-foreground/40 cursor-not-allowed' : 'border-border text-foreground hover:bg-accent'}`}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Upload size={12} />
          {uploading ? 'Uploading…' : 'Upload PDF'}
        </button>
      </div>

      <div className="flex items-end gap-2 flex-wrap border-t border-border/50 pt-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Add State</label>
          <AutocompleteInput
            value={addStateInput}
            onChange={setAddStateInput}
            suggestions={stateOptions}
            placeholder="state"
            className={`${inputClass} w-28`}
          />
        </div>
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors cursor-pointer
            ${creatingState ? 'border-border/40 text-muted-foreground/40 cursor-not-allowed' : 'border-border text-foreground hover:bg-accent'}`}
          onClick={handleAddState}
          disabled={creatingState}
        >
          <FolderPlus size={12} />
          {creatingState ? 'Creating…' : 'Create'}
        </button>
      </div>

      <div className="flex items-end gap-2 flex-wrap border-t border-border/50 pt-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Add Crop</label>
          <div className="flex items-center gap-1">
            <AutocompleteInput
              value={folderState}
              onChange={v => { setFolderState(v); setFolderCrop(''); }}
              suggestions={stateOptions}
              placeholder="state"
              className={`${inputClass} w-28`}
            />
            <span className="text-muted-foreground text-sm">/</span>
            <AutocompleteInput
              value={folderCrop}
              onChange={setFolderCrop}
              suggestions={cropSuggestionsFor(folderState)}
              placeholder="crop"
              className={`${inputClass} w-28`}
            />
          </div>
        </div>
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors cursor-pointer
            ${creatingCrop ? 'border-border/40 text-muted-foreground/40 cursor-not-allowed' : 'border-border text-foreground hover:bg-accent'}`}
          onClick={handleAddCrop}
          disabled={creatingCrop}
        >
          <FolderPlus size={12} />
          {creatingCrop ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  );
}

export default function PopStateTable({ rows: rowsProp, loading, error, onRefresh }) {
  const rows = rowsProp ?? null;
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const selectAllRef = useRef(null);

  const [stateFilter, setStateFilter] = useState([]);
  const [cropFilter, setCropFilter] = useState([]);
  const [pdfFilter, setPdfFilter] = useState([]);
  const [outputFilter, setOutputFilter] = useState([]);
  const [auditFilter, setAuditFilter] = useState([]);
  const [finishedSort, setFinishedSort] = useState<null | 'asc' | 'desc'>(null);

  function load() { onRefresh?.(); }

  const allRows = rows || [];

  const stateOptions = [...new Set(allRows.map(r => r.state).filter(Boolean))].sort();
  const stateCropMap = {};
  allRows.forEach(r => {
    if (r.state && r.crop) {
      if (!stateCropMap[r.state]) stateCropMap[r.state] = new Set();
      stateCropMap[r.state].add(r.crop);
    }
  });

  const filterStateOptions = stateOptions;
  const filterCropOptions = [...new Set(allRows.map(r => r.crop).filter(Boolean))].sort();

  const anyStatusFilter = pdfFilter.length > 0 || outputFilter.length > 0 || auditFilter.length > 0;

  const filtered = allRows.filter(r =>
    (stateFilter.length === 0 || stateFilter.includes(r.state)) &&
    (cropFilter.length === 0 || (r.crop ? cropFilter.includes(r.crop) : false)) &&
    (!r.is_empty || !anyStatusFilter) &&
    (r.is_empty || pdfFilter.length === 0 || pdfFilter.includes(r.processed ? 'processed' : 'not processed')) &&
    (r.is_empty || outputFilter.length === 0 || outputFilter.includes(r.downloaded ? 'downloaded' : 'not downloaded')) &&
    (r.is_empty || auditFilter.length === 0 || auditFilter.includes(r.audited ? 'audited' : 'not audited'))
  );

  const anyFilter = stateFilter.length > 0 || cropFilter.length > 0
    || pdfFilter.length > 0 || outputFilter.length > 0 || auditFilter.length > 0;

  const displayed = finishedSort
    ? [...filtered].sort((a, b) => {
        const ta = a.finished_at ? new Date(a.finished_at).getTime() : -Infinity;
        const tb = b.finished_at ? new Date(b.finished_at).getTime() : -Infinity;
        return finishedSort === 'asc' ? ta - tb : tb - ta;
      })
    : filtered;

  function cycleFinishedSort() {
    setFinishedSort(s => s === null ? 'desc' : s === 'desc' ? 'asc' : null);
  }

  const selectableFiltered = filtered.filter(r => !r.is_empty && r.doc_path);

  function rowKey(row) { return row.doc_path || `${row.state}__${row.crop}__empty`; }

  const allSelected = selectableFiltered.length > 0 && selectableFiltered.every(r => selectedRows.has(rowKey(r)));
  const someSelected = selectableFiltered.some(r => selectedRows.has(rowKey(r)));
  const selectedCount = selectableFiltered.filter(r => selectedRows.has(rowKey(r))).length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(selectableFiltered.map(rowKey)));
    }
  }

  function toggleRow(row) {
    const key = rowKey(row);
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function deletePopRow(row) {
    if (!window.confirm(`Delete "${row.doc_name}" (${row.state}/${row.crop})?\n\nThis will permanently remove the PDF${row.output_path ? ' and its processed output folder' : ''}.`)) return;
    setDeleting(true);
    try {
      await deletePopDoc(row.state, row.crop, row.doc_name);
      setSelectedRows(prev => { const n = new Set(prev); n.delete(rowKey(row)); return n; });
      await load();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  async function deleteEmptyCrop(row) {
    if (!window.confirm(`Delete empty crop folder "${row.crop}" in ${row.state}?`)) return;
    setDeleting(true);
    try {
      await deleteEmptyPopCrop(row.state, row.crop);
      await load();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  async function deleteEmptyState(row) {
    if (!window.confirm(`Delete empty state folder "${row.state}"?`)) return;
    setDeleting(true);
    try {
      await deleteEmptyPopState(row.state);
      await load();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSelected() {
    const toDelete = selectableFiltered.filter(r => selectedRows.has(rowKey(r)));
    if (!toDelete.length) return;
    if (!window.confirm(`Delete ${toDelete.length} document(s)?\n\nThis will permanently remove the PDFs and any associated processed output folders.`)) return;
    setDeleting(true);
    try {
      for (const row of toDelete) {
        await deletePopDoc(row.state, row.crop, row.doc_name);
      }
      setSelectedRows(new Set());
      await load();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">POP Documents</h2>
        <div className="flex items-center gap-3">
          {someSelected && (
            <button
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors cursor-pointer
                ${deleting
                  ? 'border-border/40 text-muted-foreground/40 cursor-not-allowed'
                  : 'border-destructive/50 text-destructive hover:bg-destructive/10'
                }`}
              onClick={deleteSelected}
              disabled={deleting}
            >
              <Trash2 size={11} />
              {deleting ? 'Deleting…' : `Delete ${selectedCount} selected`}
            </button>
          )}
          {anyFilter && rows && (
            <span className="text-[10px] text-muted-foreground">
              Showing {filtered.length} of {rows.length}
            </span>
          )}
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={load}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <UploadControls onDone={load} stateOptions={stateOptions} stateCropMap={stateCropMap} />

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
          <span className="text-sm text-destructive">{error}</span>
          <button className="text-xs text-muted-foreground hover:text-foreground cursor-pointer" onClick={load}>retry</button>
        </div>
      )}

      {!error && (
        rows === null || loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
            <RefreshCw size={14} className="animate-spin mr-2" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground italic">
            No POP documents yet. Upload PDFs using the controls above.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 w-8">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      disabled={selectableFiltered.length === 0}
                      className="cursor-pointer accent-primary disabled:cursor-default disabled:opacity-30"
                    />
                  </th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    <ColumnFilter label="State" options={filterStateOptions} selected={stateFilter} onChange={setStateFilter} />
                  </th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    <ColumnFilter label="Crop" options={filterCropOptions} selected={cropFilter} onChange={setCropFilter} />
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Doc</th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    <ColumnFilter label="PDF" options={['processed', 'not processed']} selected={pdfFilter} onChange={setPdfFilter} />
                  </th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    <ColumnFilter label="Output" options={['downloaded', 'not downloaded']} selected={outputFilter} onChange={setOutputFilter} />
                  </th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    <ColumnFilter label="Audit" options={['audited', 'not audited']} selected={auditFilter} onChange={setAuditFilter} />
                  </th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    <button
                      onClick={cycleFinishedSort}
                      className={`flex items-center gap-1 font-semibold text-[11px] uppercase tracking-wide transition-colors cursor-pointer
                        ${finishedSort ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Finished
                      {finishedSort === 'asc' ? <ArrowUp size={11} /> : finishedSort === 'desc' ? <ArrowDown size={11} /> : <ArrowUpDown size={11} />}
                    </button>
                  </th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                      No rows match the current filters.
                    </td>
                  </tr>
                ) : (
                  displayed.map((row, idx) => {
                    if (row.is_empty) {
                      const isEmptyState = row.crop === null || row.crop === undefined;
                      return (
                        <tr
                          key={isEmptyState ? `${row.state}-empty-state` : `${row.state}-${row.crop}-empty`}
                          className="border-b border-border/30 bg-amber-500/5"
                        >
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap align-middle">
                            {row.state}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            {isEmptyState
                              ? <span className="text-[10px] text-amber-500/50 italic">no crops yet</span>
                              : <span className="text-foreground">{row.crop}</span>
                            }
                          </td>
                          <td colSpan={3} className="px-3 py-2 text-[10px] text-amber-500/70 italic align-middle">
                            {isEmptyState
                              ? 'Empty state folder — create a crop folder to get started'
                              : 'Empty folder — upload a PDF to get started'
                            }
                          </td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 align-middle">
                            <button
                              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer
                                ${deleting
                                  ? 'border-border/40 text-muted-foreground/30 cursor-not-allowed'
                                  : 'border-destructive/40 text-destructive/70 hover:border-destructive hover:text-destructive hover:bg-destructive/5'
                                }`}
                              onClick={() => isEmptyState ? deleteEmptyState(row) : deleteEmptyCrop(row)}
                              disabled={deleting}
                              title={isEmptyState ? 'Delete empty state folder' : 'Delete empty crop folder'}
                            >
                              <Trash2 size={11} />
                            </button>
                          </td>
                        </tr>
                      );
                    }
                    const isSelected = selectedRows.has(rowKey(row));
                    return (
                      <tr
                        key={`${row.state}-${row.crop}-${row.doc_name}`}
                        className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${isSelected ? 'bg-primary/5' : idx % 2 === 0 ? '' : 'bg-muted/10'}`}
                      >
                        <td className="px-3 py-2 align-middle">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(row)}
                            className="cursor-pointer accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap align-top">{row.state}</td>
                        <td className="px-3 py-2 text-foreground whitespace-nowrap align-top">{row.crop}</td>
                        <td className="px-3 py-2 text-muted-foreground align-top max-w-[240px]">
                          <span className="block truncate" title={row.doc_name}>{row.doc_name}</span>
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap">
                          <a
                            href={popDownloadUrl(row.doc_path)}
                            className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                            download
                          >
                            <Download size={11} /> PDF
                          </a>
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap">
                          {row.output_path ? (
                            <a
                              href={popOutputDownloadUrl(row.state, row.crop, row.doc_name)}
                              className={`flex items-center gap-1 text-[10px] transition-colors ${row.downloaded ? 'text-green-400 hover:text-green-300' : 'text-primary hover:text-primary/80'}`}
                              download
                            >
                              <Download size={11} /> docx
                            </a>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <PopAuditCell row={row} onUploaded={load} />
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                          {formatFinishedAt(row.finished_at)}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <button
                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer
                              ${deleting
                                ? 'border-border/40 text-muted-foreground/30 cursor-not-allowed'
                                : 'border-destructive/40 text-destructive/70 hover:border-destructive hover:text-destructive hover:bg-destructive/5'
                              }`}
                            onClick={() => deletePopRow(row)}
                            disabled={deleting}
                            title="Delete document"
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
