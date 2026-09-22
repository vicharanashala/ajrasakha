// @ts-nocheck
import { useEffect, useRef, useState } from "react";

// Duplicate, synced horizontal scrollbar for a wide table — the browser's own scrollbar sits at
// the very bottom of `containerRef`'s content, which for a long table (a page's worth of rows) is
// scrolled far out of view; this renders a second scrollbar right above the table (inside the same
// bordered box, immediately below the toolbar) so it's always reachable without scrolling down
// first. `containerRef` must point at the table's own `overflow-x-auto` element. Two-way synced via
// scroll listeners, guarded by `drivingRef` so each side's own scroll event doesn't re-trigger the
// other and loop.
export default function TopScrollbar({ containerRef }) {
  const stripRef = useRef(null);
  const [contentWidth, setContentWidth] = useState(0);
  const drivingRef = useRef(null); // "strip" | "container" | null

  useEffect(() => {
    const container = containerRef.current;
    const table = container?.querySelector("table");
    if (!container || !table) return undefined;
    const update = () => setContentWidth(table.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(table);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  // Runs once on mount, same as the effect above — but this one used to depend on the strip DOM
  // node already existing, and the strip was conditionally rendered (`if (contentWidth <= 0)
  // return null`, below) until the first effect's measurement landed. That meant this effect's
  // very first (and only, given the stable `containerRef` dependency) run always found
  // `stripRef.current` still null and bailed out — no listeners ever got attached, so dragging the
  // strip did nothing while the real scrollbar worked fine. Fixed by always rendering the strip
  // (see below) so the ref is there from this component's first render.
  useEffect(() => {
    const container = containerRef.current;
    const strip = stripRef.current;
    if (!container || !strip) return undefined;
    const onContainerScroll = () => {
      if (drivingRef.current === "strip") return;
      drivingRef.current = "container";
      strip.scrollLeft = container.scrollLeft;
      drivingRef.current = null;
    };
    const onStripScroll = () => {
      if (drivingRef.current === "container") return;
      drivingRef.current = "strip";
      container.scrollLeft = strip.scrollLeft;
      drivingRef.current = null;
    };
    container.addEventListener("scroll", onContainerScroll);
    strip.addEventListener("scroll", onStripScroll);
    return () => {
      container.removeEventListener("scroll", onContainerScroll);
      strip.removeEventListener("scroll", onStripScroll);
    };
  }, [containerRef]);

  return (
    <div
      ref={stripRef}
      className="overflow-x-auto overflow-y-hidden rounded-t-lg border border-b-0 border-border"
      style={{ height: 14 }}
    >
      <div style={{ width: contentWidth, height: 1 }} />
    </div>
  );
}
