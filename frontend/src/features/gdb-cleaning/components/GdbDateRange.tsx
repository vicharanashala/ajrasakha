import { PRESETS, type IDayRange } from "../dateRange";

interface Props {
  value: IDayRange;
  onChange: (range: IDayRange) => void;
}

export const GdbDateRange = ({ value, onChange }: Props) => {
  const active = PRESETS.find((p) => {
    const r = p.range();
    return r.start === value.start && r.end === value.end;
  })?.label;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() => onChange(preset.range())}
          className={`rounded-md border px-3 py-1 ${
            active === preset.label ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
          }`}
        >
          {preset.label}
        </button>
      ))}
      <input
        type="date"
        aria-label="From"
        value={value.start}
        max={value.end || undefined}
        onChange={(e) => onChange({ ...value, start: e.target.value })}
        className="rounded-md border bg-background px-2 py-1"
      />
      <span className="text-muted-foreground">to</span>
      <input
        type="date"
        aria-label="To"
        value={value.end}
        min={value.start || undefined}
        onChange={(e) => onChange({ ...value, end: e.target.value })}
        className="rounded-md border bg-background px-2 py-1"
      />
    </div>
  );
};
