import { useEffect, useState, useRef } from "react";
import type { MediaItem } from "@/hooks/services/mediaService";
import { useInView } from "@/hooks/useInView";

/**
 * Public outreach gallery — field photographs and videos uploaded by an admin via
 * Dashboard Media, supplied by the parent. Renders nothing at all when nothing has been
 * uploaded, so the dashboard stays clean until content exists.
 *
 * Upgraded Features:
 *   • Filter bar supporting 'Photographs' and 'Videos' (All Media removed).
 *   • Horizontal sliding carousel track with touch swipe and CSS scroll-snap.
 *   • Bilateral floating chevrons with scroll boundary auto-fade listeners.
 *   • Custom YouTube thumbnail loading with glass play button overlay.
 *   • Enhanced lightbox supporting direct video play & YouTube playback.
 */
export const OutreachGallery = ({
  images = [],
  videos: clips = [],
}: {
  images?: MediaItem[];
  videos?: MediaItem[];
}) => {
  const { ref: galleryRef, isVisible: galleryInView } = useInView();

  const [filter, setFilter] = useState<"all" | "photos" | "videos">("all");
  const [fadingId, setFadingId] = useState<string | null>(null);
  const [active, setActive] = useState<MediaItem | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Normalise collections
  const normalImages = images.map((img) => ({ ...img, kind: "outreach_image" as const }));
  const normalVideos = clips.map((vid) => ({ ...vid, kind: "outreach_video" as const }));
  const allMedia = [...normalImages, ...normalVideos];

  // Filter media based on choice
  const filteredMedia = allMedia.filter((item) => {
    if (filter === "photos") return item.kind === "outreach_image";
    if (filter === "videos") return item.kind === "outreach_video";
    return true;
  });

  const openMedia = (m: MediaItem) => {
    setFadingId(m._id);
    window.setTimeout(() => {
      setActive(m);
      setFadingId(null);
    }, 320);
  };

  const closeLightbox = () => setActive(null);

  const animateScroll = (element: HTMLDivElement, target: number, duration: number) => {
    const start = element.scrollLeft;
    const change = target - start;
    const startTime = performance.now();

    // Temporarily disable scroll snapping to prevent snapping conflicts during JS animation
    const originalSnap = element.style.scrollSnapType;
    element.style.scrollSnapType = "none";

    const easeInOutCubic = (t: number): number => {
      return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    };

    const animate = (currentTime: number) => {
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);
      element.scrollLeft = start + change * easeInOutCubic(progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Restore scroll snapping behavior once transition finishes
        element.style.scrollSnapType = originalSnap || "x mandatory";
      }
    };

    requestAnimationFrame(animate);
  };

  const scrollLeft = () => {
    if (trackRef.current) {
      // Scroll by the full visible width of the carousel track (page-by-page)
      const scrollAmount = trackRef.current.clientWidth;
      const target = Math.max(0, trackRef.current.scrollLeft - scrollAmount);
      animateScroll(trackRef.current, target, 500);
    }
  };

  const scrollRight = () => {
    if (trackRef.current) {
      // Scroll by the full visible width of the carousel track (page-by-page)
      const scrollAmount = trackRef.current.clientWidth;
      const target = Math.min(
        trackRef.current.scrollWidth - trackRef.current.clientWidth,
        trackRef.current.scrollLeft + scrollAmount
      );
      animateScroll(trackRef.current, target, 500);
    }
  };

  const handleScroll = () => {
    if (trackRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = trackRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  const selectFilter = (f: "all" | "photos" | "videos") => {
    setFilter(f);
    if (trackRef.current) {
      trackRef.current.scrollLeft = 0;
    }
    setCanScrollLeft(false);
    setCanScrollRight(true);
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Sync scroll arrows state when filter choice changes
  useEffect(() => {
    const track = trackRef.current;
    if (track) {
      // Small timeout to allow layout rendering before calculating boundaries
      const timer = window.setTimeout(handleScroll, 80);
      track.addEventListener("scroll", handleScroll);
      return () => {
        track.removeEventListener("scroll", handleScroll);
        window.clearTimeout(timer);
      };
    }
  }, [filter, filteredMedia.length]);

  if (!images.length && !clips.length) return null;

  const getFallbackTitle = (item: typeof filteredMedia[0], index: number) => {
    if (item.title) return item.title;
    return item.kind === "outreach_video"
      ? `Field Demonstration Video #${index + 1}`
      : `Punjab Outreach Photograph #${index + 1}`;
  };

  const getFallbackCaption = (item: typeof filteredMedia[0]) => {
    if (item.caption) return item.caption;
    return item.kind === "outreach_video"
      ? "Demonstration of scientific farming practices during field visits."
      : "Captured during field visits and farmer interaction programmes.";
  };

  return (
    <section className="wrap" id="outreach-media" ref={galleryRef}>
      <div className={`outreach-gallery-card anim-head ${galleryInView ? "in-view" : ""}`}>
        {/* Unified Design System Header */}
        <div className="detail-header" style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 28 }}>
          <h3>
            Outreach from the Ground
            <span className="live-pulse-dot" />
          </h3>
          <p>
            Photographs and videos captured during village outreach — demonstrations, farmer
            interactions and field visits.
          </p>
        </div>

        {/* Modern Filter Pill Bar */}
        <div className="media-filter-bar">
          <button
            className={`media-filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => selectFilter("all")}
          >
            All Media ({allMedia.length})
          </button>
          <button
            className={`media-filter-btn ${filter === "photos" ? "active" : ""}`}
            onClick={() => selectFilter("photos")}
          >
            Photographs ({normalImages.length})
          </button>
          <button
            className={`media-filter-btn ${filter === "videos" ? "active" : ""}`}
            onClick={() => selectFilter("videos")}
          >
            Videos ({normalVideos.length})
          </button>
        </div>

        {/* Carousel Wrapper */}
        <div className="media-carousel-wrapper">
          {/* Floating Left Chevron */}
          <button
            className="media-carousel-arrow prev"
            onClick={scrollLeft}
            disabled={!canScrollLeft}
            aria-label="Scroll Left"
          >
            <span className="arrow-icon">‹</span>
          </button>

          {/* Floating Right Chevron */}
          <button
            className="media-carousel-arrow next"
            onClick={scrollRight}
            disabled={!canScrollRight}
            aria-label="Scroll Right"
          >
            <span className="arrow-icon">›</span>
          </button>

          {/* Scroll snap Track */}
          <div
            className="media-carousel-track"
            ref={trackRef}
            onScroll={handleScroll}
          >
            {filteredMedia.map((item, idx) => {
              const title = getFallbackTitle(item, idx);
              const caption = getFallbackCaption(item);

              // Get thumbnail (direct YouTube thumbnail loader)
              const thumbnailUrl = item.kind === "outreach_video"
                ? (item.source === "youtube" ? `https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg` : item.url)
                : item.url;

              return (
                <figure
                  className={`media-card media-card-clickable ${
                    fadingId === item._id ? "media-card-fading" : ""
                  }`}
                  key={item._id}
                  role="button"
                  tabIndex={0}
                  aria-label={title}
                  onClick={() => openMedia(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openMedia(item);
                    }
                  }}
                >
                  <div className="media-card-media">
                    {/* Glassmorphic Badge */}
                    <span className="media-format-badge">
                      {item.kind === "outreach_video" ? "Video" : "Photo"}
                    </span>

                    {/* Cover Image */}
                    <img src={thumbnailUrl} alt={title} loading="lazy" />

                    {/* Custom Overlay Play Button for Videos */}
                    {item.kind === "outreach_video" && (
                      <div className="play-button-overlay">
                        <div className="play-button-icon">
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    )}

                    <div className="media-card-shade" aria-hidden="true" />
                    <div className="media-card-fade" aria-hidden="true" />
                  </div>

                  {/* Caption Below Card */}
                  <figcaption className="media-card-caption-below">
                    <strong>{title}</strong>
                    <span>{caption}</span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lightbox Modal (Supports Images and Videos) */}
      {active && (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={active.title || "Outreach Gallery Preview"}
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="media-lightbox-close"
            onClick={closeLightbox}
            aria-label="Close"
          >
            ×
          </button>
          <figure
            className="media-lightbox-figure"
            onClick={(e) => e.stopPropagation()}
          >
            {active.kind === "outreach_video" ? (
              <div className="media-lightbox-video-container">
                {active.source === "youtube" ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${active.youtubeId}?autoplay=1`}
                    title={active.title || "YouTube video"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video src={active.url} controls autoPlay />
                )}
              </div>
            ) : (
              <img src={active.url} alt={active.title || "Outreach photograph"} />
            )}

            <figcaption className="media-lightbox-caption">
              <strong>{getFallbackTitle(active, 0)}</strong>
              <span>{getFallbackCaption(active)}</span>
            </figcaption>
          </figure>
        </div>
      )}
    </section>
  );
};
