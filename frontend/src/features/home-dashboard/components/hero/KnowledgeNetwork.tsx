import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  type RefObject,
} from 'react';

interface Coords {
  x: number;
  y: number;
}

interface KnowledgeNetworkProps {
  /** Normalized scroll progress 0–1 */
  progress: number;
  /** Refs to each of the four badge elements (university, expert, scientist, government) */
  badgeRefs: RefObject<HTMLDivElement | null>[];
  /** Ref to the Ramesh Kumar farmer badge element (convergence destination) */
  phoneRef: RefObject<HTMLDivElement | null>;
  /** The container element that this SVG is sized to match */
  containerRef: RefObject<HTMLDivElement | null>;
}

interface MeasuredCoords {
  badges: (Coords | null)[];
  phone: Coords | null;
  svgW: number;
  svgH: number;
}

// Smooth-step easing
function ss(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Connection windows [start, end] per badge
const CONN_WINDOWS: [number, number][] = [
  [0.40, 0.54], // University
  [0.48, 0.62], // Expert Advisor
  [0.56, 0.70], // Field Scientist
  [0.64, 0.78], // Government Agency
];

/**
 * Bezier control point configurations for organic-looking paths.
 * Values are fractional multipliers of (dx, dy).
 */
const PATH_CURVES = [
  // University (left 4%, top 14%): sweeps down-right to farmer
  { ax: 0.15, ay: 0.40, bx: 0.60, by: -0.10 },
  // Expert Advisor (left 18%, top 26%): curves gently to farmer
  { ax: -0.25, ay: 0.35, bx: 0.35, by: 0.15 },
  // Field Scientist (left 33%, top 30%): sweeps down-left to farmer
  { ax: 0.35, ay: 0.30, bx: 0.65, by: -0.10 },
  // Government Agency (left 49%, top 16%): wide arc down-left to farmer
  { ax: 0.40, ay: 0.45, bx: 0.70, by: -0.15 },
];

function makeCubicPath(from: Coords, to: Coords, idx: number): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const c = PATH_CURVES[idx] ?? PATH_CURVES[0];

  const cp1x = from.x + dx * c.ax - dy * c.ay * 0.4;
  const cp1y = from.y + dy * c.ay + dx * c.ax * 0.3;
  const cp2x = from.x + dx * c.bx - dy * c.by * 0.3;
  const cp2y = from.y + dy * c.by + dx * c.bx * 0.2;

  return `M ${from.x.toFixed(1)},${from.y.toFixed(1)} C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${to.x.toFixed(1)},${to.y.toFixed(1)}`;
}

/**
 * Mathematically calculates a point at parameter t (0–1) along our custom cubic bezier.
 * This completely avoids browser layout queries like getTotalLength/getPointAtLength.
 */
function getCubicBezierPoint(from: Coords, to: Coords, idx: number, t: number): Coords {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const c = PATH_CURVES[idx] ?? PATH_CURVES[0];

  const cp1x = from.x + dx * c.ax - dy * c.ay * 0.4;
  const cp1y = from.y + dy * c.ay + dx * c.ax * 0.3;
  const cp2x = from.x + dx * c.bx - dy * c.by * 0.3;
  const cp2y = from.y + dy * c.by + dx * c.bx * 0.2;

  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * from.x + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * to.x,
    y: mt3 * from.y + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * to.y,
  };
}

const KnowledgeNetwork: React.FC<KnowledgeNetworkProps> = ({
  progress,
  badgeRefs,
  phoneRef,
  containerRef,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const [coords, setCoords] = useState<MeasuredCoords>({
    badges: [null, null, null, null],
    phone: null,
    svgW: 0,
    svgH: 0,
  });

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const cRect = container.getBoundingClientRect();
    if (!cRect.width || !cRect.height) return;

    const badges = badgeRefs.map((ref) => {
      const el = ref.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      // Center of each badge pill
      return {
        x: r.left - cRect.left + r.width * 0.5,
        y: r.top - cRect.top + r.height * 0.5,
      };
    });

    const targetEl = phoneRef.current;
    const phone = targetEl
      ? (() => {
          const r = targetEl.getBoundingClientRect();
          return {
            x: r.left - cRect.left + r.width * 0.5,
            y: r.top - cRect.top + r.height * 0.5,
          };
        })()
      : null;

    setCoords({
      badges,
      phone,
      svgW: cRect.width,
      svgH: cRect.height,
    });
  }, [badgeRefs, phoneRef, containerRef]);

  useEffect(() => {
    measure();

    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    badgeRefs.forEach((r) => { if (r.current) ro.observe(r.current); });
    if (phoneRef.current) ro.observe(phoneRef.current);
    window.addEventListener('resize', measure, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, badgeRefs, phoneRef, containerRef]);

  const { badges, phone, svgW, svgH } = coords;

  if (!svgW || !svgH || !phone) return null;

  return (
    <svg
      ref={svgRef}
      className="hc-network-svg"
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      aria-hidden="true"
    >
      <defs>
        <filter id="hc-path-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="hc-particle-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Connection paths ── */}
      {badges.map((badge, i) => {
        if (!badge) return null;
        const [winStart, winEnd] = CONN_WINDOWS[i];
        const pathP = ss(winStart, winEnd, progress);
        if (pathP <= 0) return null;

        const pathD = makeCubicPath(badge, phone, i);

        // Stroke-dashoffset drives the reveal from badge → farmer badge using SVG pathLength=100
        const dashOffset = 100 * (1 - pathP);
        const opacity = Math.min(1, pathP * 2.5);

        // Particle travels from badge to farmer badge - calculated mathematically (0 DOM layout updates)
        const particleT = Math.max(0, (pathP - 0.08) / 0.88);
        const particlePos = (particleT > 0 && particleT < 0.99)
          ? getCubicBezierPoint(badge, phone, i, particleT)
          : null;

        return (
          <g key={i} opacity={opacity}>
            {/* Base faint line */}
            <path
              d={pathD}
              fill="none"
              stroke="rgba(220,190,90,0.18)"
              strokeWidth={1.5}
            />

            {/* Outer soft glow */}
            <path
              d={pathD}
              pathLength={100}
              fill="none"
              stroke={`rgba(240,200,100,${(pathP * 0.25).toFixed(3)})`}
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={100}
              strokeDashoffset={dashOffset}
              style={{ filter: 'blur(4px)' }}
            />

            {/* Active golden core path */}
            <path
              d={pathD}
              pathLength={100}
              fill="none"
              stroke={`rgba(248,220,120,${Math.min(0.92, pathP * 1.15).toFixed(3)})`}
              strokeWidth={2.0}
              strokeLinecap="round"
              strokeDasharray={100}
              strokeDashoffset={dashOffset}
              filter="url(#hc-path-glow)"
            />

            {/* Traveling knowledge particle */}
            {particlePos && (
              <g filter="url(#hc-particle-glow)">
                <circle cx={particlePos.x} cy={particlePos.y} r={6} fill="rgba(245,215,100,0.22)" />
                <circle cx={particlePos.x} cy={particlePos.y} r={3} fill="rgba(255,235,160,0.95)" />
                <circle cx={particlePos.x} cy={particlePos.y} r={1.2} fill="white" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export default KnowledgeNetwork;
