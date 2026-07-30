import { DIAGNOSIS_CONFIG } from "../hooks/useGapData";

export default function DiagnosisLegend() {
  return (
    <div className="flex flex-wrap gap-3">
      <span className="text-xs font-medium uppercase tracking-wider mr-2 self-center" style={{ color: "oklch(0.55 0.02 260)" }}>
        Diagnosis Types:
      </span>
      {Object.entries(DIAGNOSIS_CONFIG).map(([key, config]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 cursor-default"
          style={{
            background: config.bg,
            color: config.color,
            border: `1px solid ${config.border}`,
          }}
        >
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ background: config.color }}
          />
          {config.label}
        </span>
      ))}
    </div>
  );
}
