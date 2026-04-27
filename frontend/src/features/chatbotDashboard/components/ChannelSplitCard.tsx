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
    //  Remove this div when data is dynamic
    <div className="relative cursor-not-allowed h-full">
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
          {/* // Remove this div when data is dynamic */}
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] rounded-lg flex items-center justify-center z-10">
				<span className="text-white text-xs font-semibold tracking-wide">
				</span>
				</div>

        </div>
      </div>
    </Card>
    </div>
  );
}
