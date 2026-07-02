// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Download, Upload, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getStateTable, uploadAuditedFile, downloadUrl, outputDownloadUrl, deleteFolder, deleteFile } from '../../api';
import ColumnFilter from './ColumnFilter';

function formatFinishedAt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function AuditCell({ row, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAuditedFile(file, row.state, row.district, row.crop);
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
      await deleteFile(row.audit_file);
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
          href={downloadUrl(row.audit_file)}
          className="flex items-center gap-1 text-[10px] text-green-400 hover:text-green-300 transition-colors"
          download
        >
          <Download size={11} /> {row.audit_file.split('/').pop()}
        </a>
      )}
      <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={uploading} />
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

export default function StateTable({ refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const selectAllRef = useRef(null);

  const [stateFilter, setStateFilter] = useState([]);
  const [districtFilter, setDistrictFilter] = useState([]);
  const [cropFilter, setCropFilter] = useState([]);
  const [domainFilter, setDomainFilter] = useState([]);
  const [downloadFilter, setDownloadFilter] = useState([]);
  const [auditFilter, setAuditFilter] = useState([]);
  const [finishedSort, setFinishedSort] = useState<null | 'asc' | 'desc'>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await getStateTable();
      setRows(d.rows || []);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [refreshKey]);

  const stateOptions = [...new Set(rows.map(r => r.state))].sort();
  const districtOptions = [...new Set(rows.map(r => r.district).filter(Boolean))].sort();
  const cropOptions = [...new Set(rows.map(r => r.crop))].sort();
  const domainOptions = [...new Set(rows.flatMap(r => r.domains || []))].sort();

  const filtered = rows.filter(r =>
    (stateFilter.length === 0 || stateFilter.includes(r.state)) &&
    (districtFilter.length === 0 || districtFilter.includes(r.district)) &&
    (cropFilter.length === 0 || cropFilter.includes(r.crop)) &&
    (domainFilter.length === 0 || domainFilter.some(d => (r.domains || []).includes(d))) &&
    (downloadFilter.length === 0 || downloadFilter.includes(r.downloaded ? 'downloaded' : 'not downloaded')) &&
    (auditFilter.length === 0 || auditFilter.includes(r.audited ? 'audited' : 'not audited'))
  );

  const anyFilter = stateFilter.length > 0 || districtFilter.length > 0 || cropFilter.length > 0
    || domainFilter.length > 0 || downloadFilter.length > 0 || auditFilter.length > 0;

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

  function rowKey(row) { return `${row.state}__${row.district || ''}__${row.crop}`; }

  const allSelected = filtered.length > 0 && filtered.every(r => selectedRows.has(rowKey(r)));
  const someSelected = filtered.some(r => selectedRows.has(rowKey(r)));
  const selectedCount = filtered.filter(r => selectedRows.has(rowKey(r))).length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filtered.map(rowKey)));
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

  async function deleteRow(row) {
    if (!window.confirm(`Delete crop "${row.crop}" (${row.state} / ${row.district})?\n\nThis will permanently remove the crop folder and all its contents.`)) return;
    setDeleting(true);
    try {
      await deleteFolder(`outputs/repair/${row.state}/${row.district}/${row.crop}`);
      setSelectedRows(prev => { const n = new Set(prev); n.delete(rowKey(row)); return n; });
      await load();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSelected() {
    const toDelete = filtered.filter(r => selectedRows.has(rowKey(r)));
    if (!toDelete.length) return;
    if (!window.confirm(`Delete ${toDelete.length} crop folder(s)?\n\nThis will permanently remove all selected crop folders and their contents.`)) return;
    setDeleting(true);
    try {
      for (const row of toDelete) {
        await deleteFolder(`outputs/repair/${row.state}/${row.district}/${row.crop}`);
      }
      setSelectedRows(new Set());
      await load();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
      <RefreshCw size={14} className="animate-spin mr-2" /> Loading…
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
      <span className="text-sm text-destructive">{error}</span>
      <button className="text-xs text-muted-foreground hover:text-foreground cursor-pointer" onClick={load}>retry</button>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Pipeline Outputs</h2>
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
          {anyFilter && (
            <span className="text-[10px] text-muted-foreground">
              Showing {filtered.length} of {rows.length}
            </span>
          )}
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={load}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground italic">
          No pipeline outputs yet.
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
                    className="cursor-pointer accent-primary"
                  />
                </th>
                <th className="text-left px-3 py-2 whitespace-nowrap">
                  <ColumnFilter label="State" options={stateOptions} selected={stateFilter} onChange={setStateFilter} />
                </th>
                <th className="text-left px-3 py-2 whitespace-nowrap">
                  <ColumnFilter label="District" options={districtOptions} selected={districtFilter} onChange={setDistrictFilter} />
                </th>
                <th className="text-left px-3 py-2 whitespace-nowrap">
                  <ColumnFilter label="Crop" options={cropOptions} selected={cropFilter} onChange={setCropFilter} />
                </th>
                <th className="text-left px-3 py-2">
                  <ColumnFilter label="Domains" options={domainOptions} selected={domainFilter} onChange={setDomainFilter} />
                </th>
                <th className="text-left px-3 py-2 whitespace-nowrap">
                  <ColumnFilter label="Output" options={['downloaded', 'not downloaded']} selected={downloadFilter} onChange={setDownloadFilter} />
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
                displayed.map((row, idx) => (
                  <tr key={`${row.state}__${row.district || ''}__${row.crop}`} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${selectedRows.has(rowKey(row)) ? 'bg-primary/5' : idx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(rowKey(row))}
                        onChange={() => toggleRow(row)}
                        className="cursor-pointer accent-primary"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-foreground whitespace-nowrap align-top">
                      {row.state}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-foreground whitespace-nowrap align-top">
                      {row.district || <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-foreground whitespace-nowrap align-top">
                      {row.crop}
                    </td>
                    <td className="px-3 py-2 align-top max-w-[220px]">
                      {row.domains?.length > 0
                        ? <span className="text-[10px] text-muted-foreground leading-relaxed">{row.domains.join(', ')}</span>
                        : <span className="text-muted-foreground/30 text-[10px]">—</span>
                      }
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      {row.output_file
                        ? <a
                            href={outputDownloadUrl(row.state, row.district, row.crop)}
                            className={`flex items-center gap-1 text-[10px] transition-colors ${row.downloaded ? 'text-green-400 hover:text-green-300' : 'text-primary hover:text-primary/80'}`}
                            download
                          >
                            <Download size={11} /> {row.district}_{row.crop}
                          </a>
                        : <span className="text-muted-foreground/30">—</span>
                      }
                    </td>
                    <td className="px-3 py-2 align-top">
                      <AuditCell row={row} onUploaded={load} />
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
                        onClick={() => deleteRow(row)}
                        disabled={deleting}
                        title="Delete crop folder"
                      >
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
