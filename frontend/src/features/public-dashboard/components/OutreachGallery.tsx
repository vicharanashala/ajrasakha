import { useEffect, useState } from "react";
import type { MediaItem } from "@/hooks/services/mediaService";
import { useInView } from "@/hooks/useInView";

/**
 * Public outreach gallery — field photographs and videos uploaded by an admin via
 * Dashboard Media, supplied by the parent. Renders nothing at all when nothing has been
 * uploaded, so the dashboard stays clean until content exists.
 *
 * Visuals (matched to the Syngenta-style reference):
 *   • Caption is overlaid on the bottom-left of each photograph with a black gradient
 *     behind it for legibility (no longer sits below the image).
 *   • On click, the photograph fades to black, then opens a centred lightbox preview
 *     with the full-resolution image and the same caption text. The lightbox fades in
 *     and out, and clicking the backdrop or pressing Esc closes it.
 *
 * Entrance + hover animations (lift, Ken-Burns zoom, staggered reveal) are unchanged —
 * see `public-dashboard.css` for `.media-card`, `.media-card-media` and `.card-grid-anim`.
 */
export const OutreachGallery = ({
  images = [],
  videos: clips = [],
}: {
  images?: MediaItem[];
  videos?: MediaItem[];
}) => {
  const { ref: galleryRef, isVisible: galleryInView } = useInView();

  // `fadingId` drives a brief black overlay on the clicked card before the lightbox
  // opens, giving the "fade to black" transition feel.
  const [fadingId, setFadingId] = useState<string | null>(null);
  // `active` is the media item currently shown in the lightbox.
  const [active, setActive] = useState<MediaItem | null>(null);

  const openMedia = (m: MediaItem) => {
    setFadingId(m._id);
    // Match the CSS `media-card-fade` duration (~320 ms) before swapping to the lightbox.
    window.setTimeout(() => {
      setActive(m);
      setFadingId(null);
    }, 320);
  };

  const closeLightbox = () => setActive(null);

  // Allow Esc to dismiss the lightbox. We do this in an effect rather than during render
  // because `window` doesn't exist during SSR and writing `onkeydown` from inside a render
  // triggers React's render-phase side-effect warnings.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // closeLightbox is stable (it just calls setActive(null)), so we only re-bind when
    // `active` toggles — that's all we care about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!images.length && !clips.length) return null;

  return (
    <section className="wrap" id="outreach-media" ref={galleryRef}>
      <div className={`sec-head mt-10 anim-head${galleryInView ? " in-view" : ""}`}>
        {/* <span className="sec-num">FIELD</span> */}
        <h2>Outreach from the Ground</h2>
      </div>
      <p className={`sec-desc anim-head${galleryInView ? " in-view" : ""}`}>
        Photographs and videos captured during village outreach — demonstrations, farmer
        interactions and field visits.
      </p>

      {clips.length > 0 && (
        <>
          <div
            className={`eyebrow anim-head${galleryInView ? " in-view" : ""}`}
            style={{ marginBottom: 12, transitionDelay: "0.05s" }}
          >
            FIELD VIDEOS
          </div>
          <div
            className={`media-grid card-grid-anim${galleryInView ? " in-view" : ""}`}
            style={{ marginBottom: images.length ? 28 : 0 }}
          >
            {clips.map((v) => (
              <figure className="media-card" key={v._id}>
                {v.source === "youtube" ? (
                  // Embeds keep their 16:9 frame; the card still lifts/reveals via .media-card.
                  <div className="media-card-media media-card-media-video">
                    <iframe
                      src={`https://www.youtube.com/embed/${v.youtubeId}`}
                      title={v.title || "YouTube video"}
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  // Uploaded video gets the same framed box + Ken-Burns hover zoom as photos.
                  <div className="media-card-media media-card-media-video">
                    <video src={v.url} controls preload="metadata" />
                  </div>
                )}
                {(v.title || v.caption) && (
                  <figcaption className="media-card-caption-below">
                    {v.title && <strong>{v.title}</strong>}
                    {v.caption && <span>{v.caption}</span>}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </>
      )}

      {images.length > 0 && (
        <>
          <div
            className={`eyebrow anim-head${galleryInView ? " in-view" : ""}`}
            style={{ marginBottom: 12, transitionDelay: "0.05s" }}
          >
            FIELD PHOTOGRAPHS
          </div>
          <div className={`media-grid card-grid-anim${galleryInView ? " in-view" : ""}`}>
            {images.map((m) => (
              <figure
                className={`media-card media-card-clickable${
                  fadingId === m._id ? " media-card-fading" : ""
                }`}
                key={m._id}
                role="button"
                tabIndex={0}
                aria-label={m.title || "View outreach photograph"}
                onClick={() => openMedia(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openMedia(m);
                  }
                }}
              >
                <div className="media-card-media">
                  <img src={m.url} alt={m.title || "Outreach photograph"} loading="lazy" />

                  {/* Black gradient at the bottom for caption legibility */}
                  <div className="media-card-shade" aria-hidden="true" />

                  {/* Caption overlay — sits on top of the image, bottom-left.
                      We always render the wrapper so the card height stays consistent,
                      but hide it visually if there is no caption text. */}
                  {(m.title || m.caption) && (
                    <figcaption className="media-card-caption">
                      {m.title && <strong>{m.title}</strong>}
                      {m.caption && <span>{m.caption}</span>}
                    </figcaption>
                  )}

                  {/* Black fade overlay — animated in on click before the lightbox opens */}
                  <div className="media-card-fade" aria-hidden="true" />
                </div>
              </figure>
            ))}
          </div>
        </>
      )}

      {/* Lightbox — full-resolution preview with the same caption.
          The wrapper fades in/out; the close button is a clear pill in the corner. */}
      {active && (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={active.title || "Outreach photograph"}
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
            <img src={active.url} alt={active.title || "Outreach photograph"} />
            {(active.title || active.caption) && (
              <figcaption className="media-lightbox-caption">
                {active.title && <strong>{active.title}</strong>}
                {active.caption && <span>{active.caption}</span>}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </section>
  );
};
