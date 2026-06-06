import { useEffect } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";

export function FlyTo({ target }: { target: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyToBounds(target, { padding: [40, 40], duration: 0.9 });
    }
  }, [target, map]);
  return null;
}
