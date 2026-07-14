import { Counter } from "./Counter";

/** Small value/label cell inside a metric grid — value rendered as given. */
export const MiniMetric = ({ value, label }: { value: string | number; label: string }) => (
  <div className="mm-cell">
    <div className="v">{value}</div>
    <div className="l">{label}</div>
  </div>
);

/** Same cell, but the value counts up on scroll-in. */
export const MiniCounter = ({
  value,
  suffix,
  label,
}: {
  value: number;
  suffix?: string;
  label: string;
}) => (
  <div className="mm-cell">
    <div className="v">
      <Counter value={value} suffix={suffix} />
    </div>
    <div className="l">{label}</div>
  </div>
);
