import { formatIndian, useCountUp } from "../utils";

/**
 * Count-up figure. `suffix` (e.g. "M") renders a one-decimal float (41.2M);
 * otherwise an Indian-grouped integer (1,86,00,000). Animates once on scroll-in
 * and respects prefers-reduced-motion (handled in useCountUp).
 *
 * A non-numeric `value` (e.g. "—" while data loads, or "22+") is rendered verbatim — no
 * count-up — so the same component covers both live numbers and text placeholders.
 */
export const Counter = ({
  value,
  suffix,
  className,
}: {
  value: number | string;
  suffix?: string;
  className?: string;
}) => {
  const numeric =
    typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  const isNumeric =
    typeof value === "number" ||
    (String(value).trim() !== "" && Number.isFinite(numeric));

  // Hook must run every render; feed it 0 when the value isn't a number.
  const { value: v, ref } = useCountUp(isNumeric ? numeric : 0);
  const text = isNumeric
    ? suffix
      ? `${v.toFixed(1)}${suffix}`
      : formatIndian(v)
    : String(value);

  return (
    <span ref={ref} className={`mono ${className ?? ""}`}>
      {text}
    </span>
  );
};
