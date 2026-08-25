import React, {
  useRef,
  useEffect,
  useState,
} from 'react';
import {
  Landmark,
  FlaskConical,
  Sprout,
  BookOpen,
  Users,
  ShieldCheck,
  MessageSquare,
  ArrowRight,
  Waves,
} from 'lucide-react';
import './knowledge-river.css';

/* ─── 7 Knowledge Source Verticals ─────────────────────────────────────── */
interface VerticalSource {
  id: string;
  label: string;
  sub: string;
  stat: string;
  Icon: React.FC<{ size?: number; color?: string }>;
  color: string;
  leftPct: number;
}

const VERTICALS: VerticalSource[] = [
  {
    id: 'gov',
    label: 'Government schemes',
    sub: 'Subsidies, MSP, PM-Kisan & national policy guidelines',
    stat: '450+ Schemes',
    Icon: Landmark,
    color: '#eab308',
    leftPct: 10,
  },
  {
    id: 'icar',
    label: 'ICAR research',
    sub: 'Peer-reviewed agronomy, crop pathology & field advisories',
    stat: '100+ Institutes',
    Icon: FlaskConical,
    color: '#f59e0b',
    leftPct: 23,
  },
  {
    id: 'kvk',
    label: 'KVKs & observations',
    sub: 'Real-time soil tests, weather telemetry & ground station logs',
    stat: '731 KVKs',
    Icon: Sprout,
    color: '#fbbf24',
    leftPct: 37,
  },
  {
    id: 'research',
    label: 'Research institutions',
    sub: 'Agronomy, soil physics & climate resilience research papers',
    stat: '126 Zones',
    Icon: BookOpen,
    color: '#fcd34d',
    leftPct: 50,
  },
  {
    id: 'experts',
    label: 'Experts & scientists',
    sub: 'Verified domain agronomists, entomologists & plant doctors',
    stat: '70,741 Refined',
    Icon: Users,
    color: '#fbbf24',
    leftPct: 63,
  },
  {
    id: 'sau',
    label: 'SAUs & institutions',
    sub: 'State Agricultural Universities regional data network',
    stat: '70+ SAUs',
    Icon: ShieldCheck,
    color: '#f59e0b',
    leftPct: 76,
  },
  {
    id: 'conversations',
    label: 'Farmer conversations',
    sub: 'Multilingual ground voice & text queries across 12+ Indian languages',
    stat: '45M+ Collected',
    Icon: MessageSquare,
    color: '#eab308',
    leftPct: 89,
  },
];

export const KnowledgeRootsCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeVertical, setActiveVertical] = useState<string | null>(null);
  const [hasEntered, setHasEntered] = useState(false);
  // Lazy-load flag for the heavy background video (below the fold).
  const [videoReady, setVideoReady] = useState(false);

  // Entrance animation trigger
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !hasEntered) setHasEntered(true); },
      { threshold: 0.05 }
    );
    io.observe(container);
    return () => io.disconnect();
  }, [hasEntered]);

  // Lazy-load the heavy background video: only start fetching the mp4 as the section
  // nears the viewport (rootMargin), so it never competes with the initial page load
  // (noticeable on CDN/Firebase hosting). The poster image is shown until then.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || videoReady) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVideoReady(true); },
      { rootMargin: '400px 0px' }
    );
    io.observe(container);
    return () => io.disconnect();
  }, [videoReady]);

  // Once flagged ready, attach the source and start playback.
  useEffect(() => {
    if (videoReady && videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [videoReady]);

  // Scroll reveal for CTA card
  useEffect(() => {
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const p = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (rect.height + window.innerHeight * 0.3)));
        if (ctaRef.current) {
          ctaRef.current.style.opacity = String(Math.min(1, Math.max(0, (p - 0.15) * 2)));
          ctaRef.current.style.transform = `translateY(${Math.max(0, (0.5 - p) * 36)}px)`;
        }
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => { window.removeEventListener('scroll', handleScroll); if (rafId) cancelAnimationFrame(rafId); };
  }, []);

  return (
    <section className="knowledge-river-section" id="knowledge" ref={containerRef}>

      {/* ── Seamless Looping Background Video (sapta-nadi.mp4) ──────────── */}
      <div className={`kr-bg-landscape${hasEntered ? ' kr-bg-landscape--entered' : ''}`}>
        <video
          ref={videoRef}
          className="kr-bg-video"
          autoPlay
          loop
          muted
          playsInline
          // Don't fetch anything until the section is near the viewport.
          preload={videoReady ? 'auto' : 'none'}
          poster="/sapta_nadi_bg.jpg"
        >
          {videoReady && <source src="/sapta-nadi.mp4" type="video/mp4" />}
        </video>
      </div>

      {/* Atmospheric Overlays */}
      <div className="kr-overlay-vignette" />

      {/* ── 7 Stream Badges Field (Aligned directly to 7 rivers in photo) ── */}
      <div className="kr-badge-stream-field" aria-label="Knowledge Sources Verticals">
        {VERTICALS.map((vert, i) => {
          const { id, label, sub, stat, Icon, color, leftPct } = vert;
          const isSelected = activeVertical === id;

          return (
            <div
              key={id}
              className={`kr-stream-badge-node${isSelected ? ' kr-stream-badge-node--active' : ''}`}
              style={{
                left: `${leftPct}%`,
                '--node-accent': color,
                '--badge-index': i,
              } as React.CSSProperties}
              onMouseEnter={() => setActiveVertical(id)}
              onMouseLeave={() => setActiveVertical(null)}
            >
              <div className="glass-pill kr-stream-pill">
                <span className="kr-source-icon"><Icon size={14} color="#ffffff" /></span>
                <span className="kr-source-label">{label}</span>
              </div>

              {/* Natural golden drop-line extending to stream head in photo */}
              <div className="kr-stream-drop-line" style={{ background: color }} />

              {/* Popover Detail Card on Hover */}
              {isSelected && (
                <div className="kr-source-popover">
                  <div className="kr-popover-header">
                    <Icon size={13} color={color} /><span>{label}</span>
                  </div>
                  <p>{sub}</p>
                  <small style={{ color }}>{stat}</small>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Content Shell ──────────────────────────────────────────────── */}
      <div className="page-shell kr-content-shell">

        {/* Section Header */}
        <div className="kr-header">
          <h2 className="kr-title font-serif text-white text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight drop-shadow-md">
            The Flow of Agricultural Wisdom
          </h2>
        </div>

        {/* ── Centered Glassmorphism CTA Card ───────────────────────────── */}
        <div
          ref={ctaRef}
          className="kr-cta-card-exact glass-card"
          style={{ opacity: 0, transform: 'translateY(40px)' }}
        >
          <div className="sn-cta-eyebrow">
            <Waves size={13} color="#fcd34d" />
            <span>SAPTA NADI PHILOSOPHY · CONFLUENCE OF WISDOM</span>
          </div>

          <h3 className="kr-cta-headline font-serif">
            From thousands of sources.<br />
            One trusted.
          </h3>

          <p className="sn-cta-body">
            In Indian heritage, seven sacred rivers (<em>Sapta Nadi</em>) nourished ancient civilization and brought life to the soil. Today, seven verified streams of agricultural knowledge — from ICAR science and KVK advisories to 45M+ farmer voices — unite into a single intelligence engine.
          </p>

          <a
            className="kr-cta-button-gold"
            href="https://chat.annam.ai/"
            target="_blank"
            rel="noopener noreferrer"
            id="knowledge-river-start-asking"
          >
            <span>Start Asking</span>
            <ArrowRight size={18} />
          </a>
        </div>

      </div>

    </section>
  );
};

export default KnowledgeRootsCanvas;
