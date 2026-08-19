import React, { type ReactNode } from 'react';
import ScrollTimeline from './ScrollTimeline';
import HeroOverlay from './HeroOverlay';
import HeroVideoBackground from './HeroVideoBackground';
import './hero-cinematic.css';

export interface CinematicHeroProps {
  heroMetrics: {
    value: ReactNode;
    label: string;
    icon: React.FC<{ size?: number }>;
  }[];
  onWatchStory: () => void;
}

/**
 * CinematicHero — Cinematic scroll-driven story.
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────┐
 * │  VIDEO (absolute, fills 100vh × 100vw, loops continuously)  │
 * │  VIGNETTE (cinematic overlay, multiply blend)               │
 * │  CONNECTION SVG (paths from badges → phone)                 │
 * │  FARMER PNG (lower-left, enters on scroll)                  │
 * │  BADGES (4 knowledge sources, staggered entry)              │
 * │  RIGHT CONTENT PANEL (chapter text + metrics + trust)       │
 * └──────────────────────────────────────────────────────────────┘
 */
const CinematicHero: React.FC<CinematicHeroProps> = ({
  heroMetrics,
  onWatchStory,
}) => {
  return (
    <section
      className="hero-cinematic"
      id="overview"
      aria-label="Hero — scroll to experience the story"
    >
      <ScrollTimeline>
        {/* Layer 1: Background video — continuous loop, never scroll-scrubbed */}
        <HeroVideoBackground />

        {/* Layer 2: Cinematic vignette overlay */}
        <div className="hc-vignette" aria-hidden="true" />

        {/* Layer 3: All floating overlays (badges, farmer, SVG paths, content) */}
        <div className="hc-layout">
          <HeroOverlay
            metrics={heroMetrics}
            onWatchStory={onWatchStory}
          />
        </div>
      </ScrollTimeline>
    </section>
  );
};

export default CinematicHero;
