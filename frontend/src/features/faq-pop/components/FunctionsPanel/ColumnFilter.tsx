// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';

export default function ColumnFilter({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(o => !o);
    setSearch('');
  }

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const hasSelection = selected.length > 0;

  function toggle(opt) {
    if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
    else onChange([...selected, opt]);
  }

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={`flex items-center gap-1 font-semibold text-[11px] uppercase tracking-wide transition-colors cursor-pointer
          ${hasSelection ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
        {hasSelection && (
          <span className="inline-flex items-center justify-center bg-primary text-primary-foreground rounded-full text-[9px] font-bold w-4 h-4 leading-none">
            {selected.length}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: '13rem' }}
          className="rounded-lg border border-border bg-card shadow-xl"
        >
          <div className="p-2 border-b border-border/50">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full bg-input border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {hasSelection && (
            <div className="px-2 py-1 border-b border-border/50 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{selected.length} selected</span>
              <button
                onClick={() => onChange([])}
                className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X size={10} /> Clear
              </button>
            </div>
          )}

          <div className="max-h-48 overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[10px] text-muted-foreground/50 italic">No matches</div>
            ) : (
              filtered.map(opt => (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="accent-primary"
                  />
                  <span className="text-[11px] text-foreground truncate" title={opt}>{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
