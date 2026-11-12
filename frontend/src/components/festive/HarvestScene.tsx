const GRAIN_PAIRS = [0, 1, 2, 3, 4];

interface WheatStalkProps {
  x: number;
  y: number;
  scale?: number;
  delay?: string;
}

// A single stalk of wheat that sways gently from its base.
function WheatStalk({ x, y, scale = 1, delay = "0s" }: WheatStalkProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="wheat-sway" style={{ animationDelay: delay }}>
        <path d="M0 0Q1.5-18 0-38" fill="none" strokeWidth="1" className="stroke-diwali-gold" />
        {GRAIN_PAIRS.map((index) => (
          <g key={index} transform={`translate(0 ${-16 - index * 5})`} className="fill-diwali-gold">
            <ellipse cx="-2.4" cy="0" rx="1.5" ry="3" transform="rotate(-28 -2.4 0)" />
            <ellipse cx="2.4" cy="0" rx="1.5" ry="3" transform="rotate(28 2.4 0)" />
          </g>
        ))}
        <ellipse cx="0" cy="-41" rx="1.4" ry="3" className="fill-diwali-gold" />
      </g>
    </g>
  );
}

// Dusk sky over rolling fields with wheat, used behind the greeting card's diya.
export function HarvestScene() {
  return (
    <svg
      viewBox="0 0 320 112"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
    >
      <g className="fill-diwali-flame" opacity="0.7">
        <circle cx="34" cy="16" r="0.9" />
        <circle cx="82" cy="30" r="0.7" />
        <circle cx="126" cy="12" r="0.8" />
        <circle cx="210" cy="18" r="0.9" />
        <circle cx="252" cy="34" r="0.7" />
        <circle cx="292" cy="14" r="0.8" />
      </g>

      <path d="M0 84C60 70 120 78 170 74 230 69 280 78 320 72V112H0Z" fill="oklch(0.4 0.08 135)" />
      <path d="M0 96C70 86 140 92 200 88 250 85 290 90 320 86V112H0Z" fill="oklch(0.31 0.07 140)" />
      <g fill="none" strokeWidth="0.8" className="stroke-diwali-gold" opacity="0.3">
        <path d="M0 102C70 94 140 99 200 95 250 92 290 97 320 93" />
        <path d="M0 108C70 101 140 105 200 102 250 99 290 103 320 100" />
      </g>

      <WheatStalk x={30} y={88} delay="-0.4s" />
      <WheatStalk x={44} y={86} scale={0.85} delay="-1.2s" />
      <WheatStalk x={58} y={88} scale={0.7} delay="-2s" />
      <WheatStalk x={262} y={86} scale={0.7} delay="-0.8s" />
      <WheatStalk x={276} y={85} scale={0.85} delay="-1.6s" />
      <WheatStalk x={290} y={86} delay="-2.4s" />
    </svg>
  );
}
