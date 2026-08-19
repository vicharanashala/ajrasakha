import React, { type ReactNode, memo, useRef, useState, useEffect, type RefObject } from 'react';
import {
  Play, ArrowRight, ChevronDown, Sprout, ShieldCheck, Lock, Users,
  FlaskConical, GraduationCap, Landmark,
} from 'lucide-react';
import CountUp from 'react-countup';
import { useScrollProgress } from './ScrollContext';
import KnowledgeNetwork from './KnowledgeNetwork';

/* ─── Constants ─────────────────────────────────────────────────────────── */

const CHAPTER_NAMES = ['Dawn', 'Emerge', 'Connect', 'Thrive'];

const CHAPTERS = [
  {
    eyebrow: 'AN IIT ROPAR NATIONAL MISSION',
    headline: <>No farmer should<br /><em>farm alone.</em></>,
    body: 'Connecting every farmer to the wisdom of experts, institutions and the power of trusted agricultural intelligence.',
  },
  {
    eyebrow: 'THE KNOWLEDGE NETWORK',
    headline: <>Research meets<br /><em>real fields.</em></>,
    body: 'Scientists, researchers and institutions collaborate to transform agricultural science into practical, field-ready guidance.',
  },
  {
    eyebrow: 'INTELLIGENCE IN MOTION',
    headline: <>Knowledge flows<br /><em>like light.</em></>,
    body: 'Golden paths of intelligence connect every expert to every farmer — in real time, across every corner of India.',
  },
  {
    eyebrow: 'ANNAM.AI ACE PLATFORM',
    headline: <>One platform.<br /><em>Every farmer.</em></>,
    body: 'Empowering millions with trusted, verified, expert-backed agricultural intelligence — in their language, for their crop, today.',
  },
];

/* ─── Smooth-step helper ──────────────────────────────────────────────────── */
function ss(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * KNOWLEDGE SOURCE BADGES — Curved Arc Layout
 *
 * Distributed in an elegant downward arch (U-curve) across the upper visual area:
 * 1. University: upper-left (left: 4%, top: 14%)
 * 2. Expert Advisor: mid-left (left: 18%, top: 26%)
 * 3. Field Scientist: center-mid (left: 33%, top: 30%)
 * 4. Government Agency: upper-mid-right (left: 49%, top: 16%)
 */
const BADGES = [
  {
    id: 'university',
    title: 'University',
    sub: 'Research Institution',
    Icon: GraduationCap,
    css: { left: '4%', top: '14%' },
    enterStart: 0.18,
    enterEnd: 0.27,
  },
  {
    id: 'expert',
    title: 'Expert Advisor',
    sub: 'Agricultural Extension',
    Icon: Users,
    css: { left: '18%', top: '26%' },
    enterStart: 0.23,
    enterEnd: 0.32,
  },
  {
    id: 'scientist',
    title: 'Field Scientist',
    sub: 'Research & Innovation',
    Icon: FlaskConical,
    css: { left: '33%', top: '30%' },
    enterStart: 0.28,
    enterEnd: 0.37,
  },
  {
    id: 'government',
    title: 'Government Agency',
    sub: 'Policy & Schemes',
    Icon: Landmark,
    css: { left: '49%', top: '16%' },
    enterStart: 0.33,
    enterEnd: 0.42,
  },
] as const;

// Connection activation windows [start, end] per badge (same order as BADGES)
const CONN_WINDOWS: [number, number][] = [
  [0.40, 0.54],
  [0.48, 0.62],
  [0.56, 0.70],
  [0.64, 0.78],
];

const TRUST_PILLARS = [
  { Icon: ShieldCheck, label: 'Trusted', sub: 'Expert verified' },
  { Icon: Lock,        label: 'Inclusive', sub: 'Every language' },
  { Icon: Users,       label: 'Impactful', sub: 'Better outcomes' },
  { Icon: Sprout,      label: 'Sustainable', sub: 'For tomorrow' },
];

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface MetricItem {
  value: ReactNode;
  label: string;
  icon: React.FC<{ size?: number }>;
}

interface HeroOverlayProps {
  metrics: MetricItem[];
  onWatchStory: () => void;
}

/* ─── Main Overlay ───────────────────────────────────────────────────────── */
const HeroOverlay: React.FC<HeroOverlayProps> = memo(({ metrics, onWatchStory }) => {
  const { progress, chapter } = useScrollProgress();
  const ch = chapter;

  const [livePulseCount, setLivePulseCount] = useState(12843);

  useEffect(() => {
    const timer = setInterval(() => {
      setLivePulseCount((prev) => prev + Math.floor(Math.random() * 3) + 1);
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  // Refs for dynamic SVG coordinate measurement
  const layoutRef = useRef<HTMLDivElement>(null);
  const badge0Ref = useRef<HTMLDivElement>(null);
  const badge1Ref = useRef<HTMLDivElement>(null);
  const badge2Ref = useRef<HTMLDivElement>(null);
  const badge3Ref = useRef<HTMLDivElement>(null);
  const farmerBadgeRef = useRef<HTMLDivElement>(null);

  // Stable array of badge refs for KnowledgeNetwork (index matches BADGES order)
  const badgeRefList = useRef([badge0Ref, badge1Ref, badge2Ref, badge3Ref]).current;
  const badgeDomRefs = useRef([badge0Ref, badge1Ref, badge2Ref, badge3Ref]).current;

  const chData = CHAPTERS[ch - 1] ?? CHAPTERS[0];

  // Farmer entrance (scroll 0.08–0.22)
  const farmerP = ss(0.08, 0.22, progress);
  const farmerY = 60 * (1 - farmerP);
  const farmerOpacity = farmerP;
  const farmerScale = 0.97 + 0.03 * farmerP;

  // Right panel content reveals
  const eyebrowOpacity = ss(0.10, 0.22, progress);
  const headlineOpacity = ss(0.16, 0.30, progress);
  const bodyOpacity = ss(0.25, 0.38, progress);
  const ctaOpacity = ss(0.32, 0.44, progress);

  // Visibility flags
  const showScrollCue = ch === 1 && progress < 0.08;
  const showTrust = ch === 4 && progress > 0.92;
  const showFarmerBadge = progress >= 0.15;
  const showConnIndicator = ch === 3;
  const networkVisible = progress >= 0.38;
  const allConnected = progress >= 0.76;

  return (
    <>
      {/* ── 1. Chapter progress bar ── */}
      <div className="hc-chapter-bar">
        {CHAPTER_NAMES.map((name, i) => (
          <div
            key={name}
            className={`hc-chapter-pip${ch === i + 1 ? ' hc-chapter-pip--active' : ''}`}
          />
        ))}
        <span className="hc-chapter-label">{CHAPTER_NAMES[ch - 1]}</span>
      </div>

      {/* ── 2. Visual stage container (reference for SVG coords) ── */}
      <div className="hc-visual-stage" ref={layoutRef}>

        {/* ── 3. Knowledge Network SVG — lines connect to Ramesh Kumar badge ── */}
        {networkVisible && (
          <KnowledgeNetwork
            progress={progress}
            badgeRefs={badgeRefList}
            phoneRef={farmerBadgeRef}
            containerRef={layoutRef}
          />
        )}

        {/* ── 4. Knowledge Source Badges (Curved Arch Layout) ── */}
        {BADGES.map(({ id, title, sub, Icon, css, enterStart, enterEnd }, i) => {
          const badgeP = ss(enterStart, enterEnd, progress);
          const [cStart, cEnd] = CONN_WINDOWS[i] ?? [1, 1];
          const connActive = progress >= cStart && progress <= cEnd + 0.12;

          return (
            <div
              key={id}
              ref={badgeDomRefs[i]}
              className={`hc-badge${connActive ? ' hc-badge--conn-active' : ''}`}
              style={{
                ...css,
                opacity: badgeP,
                transform: `translateY(${(20 * (1 - badgeP)).toFixed(1)}px) scale(${(0.88 + 0.12 * badgeP).toFixed(3)})`,
                pointerEvents: badgeP > 0.5 ? 'auto' : 'none',
              }}
            >
              <span className="hc-badge-role" />
              <div className="hc-badge-icon-wrap">
                <Icon size={14} />
              </div>
              <div className="hc-badge-text">
                <strong>{title}</strong>
                <span>{sub}</span>
              </div>
            </div>
          );
        })}

        {/* ── 5. Farmer figure ── */}
        <div
          className="hc-farmer-wrapper"
          style={{
            opacity: farmerOpacity,
            transform: `translateY(${farmerY.toFixed(1)}px) scale(${farmerScale.toFixed(3)})`,
          }}
        >
          <img
            src="/assets/farmer.png"
            alt="Farmer using ANNam.AI on smartphone"
            className="hc-farmer-img"
            draggable={false}
          />
          <div className="hc-farmer-shadow" aria-hidden="true" />
        </div>

        {/* ── 6. Farmer Ramesh Kumar Badge (The Convergence Destination) ── */}
        <div
          ref={farmerBadgeRef}
          className={`hc-farmer-label${showFarmerBadge ? ' hc-farmer-label--visible' : ''}${allConnected ? ' hc-farmer-label--connected' : ''}`}
        >
          <div className="hc-farmer-label-icon">
            <Sprout size={14} color="#f0d27b" />
          </div>
          <div>
            <div className="hc-farmer-label-text">Ramesh Kumar · Farmer</div>
            <div className="hc-farmer-label-sub">Sugarcane · Maharashtra</div>
          </div>
        </div>

        {/* ── 7. Intelligence flowing indicator (Chapter 3) ── */}
        <div className={`hc-connection-indicator${showConnIndicator ? ' hc-connection-indicator--visible' : ''}`}>
          <span className="hc-connection-indicator-dot" />
          <span className="hc-connection-indicator-text">Intelligence flowing</span>
        </div>

        {/* ── 8. Live Knowledge Pulse Card ── */}
        <div className="hc-pulse-card">
          <div className="hc-pulse-head">
            <span className="live-dot" />
            <span>LIVE KNOWLEDGE PULSE</span>
          </div>
          <strong className="hc-pulse-count">
            <CountUp end={livePulseCount} duration={1.2} separator="," preserveValue />
          </strong>
          <small className="hc-pulse-sub">validated updates today</small>
        </div>

      </div>{/* end .hc-visual-stage */}

      {/* ── 8. Right content panel ── */}
      <div className="hc-content-panel">
        <div className="hc-content-card">

          <div className="hc-eyebrow" style={{ opacity: eyebrowOpacity }}>
            <span className="hc-eyebrow-dot" />
            <span className="hc-eyebrow-text">{chData.eyebrow}</span>
          </div>

          <h1
            key={`headline-ch${ch}`}
            className="hc-headline hc-headline--enter"
            style={{ opacity: headlineOpacity }}
          >
            {chData.headline}
          </h1>

          <p
            key={`body-ch${ch}`}
            className="hc-body hc-body--enter"
            style={{ opacity: bodyOpacity }}
          >
            {chData.body}
          </p>

          <div className="hc-divider" />

          <div className="hc-buttons" style={{ opacity: ctaOpacity }}>
            <button
              type="button"
              className="hc-btn-primary"
              onClick={onWatchStory}
              id="hero-watch-story"
            >
              <span className="hc-btn-icon">
                <Play size={12} fill="currentColor" />
              </span>
              Watch the story
            </button>
            <a href="#knowledge" className="hc-btn-secondary" id="hero-explore-mission">
              Explore mission
              <ArrowRight size={13} />
            </a>
          </div>

          {/* Trust strip */}
          <div className={`hc-trust${showTrust ? ' hc-trust--visible' : ''}`}>
            {TRUST_PILLARS.map(({ Icon, label, sub }, i) => (
              <div
                key={label}
                className="hc-trust-item"
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <span className="hc-trust-icon"><Icon size={13} /></span>
                <span className="hc-trust-text">
                  <strong>{label}</strong>
                  <small>{sub}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 9. Horizontal 8 Metrics Bar — Visible on Initial Page Load ── */}
      <div className="hc-metrics-bar">
        {metrics.map(({ value, label, icon: Icon }, i) => {
          const raw = typeof value === 'string' ? value : null;
          const numMatch = raw?.match(/^([\d,]+)/);
          const numVal = numMatch ? parseInt(numMatch[1].replace(/,/g, ''), 10) : null;
          const suffix = raw && numMatch ? raw.slice(numMatch[0].length) : '';

          return (
            <div key={label} className="hc-metric-item">
              <span className="hc-metric-icon">
                <Icon size={16} />
              </span>
              <div className="hc-metric-info">
                <strong>
                  {numVal != null ? (
                    <CountUp
                      end={numVal}
                      duration={2.0}
                      separator=","
                      suffix={suffix}
                      delay={i * 0.05}
                      useEasing
                    />
                  ) : (
                    value
                  )}
                </strong>
                <small>{label}</small>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 10. Scroll cue ── */}
      <div className={`hc-scroll-cue${!showScrollCue ? ' hc-scroll-cue--hidden' : ''}`}>
        <span className="hc-scroll-cue-label">Scroll to explore</span>
        <span className="hc-scroll-cue-arrow">
          <ChevronDown size={14} />
        </span>
      </div>
    </>
  );
});

HeroOverlay.displayName = 'HeroOverlay';
export default HeroOverlay;
