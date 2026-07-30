/* ============================================================
   EXPERT COVERAGE MAP — Leaflet district drill-down for the
   Human Intelligence Network, coloured by experts/users per
   state → district (from the public users data).
   Reuses the shared GeoJSON boundaries + drill-down + map
   controls from the chatbot dashboard's map module.
============================================================ */
import { useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, ArrowLeft, MapPin, Users } from "lucide-react";
import {
  useGeoJson,
  useMapNavigation,
  useIsDark,
} from "@/features/chatbotDashboard/components/map/hooks";
import { FitBounds } from "@/features/chatbotDashboard/components/map/components/MapControls";
import { DISTRICTS } from "@/features/chatbotDashboard/utils/metaData";
import type { PublicUserItem } from "@/hooks/services/publicDashboardService";

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

/** Red → amber → green ramp (matches the "district activity" legend style). */
function colorFor(v: number, min: number, max: number, dark: boolean): string {
  if (v <= 0) return dark ? "#26313a" : "#e9edf0";
  if (max <= min) return "#16a34a";
  const t = (v - min) / (max - min);
  if (t < 0.2) return "#dc2626";
  if (t < 0.4) return "#f97316";
  if (t < 0.65) return "#f59e0b";
  if (t < 0.85) return "#84cc16";
  return "#16a34a";
}

export default function ExpertCoverageMap({
  publicUsers,
}: {
  publicUsers?: PublicUserItem[] | null;
}) {
  const dark = useIsDark();
  const { statesGeo, districtsAll, loading } = useGeoJson();
  const {
    level,
    selectedState,
    selectedDistrict,
    navigateToState,
    navigateToDistrict,
    goToIndia,
    setHovered,
  } = useMapNavigation();

  // Users per state and per (state, district), from preference + kvkCovered coverage.
  const { stateCounts, districtCounts, stateDisplay } = useMemo(() => {
    const st = new Map<string, number>();
    const di = new Map<string, number>();
    const disp = new Map<string, string>();
    for (const u of publicUsers ?? []) {
      if (u.role?.toLowerCase() === "admin") continue;
      const stateSet = new Set<string>();
      const pairSet = new Set<string>();
      const add = (state?: string, district?: string) => {
        const sOrig = (state ?? "").trim();
        const s = sOrig.toLowerCase();
        if (!s || s === "all") return;
        stateSet.add(s);
        if (!disp.has(s)) disp.set(s, sOrig);
        const d = norm(district);
        if (d && d !== "all") pairSet.add(`${s}||${d}`);
      };
      add(u.preference?.state, u.preference?.district);
      for (const k of u.kvkCovered ?? []) add(k.state, k.district);
      for (const s of stateSet) st.set(s, (st.get(s) ?? 0) + 1);
      for (const p of pairSet) di.set(p, (di.get(p) ?? 0) + 1);
    }
    return { stateCounts: st, districtCounts: di, stateDisplay: disp };
  }, [publicUsers]);

  const valueFor = (f: any): number => {
    if (level === "india") return stateCounts.get(norm(f?.properties?.NAME_1)) ?? 0;
    return (
      districtCounts.get(`${norm(selectedState)}||${norm(f?.properties?.NAME_2)}`) ?? 0
    );
  };

  // Active layer: all states at india level, the selected state's districts otherwise.
  const activeGeo = useMemo(() => {
    if (level === "india") return statesGeo as any;
    if (!districtsAll || !selectedState) return null;
    const features = (districtsAll as any).features.filter(
      (f: any) => norm(f?.properties?.NAME_1) === norm(selectedState)
    );
    return { type: "FeatureCollection", features };
  }, [level, statesGeo, districtsAll, selectedState]);

  const { minV, maxV } = useMemo(() => {
    const feats = (activeGeo as any)?.features ?? [];
    const vals = feats.map(valueFor);
    return {
      minV: 0,
      maxV: vals.length ? Math.max(...vals, 0) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGeo, stateCounts, districtCounts]);

  const styleFn = (f: any) => {
    const v = valueFor(f);
    const isSel =
      level !== "india" &&
      norm(f?.properties?.NAME_2) === norm(selectedDistrict);
    return {
      fillColor: colorFor(v, minV, maxV, dark),
      weight: isSel ? 2.5 : 0.8,
      color: isSel ? (dark ? "#ffffff" : "#111827") : dark ? "#0b1a12" : "#ffffff",
      fillOpacity: v > 0 ? 0.82 : 0.32,
    };
  };

  const onEach = (f: any, layer: any) => {
    const isDistrict = level !== "india";
    const name = isDistrict ? f?.properties?.NAME_2 : f?.properties?.NAME_1;
    const v = valueFor(f);
    layer.bindTooltip(
      `<div style="font-weight:600;margin-bottom:2px">${name}</div>` +
        `<div style="font-size:12px">Users: <b>${v}</b></div>`,
      { sticky: true, direction: "top", opacity: 0.96 }
    );
    layer.on({
      click: () => (isDistrict ? navigateToDistrict(name) : navigateToState(name)),
      mouseover: () => setHovered(name),
      mouseout: () => setHovered(null),
    });
  };

  const geoKey = `${level}:${selectedState}:${dark}:${maxV}`;

  const tileUrl = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";

  // Side-panel data for the focused state: every district (from metadata) + its user count.
  const panelDistricts = useMemo(() => {
    if (level === "india" || !selectedState) return [];
    const key = Object.keys(DISTRICTS).find(
      (k) => k.toLowerCase() === norm(selectedState)
    );
    const names = key ? DISTRICTS[key] : [];
    return names
      .map((d) => ({
        name: d,
        users: districtCounts.get(`${norm(selectedState)}||${norm(d)}`) ?? 0,
      }))
      .sort((a, b) => b.users - a.users);
  }, [level, selectedState, districtCounts]);

  const panelStates = useMemo(() => {
    return Array.from(stateCounts.entries())
      .map(([k, users]) => ({ name: stateDisplay.get(k) ?? k, users }))
      .sort((a, b) => b.users - a.users);
  }, [stateCounts, stateDisplay]);

  const focusedStateUsers =
    level !== "india" && selectedState
      ? stateCounts.get(norm(selectedState)) ?? 0
      : 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 300px",
        gap: "14px",
        alignItems: "stretch",
      }}
      className="expert-coverage-map"
    >
      {/* Map */}
      <div
        style={{
          position: "relative",
          height: "520px",
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {loading || !activeGeo ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6b7280",
            }}
          >
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <MapContainer
            center={[22.5, 80]}
            zoom={4}
            zoomControl={false}
            scrollWheelZoom
            style={{ height: "100%", width: "100%", background: "transparent" }}
          >
            <TileLayer url={tileUrl} />
            <GeoJSON
              key={geoKey}
              data={activeGeo as any}
              style={styleFn as any}
              onEachFeature={onEach as any}
            />
            <FitBounds data={activeGeo} trigger={geoKey} />
            <ZoomControl position="bottomright" />
          </MapContainer>
        )}

        {/* Back / breadcrumb overlay */}
        <div
          style={{
            position: "absolute",
            top: "12px",
            left: "12px",
            zIndex: 500,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(255,255,255,0.94)",
            borderRadius: "12px",
            padding: "6px 10px",
            fontSize: "12px",
            fontWeight: 600,
            color: "#173326",
            boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
          }}
        >
          {level !== "india" ? (
            <button
              type="button"
              onClick={goToIndia}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#173326",
                fontWeight: 700,
              }}
            >
              <ArrowLeft size={14} /> Back
            </button>
          ) : (
            <span style={{ opacity: 0.65 }}>Click a state to drill in</span>
          )}
          {level !== "india" && (
            <span>
              India <span style={{ opacity: 0.5 }}>›</span>{" "}
              <span style={{ color: "#245d43" }}>{selectedState}</span>
            </span>
          )}
        </div>
      </div>

      {/* Side panel */}
      <aside
        style={{
          background: "rgba(6, 25, 35, 0.06)",
          border: "1px solid rgba(23,51,38,0.12)",
          borderRadius: "16px",
          padding: "14px",
          overflowY: "auto",
          maxHeight: "520px",
        }}
      >
        {level === "india" ? (
          <>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", color: "#17332699", textTransform: "uppercase", marginBottom: "10px" }}>
              Coverage by State
            </div>
            {panelStates.length === 0 ? (
              <p style={{ fontSize: "12px", color: "#17332680" }}>No user coverage data yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "6px" }}>
                {panelStates.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => navigateToState(s.name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      padding: "8px 10px",
                      borderRadius: "10px",
                      border: "1px solid rgba(23,51,38,0.1)",
                      background: "#ffffff",
                      cursor: "pointer",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      color: "#173326",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <MapPin size={13} /> {s.name}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#245d43" }}>
                      <Users size={13} /> {s.users}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", color: "#17332699", textTransform: "uppercase" }}>
              State details
            </div>
            <div style={{ fontFamily: "Newsreader, serif", fontSize: "20px", fontWeight: 600, color: "#173326", margin: "2px 0 4px" }}>
              {selectedState}
            </div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
              <div style={{ flex: 1, background: "#fff", border: "1px solid rgba(23,51,38,0.1)", borderRadius: "10px", padding: "8px 10px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#17332699", textTransform: "uppercase" }}>Users</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#245d43" }}>{focusedStateUsers}</div>
              </div>
              <div style={{ flex: 1, background: "#fff", border: "1px solid rgba(23,51,38,0.1)", borderRadius: "10px", padding: "8px 10px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#17332699", textTransform: "uppercase" }}>Districts</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#245d43" }}>{panelDistricts.length}</div>
              </div>
            </div>

            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", color: "#17332699", textTransform: "uppercase", marginBottom: "8px" }}>
              Districts in {selectedState}
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              {panelDistricts.map((d) => (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => navigateToDistrict(d.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    border:
                      norm(d.name) === norm(selectedDistrict)
                        ? "1.5px solid #245d43"
                        : "1px solid rgba(23,51,38,0.1)",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#173326",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <MapPin size={13} /> {d.name}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", color: d.users > 0 ? "#245d43" : "#17332666" }}>
                    <Users size={13} /> {d.users}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
