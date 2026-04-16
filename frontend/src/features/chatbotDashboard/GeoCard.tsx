import { Card } from "./components/shared/Card";

interface GeoState { abbr: string; val: string; opacity: number; }

function parseValue(val: string): number {
  const match = val.match(/(\d+(?:\.\d+)?)(K|M|L|k|m|l)?/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();
  if (unit === 'K') return num * 1000;
  if (unit === 'M') return num * 1000000;
  if (unit === 'L') return num * 100000; // L for Lakh
  return num;
}

function getColor(value: number, min: number, max: number): { r: number; g: number; b: number } {
  if (max === min) return { r: 0, g: 100, b: 0 };
  const ratio = (value - min) / (max - min);
  const r = Math.round(255 * (1 - ratio));
  const g = Math.round(255 * (1 - ratio) + 100 * ratio);
  const b = Math.round(255 * (1 - ratio));
  return { r, g, b };
}

export function GeoCard({ states }: { states: GeoState[] }) {
  const parsedStates = states.map(s => ({ ...s, numeric: parseValue(s.val) }));
  const values = parsedStates.map(s => s.numeric);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return (
    <Card title="Geographic concentration" subtitle="Active users by state · color gradient from white (low) to green (high)" action="Full geo view ↗">
      <div className="max-h-[180px] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {parsedStates.map(s => {
            const color = getColor(s.numeric, min, max);
            const background = `rgba(${color.r},${color.g},${color.b},1)`;
            const brightness = (color.r * 0.299 + color.g * 0.587 + color.b * 0.114);
            const textColor = brightness > 186 ? '#0e4a22' : '#fff';
            const subTextColor = brightness > 186 ? '#1e7a3c' : 'rgba(255,255,255,0.85)';
            return (
              <div key={s.abbr} className="rounded-md px-1.5 py-2 text-center" style={{ background }}>
                <div className="text-xs font-medium" style={{ color: textColor }}>{s.abbr}</div>
                <div className="text-[10px] opacity-75 mt-0.5" style={{ color: subTextColor }}>{s.val}</div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 mt-3 pt-2.5 border-t border-border text-xs text-muted-foreground flex-wrap">
          <span>Top district: <strong className="text-card-foreground">Vidisha, MP</strong></span>
          <span>Fastest growing: <strong className="text-[#1E7A3C]">MP +62% MoM</strong></span>
          <span>Gap states: <strong className="text-[#A32D2D]">NE States &lt;200</strong></span>
        </div>
      </div>
    </Card>
  );
}