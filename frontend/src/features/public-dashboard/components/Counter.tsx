import { formatIndian, useCountUp } from "../utils";

/**
 * Count-up figure. `suffix` (e.g. "M") renders a one-decimal float (41.2M);
 * otherwise an Indian-grouped integer (1,86,00,000). Animates once on scroll-in
 * and respects prefers-reduced-motion (handled in useCountUp).
 */
export const Counter = ({
  value,
  suffix,
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) => {
  const { value: v, ref } = useCountUp(value);
  const text = suffix ? `${v.toFixed(1)}${suffix}` : formatIndian(v);
  return (
    <span ref={ref} className={`mono ${className ?? ""}`}>
      {text}
    </span>
  );
};
