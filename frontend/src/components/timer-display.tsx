import { Clock, AlertTriangle } from "lucide-react";
import React from "react";

interface TimerDisplayProps {
  timer: string;
  status?: string;
  source?: string;
  warningThreshold?: number;
  criticalThreshold?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({
  timer,
  status,
  source,
  warningThreshold = 30,
  criticalThreshold = 10,
  className = "",
  size = "md",
}) => {
  if (status === "delayed" || status !== "open") return null;
  if (!timer) return null;

  const [hours, minutes] = timer.split(":").map(Number);
  if (timer === "00:00:00") return null;

  const sizeMap = {
    sm: { icon: "w-3 h-3", text: "text-xs" },
    md: { icon: "w-4 h-4", text: "text-sm" },
    lg: { icon: "w-5 h-5", text: "text-base" },
  };
  const { icon: iconSize, text: textSize } = sizeMap[size];

  let textColor = "text-primary";
  let iconColor = "text-muted-foreground";
  let icon = <Clock className={`${iconSize} ${iconColor}`} />;

  if (source === "AJRASAKHA") {
    // AJRASAKHA: green >= 1hr, yellow 30-60min, red < 30min
    if (hours === 0 && minutes < warningThreshold) {
      textColor = "text-red-600 font-semibold";
      iconColor = "text-red-500 animate-pulse";
      icon = <AlertTriangle className={`${iconSize} ${iconColor}`} />;
    } else if (hours === 0 && minutes >= warningThreshold) {
      textColor = "text-yellow-500 font-medium";
      iconColor = "text-yellow-400";
    } else {
      textColor = "text-green-600";
      iconColor = "text-green-500";
    }
  } else {
    // Default: only show red alert when critically low (< 10 min)
    if (hours === 0 && minutes < criticalThreshold) {
      textColor = "text-red-600 font-semibold";
      iconColor = "text-red-500 animate-pulse";
      icon = <AlertTriangle className={`${iconSize} ${iconColor}`} />;
    }
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {icon}
      <span className={`${textSize} font-mono ${textColor}`}>{timer}</span>
    </div>
  );
};
