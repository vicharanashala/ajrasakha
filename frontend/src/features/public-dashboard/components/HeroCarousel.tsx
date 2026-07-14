import { useCallback, useEffect, useRef, useState } from "react";
import { Counter } from "./Counter";
import type { MediaItem } from "@/hooks/services/mediaService";

interface Slide {
  title: string;
  tag: string;
  /** Optional photo URL (drop files in /public and reference e.g. "/dashboard/field.jpg").
   *  When absent, the gradient `bg` is used. */
  image?: string;
  bg: string;
  /** A numeric value counts up; a string renders as typed (e.g. "22+", "18.6M"). */
  stats: { value: number | string; suffix?: string; label: string }[];
}

/**
 * The figures overlaid on the slides. The two question counts are live (from
 * /dashboard/stats); the rest are admin-edited headline figures (from /dashboard/content)
 * and are therefore free text, which may not be numeric.
 */
export interface CarouselStats {
  /** Every question in the collection, any status. */
  totalQuestions: number;
  /** Questions in a closed state (closed / dynamic_closed / duplicate_closed). */
  validatedQAPairs: number;
  languagesSupported: string;
  expertsEngaged: string;
  kvksMapped: string;
  sausCollaborating: string;
}

// Temporary: all three slides share one image. Swap per-slide later.
// Resolves from /public → save the file at frontend/public/carousel-paddy.jpg
const HERO_IMAGE = "https://www.global-agriculture.com/wp-content/uploads/2026/04/Untitled-1-copy-35-390x205.jpg";

const buildSlides = (live: CarouselStats): Slide[] => [
  {
    title: "India's Agricultural Intelligence Infrastructure",
    tag: "Validated, expert-backed advisories for every farmer, in every language.",
    image: HERO_IMAGE,
    bg: "linear-gradient(135deg, #14532d 0%, #166534 45%, #3f8f4e 100%)",
    stats: [
      { value: live.totalQuestions, label: "Questions processed" },
      { value: live.validatedQAPairs, label: "Validated Q&A pairs" },
      { value: live.languagesSupported, label: "Languages supported" },
    ],
  },
  {
    title: "A Nationwide Expert Network",
    tag: "Post-graduate agronomists, KVKs and universities validating every answer.",
    image: HERO_IMAGE,
    bg: "linear-gradient(135deg, #1b4332 0%, #2d6a4f 45%, #40916c 100%)",
    stats: [
      { value: live.expertsEngaged, label: "Experts engaged" },
      { value: live.kvksMapped, label: "KVKs mapped" },
      { value: live.sausCollaborating, label: "SAUs collaborating" },
    ],
  },
  {
    title: "Reaching Every Field",
    tag: "Advisory coverage extending to the last village and the smallest holding.",
    image: HERO_IMAGE,
    bg: "linear-gradient(135deg, #166534 0%, #15803d 45%, #52b788 100%)",
    stats: [
      { value: 29, label: "States & UTs" },
      { value: 612, label: "Districts covered" },
      { value: 8420, label: "Villages reached" },
    ],
  },
];

const INTERVAL = 5000;

/**
 * Full-bleed hero carousel shown below the header. Each slide carries a headline and a
 * row of statistics overlaid on a field backdrop. Auto-advances, pauses on hover, with
 * arrows and dots.
 *
 * Presentational: `stats` (the live figures on the first slide) and `images` (the
 * admin-uploaded photos, which override the built-in backdrops cyclically) both come from
 * the parent.
 */
export const HeroCarousel = ({
  stats,
  images = [],
}: {
  stats: CarouselStats;
  images?: MediaItem[];
}) => {
  const [index, setIndex] = useState(0);
  const paused = useRef(false);

  const slides = buildSlides(stats);
  const slideCount = slides.length;

  const effectiveSlides = slides.map((s, i) => ({
    ...s,
    image: images.length ? images[i % images.length].url : s.image,
  }));

  const go = useCallback(
    (next: number) => setIndex((next + slideCount) % slideCount),
    [slideCount],
  );

  useEffect(() => {
    const id = setInterval(() => {
      if (!paused.current) setIndex((i) => (i + 1) % slideCount);
    }, INTERVAL);
    return () => clearInterval(id);
  }, [slideCount]);

  return (
    <div
      className="carousel"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      aria-roledescription="carousel"
    >
      {effectiveSlides.map((s, i) => (
        <div
          key={i}
          className={`carousel-slide${i === index ? " active" : ""}`}
          style={{ backgroundImage: s.image ? `url(${s.image})` : s.bg }}
          aria-hidden={i !== index}
        >
          <div className="carousel-overlay" />
          <div className="carousel-content">
            <h2>{s.title}</h2>
            <p className="tag">{s.tag}</p>
            <div className="carousel-stats">
              {s.stats.map((st) => {
                // Admin-edited figures are free text: "22" counts up, "22+" is shown as typed.
                const n = Number(String(st.value).replace(/,/g, ""));
                const isNumeric = String(st.value).trim() !== "" && Number.isFinite(n);
                return (
                  <div className="cstat" key={st.label}>
                    <div className="n">
                      {isNumeric ? (
                        <Counter value={n} suffix={st.suffix} />
                      ) : (
                        <span className="mono">{st.value}</span>
                      )}
                    </div>
                    <div className="l">{st.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      <button className="carousel-arrow prev" onClick={() => go(index - 1)} aria-label="Previous slide">
        ‹
      </button>
      <button className="carousel-arrow next" onClick={() => go(index + 1)} aria-label="Next slide">
        ›
      </button>

      <div className="carousel-dots">
        {slides.map((_, i) => (
          <button
            key={i}
            className={`dot${i === index ? " active" : ""}`}
            onClick={() => setIndex(i)}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
