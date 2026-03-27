import { Card } from "./shared/Card";
import { ProgressBar } from "./shared/ProgressBar";

interface ChannelSegment { label: string; pct: number; color: string; }
interface VoiceAccuracy  { lang: string; pct: number; color: string; }

interface Props {
  channelSplit: ChannelSegment[];
  voiceAccuracy: VoiceAccuracy[];
}

function DonutChart({ segments }: { segments: ChannelSegment[] }) {
  const total = segments.reduce((s, x) => s + x.pct, 0);
  let offset = 0;
  const r = 30, cx = 40, cy = 40, circ = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width={80} height={80} viewBox="0 0 80 80">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--muted)" strokeWidth={14} />
        {segments.map((seg) => {
          const dash = (seg.pct / total) * circ;
          const el = (
            <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={14}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} />
          );
          offset += dash;
          return el;
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={500} fill="#1E7A3C">
          {segments[0].pct}%
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted-foreground)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0, display: "inline-block" }} />
            {s.label} · {s.pct}%
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChannelSplitCard({ channelSplit, voiceAccuracy }: Props) {
  return (
    <Card title="Channel split" subtitle="How farmers access ACE">
      <DonutChart segments={channelSplit} />
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: "0.5px solid var(--border)" }}>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8, fontWeight: 500 }}>Voice accuracy by language</div>
        {voiceAccuracy.map(v => <ProgressBar key={v.lang} label={v.lang} pct={v.pct} color={v.color} />)}
      </div>
    </Card>
  );
}
