import { useId } from "react";
import { cn } from "@/lib/utils";

interface DiyaIconProps {
  className?: string;
  /** Flickers the flame and pulses its glow. Disabled for reduced motion via CSS. */
  animated?: boolean;
}

// Shaded oil lamp (diya) with a layered flame, drawn with the Diwali colour tokens.
export function DiyaIcon({ className, animated = true }: DiyaIconProps) {
  // SVG ids must be safe inside url(#...), so strip the punctuation React adds.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const haloId = `${id}-halo`;
  const flameId = `${id}-flame`;
  const bowlId = `${id}-bowl`;
  const rimId = `${id}-rim`;

  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0 overflow-visible", animated && "diya-animated", className)}
    >
      <defs>
        <radialGradient id={haloId}>
          <stop offset="0%" style={{ stopColor: "var(--diwali-flame)", stopOpacity: 0.75 }} />
          <stop offset="100%" style={{ stopColor: "var(--diwali-marigold)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={flameId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--diwali-flame)" }} />
          <stop offset="100%" style={{ stopColor: "var(--diwali-marigold)" }} />
        </linearGradient>
        <linearGradient id={bowlId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "color-mix(in oklch, var(--diwali-maroon) 75%, white)" }} />
          <stop offset="100%" style={{ stopColor: "color-mix(in oklch, var(--diwali-maroon) 70%, black)" }} />
        </linearGradient>
        <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: "color-mix(in oklch, var(--diwali-gold) 70%, black)" }} />
          <stop offset="50%" style={{ stopColor: "var(--diwali-gold)" }} />
          <stop offset="100%" style={{ stopColor: "color-mix(in oklch, var(--diwali-gold) 70%, black)" }} />
        </linearGradient>
      </defs>

      <circle className="diya-halo" cx="16" cy="10" r="9" fill={`url(#${haloId})`} />

      <path d="M3.5 16.5C4.5 23 9.5 27 16 27s11.5-4 12.5-10.5z" fill={`url(#${bowlId})`} />
      <path d="M7 18.8c1.2 2.9 3.5 4.8 6.4 5.6" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="10.5" cy="21" r="0.9" className="fill-diwali-gold" />
      <circle cx="16" cy="22.6" r="0.9" className="fill-diwali-gold" />
      <circle cx="21.5" cy="21" r="0.9" className="fill-diwali-gold" />
      <path d="M12 26.6h8l-.9 2.4h-6.2z" className="fill-diwali-maroon" />

      <ellipse cx="16" cy="16.5" rx="12.6" ry="2.2" fill={`url(#${rimId})`} />
      <ellipse cx="16" cy="16.4" rx="10.4" ry="1.2" fill="oklch(0.33 0.07 50)" />
      <rect x="15.55" y="13.8" width="0.9" height="2.6" rx="0.4" fill="oklch(0.25 0.02 50)" />

      <path
        className="diya-flame-outer"
        d="M16 2.5c2.9 3.6 4.4 6.3 4.4 8.4a4.4 4.4 0 0 1-8.8 0c0-2.1 1.5-4.8 4.4-8.4z"
        fill={`url(#${flameId})`}
      />
      <path
        className="diya-flame-inner"
        d="M16 6.8c1.5 2 2.3 3.4 2.3 4.6a2.3 2.3 0 0 1-4.6 0c0-1.2.8-2.6 2.3-4.6z"
        style={{ fill: "var(--diwali-flame)" }}
      />
      <ellipse className="diya-flame-inner" cx="16" cy="12.6" rx="0.9" ry="1.4" fill="white" fillOpacity="0.85" />
    </svg>
  );
}
