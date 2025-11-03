import { Clock, AlertTriangle } from "lucide-react";
import React from "react";

interface TimerDisplayProps {
  timer: string;
  status?: string;
  warningThreshold?: number;
  criticalThreshold?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({
  timer,
  status,
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

  if (hours === 0 && minutes < criticalThreshold) {
    textColor = "text-red-600 font-semibold";
    iconColor = "text-red-500 animate-pulse";
    icon = <AlertTriangle className={`${iconSize} ${iconColor}`} />;
  } else if (hours === 0 && minutes < warningThreshold) {
    textColor = "text-orange-500 font-semibold";
    iconColor = "text-orange-400";
    icon = <AlertTriangle className={`${iconSize} ${iconColor}`} />;
  } else if (hours < 1) {
    textColor = "text-yellow-500 font-medium";
    iconColor = "text-yellow-400";
  } else {
    textColor = "text-green-600";
    iconColor = "text-green-500";
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {icon}
      <span className={`${textSize} font-mono ${textColor}`}>{timer}</span>
    </div>
  );
};
