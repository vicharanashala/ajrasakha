import { useEffect, useRef } from "react";

// `indeterminate` needs a DOM ref + effect since React's <input> has no
// `indeterminate` prop (it's a DOM-only property, not a reflected HTML
// attribute) - used by "Select All" when some but not all sub-types are
// checked.
export function TreeCheckbox({
  label,
  checked,
  indeterminate = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted cursor-pointer select-none">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 rounded border-input accent-primary"
      />
      <span className="truncate">{label}</span>
    </label>
  );
}
