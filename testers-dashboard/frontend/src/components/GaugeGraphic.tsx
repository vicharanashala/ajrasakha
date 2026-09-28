export interface GaugeGraphicProps {
  value: number;
  color: string;
  label: string;
}

// Semi-circle gauge shared by Release Health and SLA Compliance - value is
// the 0-100 score plotted as the arc's fill and printed in the center;
// color is the caller's own threshold-based color (e.g. healthColorHex).
export function GaugeGraphic({ value, color, label }: GaugeGraphicProps) {
  return (
    <>
      <div className="relative w-full max-w-[160px] mx-auto">
        <svg viewBox="0 0 100 55" className="w-full h-auto overflow-visible">
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="currentColor"
            className="text-muted"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray="125.6"
            strokeDashoffset={125.6 * (1 - value / 100)}
            style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
          <span className="text-2xl font-bold leading-none">{value}%</span>
        </div>
      </div>
      <div className="text-center text-xs text-muted-foreground -mt-1">{label}</div>
    </>
  );
}
