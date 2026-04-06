import { Card } from "./shared/Card";
import { ProgressBar } from "./shared/ProgressBar";
import { DonutChart } from "../DonutChart";

interface VoiceAccuracy { lang: string; pct: number; color: string; }
interface ChannelSegment { label: string; pct: number; color: string; }

interface Props {
  channelSplit: ChannelSegment[];
  voiceAccuracy: VoiceAccuracy[];
}

export function ChannelSplitCard({ channelSplit, voiceAccuracy }: Props) {
  return (
    <Card title="Channel split" subtitle="How farmers access ACE">
      <div style={{ maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
        <DonutChart segments={channelSplit} />
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: "0.5px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8, fontWeight: 500 }}>
            Voice accuracy by language
          </div>
          {voiceAccuracy.map(v => (
            <ProgressBar key={v.lang} label={v.lang} pct={v.pct} color={v.color} />
          ))}
        </div>
      </div>
    </Card>
  );
}
