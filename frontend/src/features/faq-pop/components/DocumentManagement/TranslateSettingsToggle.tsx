// @ts-nocheck
import { Languages } from "lucide-react";
import { useTranslateSettings } from "@/stores/translate-settings-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select";

const MODES = [
  { value: "normal", label: "Normal" },
  { value: "flex", label: "Flex", title: "Sometimes refused by Google under high demand (503) — retry with normal or batch if it fails" },
  { value: "batch", label: "Batch", title: "Can take 10-45+ minutes, even for a few pages" },
];

// Model tiers — what the user picks from, instead of raw model names.
const TIERS = [
  { value: "gemini-3.1-pro-preview", label: "Tier 1" },
  { value: "gemini-3.8-flash", label: "Tier 2" },
  { value: "gemini-3.5-flash-lite", label: "Tier 3" },
];

const PIPELINES = [
  { value: 0, label: "0", title: "Pipeline 0 — one call per page transcribes and translates" },
  { value: 1, label: "1", title: "Pipeline 1 — OCR transcribes each page, then a second model translates it (Normal mode only)" },
];

function Segmented({ label, options, value, onChange, isDisabled }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex rounded-md bg-muted p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            disabled={isDisabled?.(o.value)}
            onClick={() => onChange(o.value)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              value === o.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Global translation settings (pipeline, mode, model tier) — applies to every translation started
// from here on, replacing the per-row mode dropdowns. Rendered for admins only.
export default function TranslateSettingsToggle() {
  const { mode, pipeline, model, setMode, setPipeline, setModel } = useTranslateSettings();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-2.5 py-1 shadow-sm">
      <Languages size={13} className="text-primary shrink-0" />
      <Segmented label="Pipeline" options={PIPELINES} value={pipeline} onChange={setPipeline} isDisabled={(v) => v === 1 && mode !== "normal"} />
      <Segmented label="Mode" options={MODES} value={mode} onChange={setMode} />
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Model</span>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger size="sm" className="h-6 gap-1 rounded-md border-0 bg-muted px-2 py-0 text-[11px] font-medium shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIERS.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
