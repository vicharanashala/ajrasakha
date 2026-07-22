import { useEffect, useRef, useState } from "react";
import { Counter } from "./Counter";

/** How long the "+N" change chip stays on screen after an update. */
const DELTA_VISIBLE_MS = 2600;

/**
 * A carousel figure that reacts when its value changes (socket push).
 *
 * The number itself is a <Counter>, which already tallies smoothly from the previous
 * value to the new one — so it is deliberately NEVER re-keyed here (a remount would reset
 * it to 0 and lose that roll). The visible "something changed" cue is a delta chip that
 * drops in from above and settles under the figure, plus a brief highlight on the number.
 *
 * Non-numeric values ("22+", "18.6M") render as typed, with no animation.
 */
export const AnimatedStatValue = ({
  value,
  suffix,
}: {
  value: number | string;
  suffix?: string;
}) => {
  const numeric = Number(String(value).replace(/,/g, ""));
  const isNumeric = String(value).trim() !== "" && Number.isFinite(numeric);

  // Last numeric value we rendered. null until the first paint, so the initial load
  // doesn't count as a "change".
  const previous = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  // Bumped on every change so the chip remounts and replays its animation.
  const [changeKey, setChangeKey] = useState(0);

  useEffect(() => {
    if (!isNumeric) return;
    const before = previous.current;
    previous.current = numeric;
    if (before === null || before === numeric) return;

    setDelta(numeric - before);
    setChangeKey((k) => k + 1);
    const timer = setTimeout(() => setDelta(null), DELTA_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [numeric, isNumeric]);

  if (!isNumeric) return <span className="mono">{value}</span>;

  const showDelta = delta !== null && delta !== 0;

  return (
    <span className="cstat-live">
      {/* key stays stable — Counter must not remount */}
      <span className={`cstat-num${showDelta ? " bumped" : ""}`}>
        <Counter value={numeric} suffix={suffix} />
      </span>

      {showDelta && (
        <span
          key={changeKey}
          className={`cstat-delta ${delta > 0 ? "up" : "down"}`}
          aria-live="polite"
        >
          {delta > 0 ? "+" : "−"}
          {Math.abs(delta).toLocaleString("en-IN")}
        </span>
      )}
    </span>
  );
};
