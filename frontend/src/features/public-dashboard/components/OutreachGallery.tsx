import type { MediaItem } from "@/hooks/services/mediaService";

/**
 * Public outreach gallery — field photographs and videos uploaded by an admin via
 * Dashboard Media, supplied by the parent. Renders nothing at all when nothing has been
 * uploaded, so the dashboard stays clean until content exists.
 */
export const OutreachGallery = ({
  images = [],
  videos: clips = [],
}: {
  images?: MediaItem[];
  videos?: MediaItem[];
}) => {
  if (!images.length && !clips.length) return null;

  return (
    <section className="wrap" id="outreach-media">
      <div className="sec-head mt-10">
        {/* <span className="sec-num">FIELD</span> */}
        <h2>Outreach from the Ground</h2>
      </div>
      <p className="sec-desc">
        Photographs and videos captured during village outreach — demonstrations, farmer
        interactions and field visits.
      </p>

      {clips.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            FIELD VIDEOS
          </div>
          <div className="media-grid" style={{ marginBottom: images.length ? 28 : 0 }}>
            {clips.map((v) => (
              <figure className="media-card" key={v._id}>
                <video src={v.url} controls preload="metadata" />
                {(v.title || v.caption) && (
                  <figcaption>
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
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            FIELD PHOTOGRAPHS
          </div>
          <div className="media-grid">
            {images.map((m) => (
              <figure className="media-card" key={m._id}>
                <img src={m.url} alt={m.title || "Outreach photograph"} loading="lazy" />
                {(m.title || m.caption) && (
                  <figcaption>
                    {m.title && <strong>{m.title}</strong>}
                    {m.caption && <span>{m.caption}</span>}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </>
      )}
    </section>
  );
};
