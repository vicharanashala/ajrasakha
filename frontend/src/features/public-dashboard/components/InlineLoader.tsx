import { Loader2 } from "lucide-react";

/**
 * Small inline spinner shown in place of a live figure while its data is still loading.
 * Uses currentColor, so it takes the surrounding text colour (white on the carousel,
 * dark on the light ticker).
 */
export const InlineLoader = ({ size = 16 }: { size?: number }) => (
  <Loader2
    size={size}
    className="animate-spin"
    style={{ verticalAlign: "-2px", opacity: 0.8 }}
    aria-label="Loading"
  />
);
