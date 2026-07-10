import { useCallback, useEffect, useRef, useState } from "react";
import { Counter } from "./Counter";

interface Slide {
  title: string;
  tag: string;
  /** Optional photo URL (drop files in /public and reference e.g. "/dashboard/field.jpg").
   *  When absent, the gradient `bg` is used. */
  image?: string;
  bg: string;
  stats: { value: number; suffix?: string; label: string }[];
}

const slides: Slide[] = [
  {
    title: "India's Agricultural Intelligence Infrastructure",
    tag: "Validated, expert-backed advisories for every farmer, in every language.",
    bg: "linear-gradient(135deg, #14532d 0%, #166534 45%, #3f8f4e 100%)",
    stats: [
      { value: 18600000, label: "Questions processed" },
      { value: 4120000, label: "Validated Q&A pairs" },
      { value: 22, label: "Languages supported" },
    ],
  },
  {
    title: "A Nationwide Expert Network",
    tag: "Post-graduate agronomists, KVKs and universities validating every answer.",
    bg: "linear-gradient(135deg, #1b4332 0%, #2d6a4f 45%, #40916c 100%)",
    stats: [
      { value: 3174, label: "Experts engaged" },
      { value: 731, label: "KVKs mapped" },
      { value: 63, label: "SAUs collaborating" },
    ],
  },
  {
    title: "Reaching Every Field",
    tag: "Advisory coverage extending to the last village and the smallest holding.",
    bg: "linear-gradient(135deg, #166534 0%, #15803d 45%, #52b788 100%)",
    stats: [
      { value: 29, label: "States & UTs" },
      { value: 612, label: "Districts covered" },
      { value: 8420, label: "Villages reached" },
    ],
  },
];

const INTERVAL = 5500;

/**
 * Full-bleed hero carousel shown below the header. Each slide carries a headline and a
 * row of live statistics overlaid on a field backdrop (gradient placeholder — swap in a
 * photo via `image`). Auto-advances, pauses on hover, with arrows and dots.
 */
export const HeroCarousel = () => {
  const [index, setIndex] = useState(0);
  const paused = useRef(false);

  const go = useCallback((next: number) => setIndex((next + slides.length) % slides.length), []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!paused.current) setIndex((i) => (i + 1) % slides.length);
    }, INTERVAL);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="carousel"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      aria-roledescription="carousel"
    >
      {slides.map((s, i) => (
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
              {s.stats.map((st) => (
                <div className="cstat" key={st.label}>
                  <div className="n">
                    <Counter value={st.value} suffix={st.suffix} />
                  </div>
                  <div className="l">{st.label}</div>
                </div>
              ))}
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
