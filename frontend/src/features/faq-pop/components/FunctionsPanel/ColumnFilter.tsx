// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';

// Widest option label's rendered text width, so the panel can size itself to fit the longest
// value instead of a fixed 13rem that truncates long folder/organization names.
let _measureCanvas = null;
function measureMaxTextWidth(texts, font) {
  if (!texts || texts.length === 0) return 0;
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
  const ctx = _measureCanvas.getContext('2d');
  ctx.font = font;
  let max = 0;
  for (const t of texts) {
    const w = ctx.measureText(t).width;
    if (w > max) max = w;
  }
  return max;
}

// `options` is normally a plain string[] (value === display label). Pass {value, label}[]
// instead (e.g. language codes with human-readable names) when the two need to differ — the
// filter is applied by `value`, the checklist and search show `label`.
export default function ColumnFilter({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 208 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const normalized = (options || []).map((o) =>
    typeof o === 'object' && o !== null ? o : { value: o, label: o },
  );

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
      const font = getComputedStyle(btnRef.current).font || '11px sans-serif';
      const textWidth = measureMaxTextWidth(normalized.map((o) => o.label), font);
      const idealWidth = Math.max(208 * 2, textWidth + 56);
      const width = Math.min(idealWidth, window.innerWidth - 16);
      const left = Math.min(rect.left, window.innerWidth - width - 8);
      setPos({ top: rect.bottom + 4, left, width });
    }
    setOpen(o => !o);
    setSearch('');
  }

  const filtered = normalized.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const hasSelection = selected.length > 0;

  function toggle(value) {
    if (selected.includes(value)) onChange(selected.filter(s => s !== value));
    else onChange([...selected, value]);
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
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: pos.width || '13rem' }}
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
                  key={opt.value}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className="accent-primary"
                  />
                  <span className="text-[11px] text-foreground truncate" title={opt.label}>{opt.label}</span>
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
