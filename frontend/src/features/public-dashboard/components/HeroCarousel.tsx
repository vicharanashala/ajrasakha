import { useCallback, /* useEffect, */ useRef, useState } from "react";
import { AnimatedStatValue } from "./AnimatedStatValue";
import { InlineLoader } from "./InlineLoader";
import type { MediaItem } from "@/hooks/services/mediaService";

interface Slide {
  title: string;
  tag: string;
  /** Optional photo URL (drop files in /public and reference e.g. "/dashboard/field.jpg").
   *  When absent, the gradient `bg` is used. */
  image?: string;
  bg: string;
  /** A numeric value counts up; a string renders as typed (e.g. "22+", "18.6M"). */
  stats: { value: number | string; suffix?: string; label: string; loading?: boolean }[];
}

/** An admin-edited headline figure — BOTH the label and the value come from the content. */
export interface CarouselStatItem {
  label: string;
  value: string;
}

/**
 * The figures overlaid on the slides. The two question counts are live (from
 * /dashboard/stats); the rest are admin-edited headline figures (from /dashboard/content),
 * where the admin controls the label as well as the value — so a stat renamed in Edit
 * Dashboard shows the new wording here too.
 */
export interface CarouselStats {
  /** Every question in the collection, any status. String (e.g. "—") = placeholder while loading. */
  totalQuestions: number | string;
  /** Questions in a closed state (closed / dynamic_closed / duplicate_closed). */
  validatedQAPairs: number | string;
  /** Questions that entered the DB today / this month (IST) — moved here from the header ticker. */
  questionsToday: number | string;
  questionsThisMonth: number | string;
  languages: CarouselStatItem;
  experts: CarouselStatItem;
  kvks: CarouselStatItem;
  saus: CarouselStatItem;
  states: CarouselStatItem;
  districts: CarouselStatItem;
  villages: CarouselStatItem;
}

// Per-slide background images — distinct agriculture scenes for each of the 5 slides
const SLIDE_IMAGES = [
  "https://www.global-agriculture.com/wp-content/uploads/2026/04/Untitled-1-copy-35-390x205.jpg", // paddy
  "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1400&q=80",                    // wheat field
  "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1400&q=80",                    // farming village
  "https://images.unsplash.com/photo-1586771107445-d3ca888129ff?w=1400&q=80",                    // farmer with phone
  "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=1400&q=80",                    // vegetable market
];

const buildSlides = (live: CarouselStats, loading = false): Slide[] => [
  {
    title: "India's Agricultural Intelligence Infrastructure",
    tag: "Validated, expert-backed advisories for every farmer, in every language.",
    image: SLIDE_IMAGES[0],
    bg: "linear-gradient(135deg, #14532d 0%, #166534 45%, #3f8f4e 100%)",
    stats: [
      // All four are DB-derived → show a spinner until stats load.
      { value: live.questionsToday, label: "Questions received today", loading },
      { value: live.questionsThisMonth, label: "This month", loading },
      { value: live.validatedQAPairs, label: "Validated Q&A pairs", loading },
      { value: live.totalQuestions, label: "Questions processed", loading },
    ],
  },
  {
    title: "A Nationwide Expert Network",
    tag: "Post-graduate agronomists, KVKs and universities validating every answer.",
    image: SLIDE_IMAGES[1],
    bg: "linear-gradient(135deg, #1b4332 0%, #2d6a4f 45%, #40916c 100%)",
    stats: [
      { value: live.experts.value, label: live.experts.label },
      { value: live.kvks.value, label: live.kvks.label },
      { value: live.saus.value, label: live.saus.label },
    ],
  },
  {
    title: "Reaching Every Field",
    tag: "Advisory coverage extending to the last village and the smallest holding.",
    image: SLIDE_IMAGES[2],
    bg: "linear-gradient(135deg, #166534 0%, #15803d 45%, #52b788 100%)",
    stats: [
      { value: live.states.value, label: live.states.label },
      { value: live.districts.value, label: live.districts.label },
      { value: live.villages.value, label: live.villages.label },
      { value: live.languages.value, label: live.languages.label },
    ],
  },
 /* {
    title: "AI-Powered Advisory in Every Language",
    tag: "Voice, WhatsApp and web — answering farmers in Hindi, Tamil, Telugu and 19 more.",
    image: SLIDE_IMAGES[3],
    bg: "linear-gradient(135deg, #0f4c2a 0%, #1a6b3c 45%, #2d9e5f 100%)",
    stats: [
      { value: "22+", label: "Languages supported" },
      { value: "3", label: "Delivery channels" },
      { value: "98%", label: "Query resolution rate" },
    ],
  },
  {
    title: "From Farm Gate to Market",
    tag: "Connecting validated crop advisories to real-time mandi prices and market demand.",
    image: SLIDE_IMAGES[4],
    bg: "linear-gradient(135deg, #1c3d2e 0%, #256b43 45%, #3a9e66 100%)",
    stats: [
      { value: "6,200+", label: "Mandis integrated" },
      { value: "186K", label: "Price queries resolved" },
      { value: "4.1M", label: "Expert-validated answers" },
    ],
  },*/
];

// const INTERVAL = 5000;

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
  loading = false,
  activeIndex,
  setActiveIndex,
}: {
  stats: CarouselStats;
  images?: MediaItem[];
  loading?: boolean;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
}) => {
  const index = activeIndex;
  const setIndex = setActiveIndex;
  // const [progressKey, setProgressKey] = useState(0); // increments to restart the CSS animation
  const paused = useRef(false);

  const slides = buildSlides(stats, loading);
  const slideCount = slides.length;

  const effectiveSlides = slides.map((s, i) => ({
    ...s,
    image: images.length ? images[i % images.length].url : s.image,
  }));

  const go = useCallback(
    (next: number) => {
      setIndex((next + slideCount) % slideCount);
      // setProgressKey((k) => k + 1); // restart progress bar
    },
    [slideCount],
  );

  const handleTabClick = (idx: number, sectionId: string) => {
    setIndex(idx);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  /* Commented out auto-play useEffect to keep the carousel static and interactive via buttons only
  useEffect(() => {
    const id = setInterval(() => {
      if (!paused.current) {
        setIndex((i) => (i + 1) % slideCount);
        setProgressKey((k) => k + 1);
      }
    }, INTERVAL);
    return () => clearInterval(id);
  }, [slideCount]);
  */

  return (
    <div
      className="carousel"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      aria-roledescription="carousel"
    >
      {/* Commented out carousel slide loop to keep hero static and support scroll anchors */}
      {/* effectiveSlides.map((s, i) => ( */}
        <div
          className="carousel-slide active"
        >
          {/* Commented out per-slide dynamic background to keep the 1st image only (prompt image which is the 3rd image)
          <div
            className="carousel-bg"
            style={{
              backgroundImage: s.image ? `url(${s.image})` : s.bg,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          */}
          {/* Commented out static background image layer to use video instead
          <div
            className="carousel-bg"
            style={{
              backgroundImage: `url(${effectiveSlides[0]?.image || SLIDE_IMAGES[0]})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          */}
          {/* Static background video layer with matching green field poster fallback */}
          <video
            className="carousel-bg-video"
            autoPlay
            loop
            muted
            playsInline
            poster="/greenland.png"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
            }}
          >
            <source src="/background.mp4" type="video/mp4" />
            <source src="https://assets.mixkit.co/videos/preview/mixkit-farmer-walking-in-a-field-of-green-crops-42289-large.mp4" type="video/mp4" />
          </video>
          <div className="carousel-overlay" />
          <div className="carousel-content">
            <h2> The Agricultural Cognitive Ecosystem</h2>
            <p className="tag">India's public agricultural intelligence infrastructure. It turns Kisan Call Centre transcripts and expert-validated Q&A into a trusted, multilingual advisory layer for every farmer.</p>

            {/* Three interactive animated buttons to view the different metric slices */}
            <div className="metrics-toggle-container">
              <button
                className={`metrics-toggle-btn ${index === 0 ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTabClick(0, "sec-details-container");
                }}
              >
                ⚡ Intelligence
              </button>
              <button
                className={`metrics-toggle-btn ${index === 1 ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTabClick(1, "sec-details-container");
                }}
              >
                👥 Expert Network
              </button>
              <button
                className={`metrics-toggle-btn ${index === 2 ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTabClick(2, "sec-details-container");
                }}
              >
                🌍 Outreach & Coverage
              </button>
            </div>

            {/* Commented out transparent cards under tabs in the Hero Section for layout updates
            <div className="carousel-stats">
              {s.stats.map((st) => (
                // AnimatedStatValue handles the numeric/free-text split ("22" counts up,
                // "22+" renders as typed) and flags live changes with a delta chip.
                <div className="cstat" key={st.label}>
                  <div className="n">
                    {st.loading ? (
                      <InlineLoader size={26} />
                    ) : (
                      <AnimatedStatValue value={st.value} suffix={st.suffix} />
                    )}
                  </div>
                  <div className="l">{st.label}</div>
                </div>
              ))}
            </div>
            */}
          </div>
        </div>
      {/* ))} */}

      {/* Commented out navigation arrows for the new static metrics toggle buttons UI
      <button className="carousel-arrow prev" onClick={() => go(index - 1)} aria-label="Previous slide" />
      <button className="carousel-arrow next" onClick={() => go(index + 1)} aria-label="Next slide" />
      */}

      {/* Commented out progress bar for the static UI
      <div key={progressKey} className="carousel-progress running" />
      */}

      {/* Commented out carousel indicator dots in favor of the three interactive buttons
      <div className="carousel-dots">
        {slides.map((_, i) => (
          <button
            key={i}
            className={`dot${i === index ? " active" : ""}`}
            onClick={() => go(i)}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
      */}
    </div>
  );
};
