import { useEffect } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";

export function FitBounds({ data, trigger }: { data: any; trigger: any }) {
  const map = useMap();
  useEffect(() => {
    if (!data || !data.features?.length) return;
    try {
      const layer = L.geoJSON(data);
      const b = layer.getBounds();
      if (b.isValid()) {
        map.fitBounds(b, { padding: [30, 30], animate: true, duration: 0.6 });
      }
    } catch {}
  }, [trigger, data, map]);
  return null;
}
