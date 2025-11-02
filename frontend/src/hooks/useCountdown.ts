import { useEffect, useState } from "react";

export const useCountdown = (
  createdAt: string | undefined | null,
  durationHours: number,
  onExpire: () => void
) => {
  if (!createdAt || isNaN(new Date(createdAt).getTime())) {
    return "00:00:00";
  }

  const targetTime =
    new Date(createdAt).getTime() + durationHours * 60 * 60 * 1000;
  const [remaining, setRemaining] = useState(() =>
    Math.max(targetTime - Date.now(), 0)
  );

  useEffect(() => {
    if (!createdAt || isNaN(targetTime)) return;

    if (remaining <= 0) {
      onExpire();
      return;
    }

    const interval = setInterval(() => {
      const diff = targetTime - Date.now();
      if (diff <= 0) {
        clearInterval(interval);
        onExpire();
      } else {
        setRemaining(diff);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetTime, onExpire]);

  // Convert milliseconds to HH:MM:SS
  const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((remaining / (1000 * 60)) % 60);
  const seconds = Math.floor((remaining / 1000) % 60);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};
