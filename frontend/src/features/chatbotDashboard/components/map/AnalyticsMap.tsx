import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  ZoomControl,
} from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowLeft,
  Search,
  X,
  MapPin,
  Building2,
  Users,
  Sprout,
  Layers,
  Activity,
  Loader2,
  ChevronRight,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { useClosedAndNotifedData } from "../../hooks/useActiveUsersAnalytics";
import { useUserDetails, type PaginatedUserDetailsResponse } from "../../hooks/useUserDetails";
import { useQueryClient } from "@tanstack/react-query";

/* ============================================================
   TYPES
============================================================ */
type LevelKey = "india" | "state" | "district";

interface Analytics {
  questions: number;
  answers: number;
  users: number;
  activeUsers: number;
  coordinators: number;
  closureHrs: number;
}

interface Village {
  id: string;
  name: string;
  block: string;
  kvk: string;
  analytics: Analytics;
}

interface DistrictDetails {
  blocks: string[];
  villages: Village[];
  kvk: string;
}

interface FeatureProps {
  name: string;
  parent?: string;
  analytics: Analytics;
}

interface Crumb {
  level: LevelKey;
  name: string;
  stateName?: string;
}

/* ============================================================
   THEME HOOK
============================================================ */
function useIsDark() {
  const [dark, setDark] = useState(
    typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/* ============================================================
   SEEDED MOCK DATA
============================================================ */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

function mockAnalytics(seed: string): Analytics {
  const r = seeded(seed);
  const users = Math.floor(r() * 80000) + 2000;
  const questions = Math.floor(r() * 6000) + 200;
  return {
    users,
    activeUsers: Math.floor(users * (0.2 + r() * 0.5)),
    questions,
    answers: Math.floor(questions * (0.6 + r() * 0.35)),
    coordinators: Math.floor(r() * 120) + 8,
    closureHrs: Math.floor(r() * 60) + 2,
  };
}

const BLOCK_PREFIXES = [
  "North",
  "South",
  "East",
  "West",
  "Central",
  "Upper",
  "Lower",
];
const VILLAGE_SUFFIXES = [
  "pur",
  "gaon",
  "ganj",
  "wadi",
  "halli",
  "palli",
  "nagar",
  "kheda",
];
const VILLAGE_ROOTS = [
  "Rama",
  "Krishna",
  "Shiv",
  "Lakshmi",
  "Surya",
  "Govind",
  "Bharat",
  "Anand",
  "Megh",
  "Chand",
  "Vijay",
  "Prem",
];

function mockDistrictDetails(districtName: string): DistrictDetails {
  const r = seeded(districtName);
  const blockCount = 4 + Math.floor(r() * 5);
  const blocks = Array.from(
    { length: blockCount },
    (_, i) =>
      `${BLOCK_PREFIXES[i % BLOCK_PREFIXES.length]} ${districtName} Block`,
  );
  const villageCount = 12 + Math.floor(r() * 12);
  const villages: Village[] = Array.from({ length: villageCount }, (_, i) => {
    const root = VILLAGE_ROOTS[Math.floor(r() * VILLAGE_ROOTS.length)];
    const suf = VILLAGE_SUFFIXES[Math.floor(r() * VILLAGE_SUFFIXES.length)];
    const id = `${districtName}-v-${i}`;
    return {
      id,
      name: `${root}${suf}`,
      block: blocks[i % blockCount],
      kvk: `KVK ${districtName}`,
      analytics: mockAnalytics(id),
    };
  });
  return { blocks, villages, kvk: `KVK ${districtName}` };
}

/* ============================================================
   GEOJSON FETCHERS
============================================================ */
const STATES_URL =
  "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson";
const DISTRICTS_URL =
  "https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson";

let statesCache: any = null;
let districtsCache: any = null;

async function fetchStates() {
  if (statesCache) return statesCache;
  const res = await fetch(STATES_URL);
  statesCache = await res.json();
  return statesCache;
}
async function fetchDistricts() {
  if (districtsCache) return districtsCache;
  const res = await fetch(DISTRICTS_URL);
  districtsCache = await res.json();
  return districtsCache;
}

/* ============================================================
   COLOR (theme aware via CSS variable accent)
============================================================ */
function colorFor(value: number, min: number, max: number, dark: boolean) {
  if (max === min) return dark ? "#3b82f6" : "#60a5fa";
  const t = (value - min) / (max - min);
  // Blue → cyan → green ramp; tune lightness per theme
  const ramp = dark
    ? ["#1e3a8a", "#1d4ed8", "#0ea5e9", "#06b6d4", "#10b981"]
    : ["#dbeafe", "#93c5fd", "#3b82f6", "#0ea5e9", "#0891b2"];
  if (t < 0.2) return ramp[0];
  if (t < 0.4) return ramp[1];
  if (t < 0.65) return ramp[2];
  if (t < 0.85) return ramp[3];
  return ramp[4];
}

/* ============================================================
   FIT BOUNDS
============================================================ */
function FitBounds({ data, trigger }: { data: any; trigger: any }) {
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

function FlyTo({ target }: { target: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyToBounds(target, { padding: [40, 40], duration: 0.9 });
    }
  }, [target, map]);
  return null;
}

/* ============================================================
   STAT CARD
============================================================ */
function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent/40">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="mt-1 text-xl font-semibold text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}

const fmt = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : `${n}`;

/* ============================================================
   MAIN
============================================================ */
export default function IndiaAnalyticsMap({source, userType, questionStatusData, todayActiveFarmersData}: {source: string, userType: string, questionStatusData: any; todayActiveFarmersData: PaginatedUserDetailsResponse}) {
  const dark = useIsDark();

  const [statesGeo, setStatesGeo] = useState<any>(null);
  const [districtsAll, setDistrictsAll] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [level, setLevel] = useState<LevelKey>("india");
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [flyTarget, setFlyTarget] = useState<L.LatLngBoundsExpression | null>(
    null,
  );

    const [questionStatusDateRange, setQuestionStatusDateRange] = useState<
      DateRange | undefined
    >(undefined);


      const getISOStringsForDateRange = useCallback((range?: DateRange) => {
        if (!range || !range.from)
          return { startTime: undefined, endTime: undefined };
    
        const startTime = new Date(range.from);
        startTime.setHours(0, 0, 0, 0);
    
        const endDate = range.to ? new Date(range.to) : new Date(range.from);
        const endTime = new Date(endDate);
        const now = new Date();
        const isSelectedToday =
          endDate.getFullYear() === now.getFullYear() &&
          endDate.getMonth() === now.getMonth() &&
          endDate.getDate() === now.getDate();
    
        if (isSelectedToday) {
          endTime.setHours(
            now.getHours(),
            now.getMinutes(),
            now.getSeconds(),
            now.getMilliseconds(),
          );
        } else {
          endTime.setHours(23, 59, 59, 999);
        }
        return {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        };
      }, []);

          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
        
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);
            const { data: allUsers } = useUserDetails(
          undefined,
          undefined,
            1,
            1,
            "",
            source as any,
            "",
            "",
            "all",
            false,
            false,
            userType as any,
            "totalQuestions",
            "desc",
            false,
            undefined,
            true
          )

  // Initial load
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([fetchStates(), fetchDistricts()])
      .then(([s, d]) => {
        if (!mounted) return;
        setStatesGeo(s);
        setDistrictsAll(d);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  // Attach analytics to states
  const statesWithData = useMemo(() => {
    if (!statesGeo) return null;
    return {
      ...statesGeo,
      features: statesGeo.features.map((f: any) => ({
        ...f,
        properties: {
          ...f.properties,
          _name: f.properties.NAME_1,
          _analytics: mockAnalytics(`state:${f.properties.NAME_1}`),
        },
      })),
    };
  }, [statesGeo]);

  // Filter districts by selected state
  const districtsOfState = useMemo(() => {
    if (!districtsAll || !selectedState) return null;
    const features = districtsAll.features
      .filter((f: any) => f.properties.NAME_1 === selectedState)
      .map((f: any) => ({
        ...f,
        properties: {
          ...f.properties,
          _name: f.properties.NAME_2,
          _parent: f.properties.NAME_1,
          _analytics: mockAnalytics(
            `dist:${f.properties.NAME_1}:${f.properties.NAME_2}`,
          ),
        },
      }));
    return { type: "FeatureCollection", features };
  }, [districtsAll, selectedState]);

  // Active geo to render
  const activeGeo =
    level === "india"
      ? statesWithData
      : level === "state"
        ? districtsOfState
        : districtsOfState;

  // District details (blocks/villages/KVK)
  const districtDetails = useMemo(
    () => (selectedDistrict ? mockDistrictDetails(selectedDistrict) : null),
    [selectedDistrict],
  );

  // Min/max for color ramp
  const [minV, maxV] = useMemo(() => {
    if (!activeGeo) return [0, 1];
    const arr = activeGeo.features.map(
      (f: any) => f.properties._analytics.questions,
    );
    return [Math.min(...arr), Math.max(...arr)];
  }, [activeGeo]);

  // Style + events
  const styleFn = useCallback(
    (feat: any): L.PathOptions => {
      const v = feat.properties._analytics.questions;
      const name = feat.properties._name;
      const isHovered = hovered === name;
      const isSelected =
        (level === "india" && selectedState === name) ||
        (level !== "india" && selectedDistrict === name);
      return {
        fillColor: colorFor(v, minV, maxV, dark),
        fillOpacity: isSelected ? 0.95 : isHovered ? 0.85 : 0.7,
        color: dark ? "#0f172a" : "#ffffff",
        weight: isSelected ? 2.5 : isHovered ? 2 : 1,
      };
    },
    [hovered, minV, maxV, dark, level, selectedState, selectedDistrict],
  );

  const onEach = useCallback(
    (feat: any, layer: L.Layer) => {
      const name = feat.properties._name;
      const a: Analytics = feat.properties._analytics;
      const tip = `
        <div style="font-family: inherit; min-width: 160px;">
          <div style="font-weight:600; margin-bottom:4px;">${name}</div>
          <div style="display:flex;justify-content:space-between;font-size:12px;opacity:.85;">
            <span>Questions</span><span><b>${a.questions.toLocaleString()}</b></span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;opacity:.85;">
            <span>Users</span><span><b>${a.users.toLocaleString()}</b></span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;opacity:.85;">
            <span>Active</span><span><b>${a.activeUsers.toLocaleString()}</b></span>
          </div>
        </div>`;
      (layer as L.Path).bindTooltip(tip, {
        sticky: true,
        className: "india-tooltip",
      });
      layer.on({
        mouseover: () => setHovered(name),
        mouseout: () => setHovered((h) => (h === name ? null : h)),
        click: () => {
          if (level === "india") {
            setSelectedState(name);
            setLevel("state");
            setSelectedDistrict(null);
          } else {
            setSelectedDistrict(name);
            // fly to clicked district
            const b = (layer as any).getBounds?.();
            if (b) setFlyTarget(b);
          }
        },
      });
    },
    [level],
  );

  // GeoJSON key forces re-render on level/state change
  const geoKey = `${level}:${selectedState ?? ""}:${dark ? "d" : "l"}:${minV}-${maxV}:${selectedDistrict ?? ""}`;

  /* SEARCH */
  type SearchHit = {
    type: "state" | "district" | "village" | "block" | "kvk";
    label: string;
    sub: string;
    onSelect: () => void;
  };

  const searchHits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !statesWithData) return [];
    const hits: SearchHit[] = [];
    // States
    statesWithData.features.forEach((f: any) => {
      if (f.properties._name.toLowerCase().includes(q) && hits.length < 30) {
        hits.push({
          type: "state",
          label: f.properties._name,
          sub: "State",
          onSelect: () => {
            setSelectedState(f.properties._name);
            setSelectedDistrict(null);
            setLevel("state");
            const b = L.geoJSON(f).getBounds();
            if (b.isValid()) setFlyTarget(b);
          },
        });
      }
    });
    // Districts
    if (districtsAll) {
      districtsAll.features.forEach((f: any) => {
        if (f.properties.NAME_2.toLowerCase().includes(q) && hits.length < 60) {
          hits.push({
            type: "district",
            label: f.properties.NAME_2,
            sub: `District · ${f.properties.NAME_1}`,
            onSelect: () => {
              setSelectedState(f.properties.NAME_1);
              setSelectedDistrict(f.properties.NAME_2);
              setLevel("state");
              const b = L.geoJSON(f).getBounds();
              if (b.isValid()) setFlyTarget(b);
            },
          });
        }
      });
      // Villages / blocks / kvk under currently visible district list
      // Build a small index by sampling: when a state is selected, include its districts' details
      const targetState = selectedState;
      if (targetState) {
        const stateDistricts = districtsAll.features.filter(
          (f: any) => f.properties.NAME_1 === targetState,
        );
        for (const d of stateDistricts) {
          const dn = d.properties.NAME_2;
          const det = mockDistrictDetails(dn);
          det.villages.forEach((v) => {
            if (hits.length >= 80) return;
            if (v.name.toLowerCase().includes(q)) {
              hits.push({
                type: "village",
                label: v.name,
                sub: `Village · ${dn}`,
                onSelect: () => {
                  setSelectedDistrict(dn);
                  setLevel("state");
                  const b = L.geoJSON(d).getBounds();
                  if (b.isValid()) setFlyTarget(b);
                },
              });
            }
          });
          det.blocks.forEach((bl) => {
            if (hits.length >= 100) return;
            if (bl.toLowerCase().includes(q)) {
              hits.push({
                type: "block",
                label: bl,
                sub: `Block · ${dn}`,
                onSelect: () => {
                  setSelectedDistrict(dn);
                  setLevel("state");
                  const b = L.geoJSON(d).getBounds();
                  if (b.isValid()) setFlyTarget(b);
                },
              });
            }
          });
          if (det.kvk.toLowerCase().includes(q) && hits.length < 110) {
            hits.push({
              type: "kvk",
              label: det.kvk,
              sub: `KVK · ${dn}`,
              onSelect: () => {
                setSelectedDistrict(dn);
                setLevel("state");
                const b = L.geoJSON(d).getBounds();
                if (b.isValid()) setFlyTarget(b);
              },
            });
          }
        }
      }
    }
    return hits.slice(0, 12);
  }, [query, statesWithData, districtsAll, selectedState]);

  /* BREADCRUMBS */
  const crumbs: Crumb[] = useMemo(() => {
    const c: Crumb[] = [{ level: "india", name: "India" }];
    if (selectedState)
      c.push({ level: "state", name: selectedState, stateName: selectedState });
    if (selectedDistrict)
      c.push({
        level: "district",
        name: selectedDistrict,
        stateName: selectedState ?? undefined,
      });
    return c;
  }, [selectedState, selectedDistrict]);

  const goCrumb = (idx: number) => {
    if (idx === 0) {
      setLevel("india");
      setSelectedState(null);
      setSelectedDistrict(null);
    } else if (idx === 1) {
      setLevel("state");
      setSelectedDistrict(null);
    }
  };

  /* AGGREGATES FOR SIDEBAR */
  const stateAnalytics = useMemo(() => {
    if (!selectedState || !statesWithData) return null;
    const f = statesWithData.features.find(
      (x: any) => x.properties._name === selectedState,
    );
    return f?.properties._analytics as Analytics | undefined;
  }, [selectedState, statesWithData]);

  const districtAnalytics = useMemo(() => {
    if (!selectedDistrict || !districtsOfState) return null;
    const f = districtsOfState.features.find(
      (x: any) => x.properties._name === selectedDistrict,
    );
    return f?.properties._analytics as Analytics | undefined;
  }, [selectedDistrict, districtsOfState]);

  /* TILE LAYER */
  const tileUrl = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
  const tileAttr =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

  return (
    <div className="flex h-[calc(100vh-2rem)] min-h-[640px] gap-4 p-4">
      {/* Local styles for leaflet/tooltips */}
      <style>{`
        .leaflet-container { background: transparent !important; font-family: inherit; }
        .india-tooltip {
          background: var(--popover) !important;
          color: var(--popover-foreground) !important;
          border: 1px solid var(--border) !important;
          border-radius: 10px !important;
          padding: 8px 10px !important;
          box-shadow: 0 10px 30px rgba(0,0,0,.18) !important;
        }
        .india-tooltip::before { display:none !important; }
        .leaflet-control-zoom {
          border: 1px solid var(--border) !important;
          border-radius: 10px !important;
          overflow: hidden;
          box-shadow: 0 4px 14px rgba(0,0,0,.08) !important;
        }
        .leaflet-control-zoom a {
          background: var(--card) !important;
          color: var(--card-foreground) !important;
          border-bottom: 1px solid var(--border) !important;
        }
        .leaflet-control-zoom a:hover { background: var(--accent) !important; }
        .leaflet-control-attribution {
          background: color-mix(in oklab, var(--card) 80%, transparent) !important;
          color: var(--muted-foreground) !important;
          border-radius: 6px !important;
        }
        .leaflet-control-attribution a { color: var(--foreground) !important; }
      `}</style>

      {/* LEFT: Map panel */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          {level !== "india" && (
            <button
              onClick={() => goCrumb(level === "state" ? 0 : 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <button
                  onClick={() => goCrumb(i)}
                  disabled={i === crumbs.length - 1}
                  className={
                    i === crumbs.length - 1
                      ? "rounded-md bg-primary px-2 py-0.5 text-primary-foreground"
                      : "rounded-md px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }
                >
                  {c.name}
                </button>
              </span>
            ))}
          </nav>

          <div className="ml-auto relative">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search state, district, village, block, KVK…"
                className="w-72 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button onClick={() => setQuery("")}>
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            {searchHits.length > 0 && (
              <div className="absolute right-0 z-[1000] mt-1 max-h-80 w-96 overflow-auto rounded-xl border border-border bg-popover shadow-2xl">
                {searchHits.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      h.onSelect();
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate text-popover-foreground">
                      {h.label}
                    </span>
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {h.sub}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="relative flex-1">
          {loading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground shadow">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading India map…
              </div>
            </div>
          )}
          <MapContainer
            center={[22.5, 80]}
            zoom={5}
            minZoom={4}
            maxZoom={11}
            zoomControl={false}
            style={{ height: "100%", width: "100%", background: "transparent" }}
            scrollWheelZoom
          >
            <TileLayer url={tileUrl} attribution={tileAttr} />
            <ZoomControl position="bottomright" />
            {activeGeo && (
              <>
                <GeoJSON
                  key={geoKey}
                  data={activeGeo as any}
                  style={styleFn as any}
                  onEachFeature={onEach}
                />
                <FitBounds data={activeGeo} trigger={geoKey} />
              </>
            )}
            <FlyTo target={flyTarget} />
          </MapContainer>

          {/* Legend */}
          <div className="pointer-events-none absolute left-3 bottom-3 z-[400] rounded-xl border border-border bg-card/95 p-3 text-xs shadow backdrop-blur">
            <div className="mb-1 font-medium text-foreground">
              Questions asked
            </div>
            <div className="flex h-2 w-44 overflow-hidden rounded">
              {[0.1, 0.3, 0.5, 0.75, 1].map((t, i) => (
                <div
                  key={i}
                  className="flex-1"
                  style={{
                    background: colorFor(
                      minV + (maxV - minV) * t,
                      minV,
                      maxV,
                      dark,
                    ),
                  }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-muted-foreground">
              <span>{fmt(minV)}</span>
              <span>{fmt(maxV)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Detail panel */}
      <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            {level === "india"
              ? "Country overview"
              : level === "state" && !selectedDistrict
                ? "State details"
                : "District details"}
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            {selectedDistrict ?? selectedState ?? "India"}
          </h2>
          {selectedState && (
            <p className="text-xs text-muted-foreground">
              {selectedDistrict
                ? `${selectedState} · District`
                : "Click any district on the map to drill down"}
            </p>
          )}
          {!selectedState && (
            <p className="text-xs text-muted-foreground">
              Click any state on the map to view its districts
            </p>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-4">
          {/* Stats */}
          {(() => {
            const a =
              districtAnalytics ??
              stateAnalytics ??
              (statesWithData
                ? statesWithData.features.reduce(
                    (acc: Analytics, f: any) => {
                      const x: Analytics = f.properties._analytics;
                      return {
                        questions: acc.questions + x.questions,
                        answers: acc.answers + x.answers,
                        users: acc.users + x.users,
                        activeUsers: acc.activeUsers + x.activeUsers,
                        coordinators: acc.coordinators + x.coordinators,
                        closureHrs: acc.closureHrs + x.closureHrs,
                      };
                    },
                    {
                      questions: 0,
                      answers: 0,
                      users: 0,
                      activeUsers: 0,
                      coordinators: 0,
                      closureHrs: 0,
                    },
                  )
                : null);
            if (!a) return null;
            return (
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  label="Questions"
                  value={fmt(questionStatusData?.closedVsTotalQuestions.totalQuestions)}
                  icon={<Activity className="h-3.5 w-3.5" />}
                />
                <StatCard
                  label="Answers"
                  value={fmt(questionStatusData?.closedVsTotalQuestions.closedQuestions)}
                  icon={<Activity className="h-3.5 w-3.5" />}
                />
                <StatCard
                  label="Users"
                  value={fmt(allUsers.totalUsers)}
                  icon={<Users className="h-3.5 w-3.5" />}
                />
                <StatCard
                  label="Active"
                  value={fmt(todayActiveFarmersData.totalUsers)}
                  icon={<Users className="h-3.5 w-3.5" />}
                />
                <StatCard
                  label="Coordinators"
                  value={fmt(todayActiveFarmersData.userRoleCounts?.coordinator)}
                  icon={<Building2 className="h-3.5 w-3.5" />}
                />
                <StatCard
                  label="Avg closure"
                  value={`${districtAnalytics || stateAnalytics ? a.closureHrs : ((questionStatusData?.closedVsTotalQuestions?.avgCloseTimeMinutes)/60).toFixed(2)}h`}
                  icon={<Activity className="h-3.5 w-3.5" />}
                />
              </div>
            );
          })()}

                        {/* <div className="grid grid-cols-2 gap-2">
                <StatCard
                  label="Questions"
                  value={fmt(questionStatusData?.closedVsTotalQuestions.totalQuestions)}
                  icon={<Activity className="h-3.5 w-3.5" />}
                />
                <StatCard
                  label="Answers"
                  value={fmt(questionStatusData?.closedVsTotalQuestions.closedQuestions)}
                  icon={<Activity className="h-3.5 w-3.5" />}
                />
                <StatCard
                  label="Users"
                  value={fmt(allUsers.totalUsers)}
                  icon={<Users className="h-3.5 w-3.5" />}
                />
                <StatCard
                  label="Active"
                  value={fmt(todayActiveFarmersData.totalUsers)}
                  icon={<Users className="h-3.5 w-3.5" />}
                />
                <StatCard
                  label="Coordinators"
                  value={fmt(todayActiveFarmersData.userRoleCounts?.coordinator)}
                  icon={<Building2 className="h-3.5 w-3.5" />}
                />
                <StatCard
                  label="Avg closure"
                  value={`${districtAnalytics || stateAnalytics ? a.closureHrs : ((questionStatusData?.closedVsTotalQuestions?.avgCloseTimeMinutes)/60).toFixed(2)}h`}
                  icon={<Activity className="h-3.5 w-3.5" />}
                />
              </div> */}

          {/* Drill content */}
          {!selectedState && statesWithData && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Top states by questions
              </h3>
              <ul className="space-y-1">
                {[...statesWithData.features]
                  .sort(
                    (a: any, b: any) =>
                      b.properties._analytics.questions -
                      a.properties._analytics.questions,
                  )
                  .slice(0, 8)
                  .map((f: any) => (
                    <li key={f.properties._name}>
                      <button
                        onClick={() => {
                          setSelectedState(f.properties._name);
                          setLevel("state");
                          const b = L.geoJSON(f).getBounds();
                          if (b.isValid()) setFlyTarget(b);
                        }}
                        className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-accent"
                      >
                        <span className="flex items-center gap-2 text-foreground">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {f.properties._name}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {fmt(f.properties._analytics.questions)}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {selectedState && !selectedDistrict && districtsOfState && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Districts in {selectedState}
              </h3>
              <ul className="space-y-1">
                {districtsOfState.features.map((f: any) => (
                  <li key={f.properties._name}>
                    <button
                      onClick={() => {
                        setSelectedDistrict(f.properties._name);
                        const b = L.geoJSON(f).getBounds();
                        if (b.isValid()) setFlyTarget(b);
                      }}
                      className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-accent"
                    >
                      <span className="flex items-center gap-2 text-foreground">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {f.properties._name}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmt(f.properties._analytics.questions)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedDistrict && districtDetails && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> Blocks (
                  {districtDetails.blocks.length})
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {districtDetails.blocks.map((b) => (
                    <span
                      key={b}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Sprout className="h-3.5 w-3.5" /> Villages (
                  {districtDetails.villages.length})
                </h3>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {districtDetails.villages.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between gap-2 bg-background px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">
                          {v.name}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {v.block}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {fmt(v.analytics.users)} users
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> Krishi Vigyan Kendra (KVK)
                </h3>
                <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-3 text-sm">
                  <div className="font-medium text-foreground">
                    {districtDetails.kvk}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Primary extension center for {selectedDistrict}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
