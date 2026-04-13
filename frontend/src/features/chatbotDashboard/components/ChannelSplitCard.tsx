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
      <div className="max-h-[260px] overflow-y-auto pr-1">
        <DonutChart segments={channelSplit} />
        <div className="mt-[14px] pt-[10px] border-t border-[var(--border)]">
          <div className="text-[11px] text-[var(--muted-foreground)] mb-2 font-medium">
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
