/* ============================================================
   ANALYTICS MAP - Main component for India map visualization
   Uses custom hooks for separation of concerns
============================================================ */

import { useCallback, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, ZoomControl } from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2 } from "lucide-react";

// Hooks
import {
  useIsDark,
  useGeoJson,
  useMapNavigation,
  useMapAnalytics,
  useMapSearch,
} from "./hooks";

// Lib imports
import type { Analytics, GeoFeature, SearchHit } from "./lib/types";
import { colorFor } from "./lib/colors";

// Component imports
import { FitBounds, FlyTo } from "./components/MapControls";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { SearchBar } from "./components/SearchBar";
import { MapLegend } from "./components/MapLegend";
import { DetailSidebar } from "./components/DetailSidebar";
import { useAllStatesandUserData } from "./hooks/useMapAnalytics";
import { useStateWiseAnalytics } from "../../hooks/useStateQueryData";
import { useClosedAndNotifedData } from "../../hooks/useActiveUsersAnalytics";
import { se } from "date-fns/locale";

/* ============================================================
   MAIN COMPONENT
============================================================ */
export default function IndiaAnalyticsMap({
  source,
  userType,
  todayActiveFarmersData,
}: any) {
  // Hooks

  const [metric, setMetric] = useState<"questions" | "users" | "activeUsers">(
    "questions",
  );

    const [status, setStatus] = useState<string | null>(null);



  

  const dark = useIsDark();
  const { statesGeo, districtsAll, loading } = useGeoJson();
  const { data: questionStatusData } = useClosedAndNotifedData(
    source,
    userType,
    undefined,
    undefined,
  );
  const {
    level,
    selectedState,
    selectedStateCode,
    selectedDistrict,
    hovered,
    setHovered,
    goCrumb,
    navigateToState,
    navigateToDistrict,
    crumbs,
  } = useMapNavigation();

  // console.log(selectedState);

  // console.log(selectedStateCode);

  const {
    data: allStatesData,
    isLoading,
    isFetching,
  } = useAllStatesandUserData({
    source: source as string,
    userType: userType as string,
    enabled: true,
  });

  // console.log("All state data", allStatesData);

  const { data: districtAnalytics } = useStateWiseAnalytics(
    selectedState ?? undefined,
    selectedStateCode,
    source,
    userType,
  );

  // console.log("Analytics of all state", allStatesData)
  // console.log("District analytics of data", districtAnalytics)

  const { statesWithData, districtsOfState, activeGeo, minV, maxV } =
    useMapAnalytics({
      statesGeo,
      districtsAll,
      level,
      selectedState,
      selectedDistrict,
      allStatesData,
      districtAnalytics,
      metric,
    });

  // Fly target state
  const [flyTarget, setFlyTarget] = useState<L.LatLngBoundsExpression | null>(
    null,
  );
  const state = selectedState;
  // const {data: stateAndUserData} = useMapandUserData({state, source, userType})

  // Fly to helper
  const handleFlyTo = useCallback((feature: unknown) => {
    const b = L.geoJSON(feature as Parameters<typeof L.geoJSON>[0]).getBounds();
    if (b.isValid()) setFlyTarget(b);
  }, []);

  // Search hook - must be before handlers that use search
  const { query, hits, search } = useMapSearch({
    statesWithData,
    districtsAll,
    selectedState,
    onNavigateToState: navigateToState,
    onNavigateToDistrict: navigateToDistrict,
    onFlyTo: handleFlyTo,
  });

  // Search handlers - use search from the hook above
  const handleSearchChange = (val: string) => search(val);
  const handleSearchSelect = (hit: SearchHit) => hit.onSelect();

  // Selection handlers
  const handleSelectState = useCallback(
    (name: string, feature: GeoFeature) => {
      const stateData = allStatesData?.find((s) => s.state === name);

      navigateToState(name, stateData.stateCode);
      handleFlyTo(feature);
    },
    [navigateToState, handleFlyTo],
  );

  const handleSelectDistrict = useCallback(
    (name: string, feature: GeoFeature) => {
      navigateToDistrict(name);
      handleFlyTo(feature);
    },
    [navigateToDistrict, handleFlyTo],
  );

  // Style + events
  const styleFn = useCallback(
    (feat: {
      properties: { _analytics: Analytics; _name: string };
    }): L.PathOptions => {
      const analytics = feat.properties._analytics;

      const v =
        metric === "users"
          ? analytics.users
          : metric === "activeUsers"
            ? analytics.activeUsers
            : analytics.questions;
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
    [hovered, minV, maxV, dark, level, selectedState, selectedDistrict, metric],
  );

  const onEach = useCallback(
    (
      feat: { properties: { _name: string; _analytics: Analytics } },
      layer: L.Layer,
    ) => {
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
            const stateData = allStatesData?.find((s) => s.state === name);
            navigateToState(name, stateData?.stateCode);

            const bounds = (layer as L.Polygon).getBounds?.();

            if (bounds) {
              setFlyTarget(bounds);
            }
          } else {
            navigateToDistrict(name);
            const b = (
              layer as { getBounds?: () => L.LatLngBounds }
            ).getBounds?.();
            if (b) setFlyTarget(b);
          }
        },
      });
    },
    [level, navigateToState, navigateToDistrict, setHovered, allStatesData],
  );

  // GeoJSON key forces re-render on level/state change
  // const geoKey = `${level}:${selectedState ?? ""}:${dark ? "d" : "l"}:${minV}-${maxV}:${selectedDistrict ?? ""}`;

  const geoKey = `${level}:${selectedState}:${metric}:${dark}:${minV}-${maxV}:${selectedDistrict}`;

   const isIndiaView = !selectedState && !selectedDistrict;

   const [clickedState, setClickedState] = useState<string | null >(selectedState)

   const [clickedDistrict, setClickedDistrict] = useState<string | null >(selectedDistrict)

     const handleClick = (statusValue?: string) => {
      if(isIndiaView){
         setStatus(statusValue);
      }else if(!selectedDistrict){
        setClickedState(selectedState);
      }else{
        setClickedDistrict(selectedDistrict);
      }
      return;
  };

  // Tile layer
  const tileUrl = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
  const tileAttr =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

  return (
    <div className="flex h-[calc(100vh-2rem)] min-h-[640px] gap-4 p-4">
      {/* Styles */}
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
          <Breadcrumbs
            crumbs={crumbs}
            currentLevel={level}
            onNavigate={goCrumb}
          />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <div className="flex overflow-hidden rounded-md border">
            <button
              className={`px-3 py-1 text-sm ${
                metric === "questions"
                  ? "bg-primary text-white"
                  : "bg-background"
              }`}
              onClick={() => setMetric("questions")}
            >
              Questions
            </button>

            <button
              className={`px-3 py-1 text-sm ${
                metric === "users" ? "bg-primary text-white" : "bg-background"
              }`}
              onClick={() => setMetric("users")}
            >
              Users
            </button>
          </div>

          <SearchBar
            value={query}
            onChange={handleSearchChange}
            hits={hits}
            onSelect={handleSearchSelect}
          />
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
          {!status && <MapContainer
            center={[22.5, 80]}
            zoom={5}
            minZoom={4.4}
            maxZoom={11}
            maxBounds={[
              [5, 65], // southwest
              [38, 100], // northeast
            ]}
            maxBoundsViscosity={1.0}
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  data={activeGeo as any}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  style={styleFn as any}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onEachFeature={onEach as any}
                />
                <FitBounds data={activeGeo} trigger={geoKey} />
              </>
            )}
            <FlyTo target={flyTarget} />
          </MapContainer>}

          {/* Legend */}
          <MapLegend minV={minV} maxV={maxV} dark={dark} />
        </div>
      </div>

      {/* RIGHT: Detail panel */}
      <DetailSidebar
        level={level}
        selectedState={selectedState}
        selectedDistrict={selectedDistrict}
        statesWithData={statesWithData}
        districtsOfState={districtsOfState}
        districtDetails={null}
        onSelectState={handleSelectState}
        onSelectDistrict={handleSelectDistrict}
        source={source}
        userType={userType}
        questionStatusData={questionStatusData}
        todayActiveFarmersData={todayActiveFarmersData}
        isLoading={isLoading || isFetching}
        districtAnalytic={districtAnalytics}
        metric={metric}
        handleClick={handleClick}
        status={status}
        setStatus={setStatus}
        isIndiaView = {isIndiaView}
        clickedState={clickedState}
        setClickedState={setClickedState}
        clickedDistrict={clickedDistrict}
        setClickedDistrict={setClickedDistrict}
      />
    </div>
  );
}
