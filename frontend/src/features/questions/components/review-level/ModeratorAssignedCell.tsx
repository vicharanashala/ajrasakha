import { useEffect, useState } from "react";
import { Badge } from "@/components/atoms/badge";
import { CheckCircle } from "lucide-react";

function formatElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const totalMinutes = ms / 60000;

  if (totalMinutes >= 24 * 60) {
    const days = Math.floor(totalMinutes / (24 * 60));
    const hrs = Math.floor((totalMinutes % (24 * 60)) / 60);
    return hrs > 0 ? `${days}d : ${hrs}h` : `${days}d`;
  }

  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function badgeColor(ms: number): string {
  const minutes = ms / 60000;
  if (minutes > 120) return "bg-red-500/10 text-red-600 border-red-500/30";
  if (minutes >= 30) return "bg-amber-500/10 text-amber-600 border-amber-500/30";
  return "bg-green-500/10 text-green-600 border-green-500/30";
}

interface Props {
  status: string;
  moderatorAssignedAt?: string | null;
  updatedAt?: string | null;
}

export function ModeratorAssignedCell({ status, moderatorAssignedAt, updatedAt }: Props) {
  const [now, setNow] = useState(() => Date.now());

  const isActive = (status === "in-review" || status === "routed") && !!moderatorAssignedAt;

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  if (!moderatorAssignedAt) {
    return <Badge variant="outline">N/A</Badge>;
  }

  const assignedTime = new Date(moderatorAssignedAt).getTime();

  // Closed → show finalized time (moderatorAssignedAt → updatedAt)
  if (status === "closed" && updatedAt) {
    const closedTime = new Date(updatedAt).getTime();
    const elapsed = Math.max(0, closedTime - assignedTime);
    return (
      <div className="flex flex-col items-center gap-1">
        <Badge variant="outline" className={badgeColor(elapsed)}>
          {formatElapsed(elapsed)}
        </Badge>
        <div className="flex items-center gap-1 text-[11px] text-green-600">
          <CheckCircle className="w-3 h-3" />
          <span>Finalized</span>
        </div>
      </div>
    );
  }

  // in-review / routed → live ticking timer
  if (isActive) {
    const elapsed = Math.max(0, now - assignedTime);
    return <Badge variant="outline" className={badgeColor(elapsed)}>{formatElapsed(elapsed)}</Badge>;
  }

  return <Badge variant="outline">N/A</Badge>;
}
