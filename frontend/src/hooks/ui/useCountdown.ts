import { useEffect, useRef, useState } from "react";

export type CountdownHoldOptions = {
  accumulatedHoldMs?: number;
  holdAt?: string | null;
};

/** SLA pause: while status is hold, countdown freezes; accumulatedHoldMs shifts the deadline after each unhold. */
export function buildHoldCountdownOptions(q: {
  status?: string | null;
  holdAt?: string | null;
  accumulatedHoldMs?: number | null;
}): CountdownHoldOptions {
  return {
    accumulatedHoldMs: q.accumulatedHoldMs ?? 0,
    holdAt: q.status === "hold" ? q.holdAt ?? undefined : undefined,
  };
}

function computeRemainingMs(
  createdAt: string,
  durationHours: number,
  accumulatedHoldMs: number,
  holdAt: string | null | undefined
): number {
  const c = new Date(createdAt).getTime();
  if (isNaN(c)) return 0;
  const target = c + durationHours * 60 * 60 * 1000 + accumulatedHoldMs;
  const freezeMs =
    holdAt && !isNaN(new Date(holdAt).getTime())
      ? new Date(holdAt).getTime()
      : null;
  if (freezeMs != null) {
    return Math.max(target - freezeMs, 0);
  }
  return Math.max(target - Date.now(), 0);
}

export const useCountdown = (
  createdAt: string | undefined | null,
  durationHours: number,
  onExpire: () => void,
  holdOptions?: CountdownHoldOptions
) => {
  const accumulatedHoldMs = holdOptions?.accumulatedHoldMs ?? 0;
  const holdAt = holdOptions?.holdAt;

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  if (!createdAt || isNaN(new Date(createdAt).getTime())) {
    return "00:00:00";
  }

  const [remaining, setRemaining] = useState(() =>
    computeRemainingMs(createdAt, durationHours, accumulatedHoldMs, holdAt)
  );

  useEffect(() => {
    if (!createdAt || isNaN(new Date(createdAt).getTime())) return;

    const freezeMs =
      holdAt && !isNaN(new Date(holdAt).getTime())
        ? new Date(holdAt).getTime()
        : null;

    const nextRemaining = computeRemainingMs(
      createdAt,
      durationHours,
      accumulatedHoldMs,
      holdAt
    );
    setRemaining(nextRemaining);

    if (freezeMs == null && nextRemaining <= 0) {
      onExpireRef.current();
      return;
    }

    if (freezeMs != null) {
      return;
    }

    if (nextRemaining <= 0) {
      return;
    }

    const c = new Date(createdAt).getTime();
    const target = c + durationHours * 60 * 60 * 1000 + accumulatedHoldMs;

    const interval = setInterval(() => {
      const diff = target - Date.now();
      if (diff <= 0) {
        clearInterval(interval);
        setRemaining(0);
        onExpireRef.current();
      } else {
        setRemaining(diff);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [createdAt, durationHours, accumulatedHoldMs, holdAt]);

  const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((remaining / (1000 * 60)) % 60);
  const seconds = Math.floor((remaining / 1000) % 60);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};
