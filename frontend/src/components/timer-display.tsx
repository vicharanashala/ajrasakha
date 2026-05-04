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
  showDays?: boolean;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({
  timer,
  status,
  source,
  warningThreshold = 30,
  criticalThreshold = 10,
  className = "",
  size = "md",
  showDays = false,
}) => {

  // Early return if timer is invalid
  if (!timer || timer === "00:00:00") return null;
  
  // Simple parsing for testing
  const timeParts = timer.split(":").map(Number);
  let days = 0, hours = 0, minutes = 0, seconds = 0;
  
  if (timeParts.length >= 3) {
    [hours, minutes, seconds] = timeParts.slice(0, 3);
    if (showDays && hours > 24) {
      days = Math.floor(hours / 24);
      hours = hours % 24;
    }
  } else if (timeParts.length === 2) {
    [hours, minutes] = timeParts;
  }

  const sizeMap = {
    sm: { icon: "w-3 h-3", text: "text-xs" },
    md: { icon: "w-4 h-4", text: "text-sm" },
    lg: { icon: "w-5 h-5", text: "text-base" },
  };
  const { icon: iconSize, text: textSize } = sizeMap[size];

  let textColor = "text-primary";
  let iconColor = "text-muted-foreground";
  let icon = <Clock className={`${iconSize} ${iconColor}`} />;

  if (status === "hold") {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <Clock className={`${iconSize} text-orange-500`} />
        <span className={`${textSize} font-mono text-orange-600 font-medium`}>
          Hold: {timer}
        </span>
      </div>
    );
  }

  // Allow timer to show for all statuses except closed
  if (status === "closed" || !timer) return null;


  // if (hours === 0 && minutes < criticalThreshold) {
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

  // Format display time
  let displayTime = timer;
  if (showDays && days > 0) {
    displayTime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  } else if (showDays) {
    displayTime = `${hours}h ${minutes}m ${seconds}s`;
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {icon}
      <span className={`${textSize} font-mono ${textColor}`}>{displayTime}</span>
    </div>
  );
};
