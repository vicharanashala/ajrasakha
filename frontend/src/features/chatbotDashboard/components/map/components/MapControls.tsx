/* ============================================================
   MAP CONTROLS - Map zoom and fly-to helpers
============================================================ */

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";

/* ============================================================
   FIT BOUNDS - Automatically fit map to GeoJSON data
============================================================ */

interface FitBoundsProps {
  data: unknown;
  trigger: unknown;
}

export function FitBounds({ data, trigger }: FitBoundsProps) {
  const map = useMap();
  useEffect(() => {
    if (!data || !((data as { features?: unknown[] }).features?.length)) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer = L.geoJSON(data as any);
      const b = layer.getBounds();
      if (b.isValid()) {
        map.fitBounds(b, { padding: [30, 30], animate: true, duration: 0.6 });
      }
    } catch {
      // Silently fail for invalid GeoJSON
    }
  }, [trigger, data, map]);
  return null;
}

/* ============================================================
   FLY TO - Smoothly animate map to target bounds
============================================================ */

interface FlyToProps {
  target: L.LatLngBoundsExpression | null;
}

export function FlyTo({ target }: FlyToProps) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyToBounds(target, { padding: [40, 40], duration: 0.9 });
    }
  }, [target, map]);
  return null;
}