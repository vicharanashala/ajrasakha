import { useEffect, useState } from "react";

export const DashboardClock = () => {
  const [dateTime, setDateTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setDateTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedTime = dateTime.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false, 
  });

  const formattedDate = dateTime.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="text-right">
      <p className="text-lg font-semibold text-foreground tracking-wide">
        {formattedTime}
      </p>
      <p className="text-sm text-muted-foreground">{formattedDate}</p>
    </div>
  );
};
