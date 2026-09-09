import React, { useState, useEffect } from "react";
import { REAL_OFFICIAL_INDIA_MAP } from "./realOfficialIndiaMapData";
import type { SaturatedCropStateItem, SaturatedCrop, SaturatedCropsApiResponse } from "@/hooks/services/publicDashboardService";

interface IndiaMapProps {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  hoverColor?: string;
  selectedColor?: string;
  markers?: Array<{ id: string; label: string; x: number; y: number; color?: string }>;
  showTooltip?: boolean;
  selectedStateKey?: string;
  onStateSelect?: (stateName: string) => void;
  onStateHover?: (stateName: string | null) => void;
  className?: string;
}

interface StatePathProps {
  st: { id: string; name: string; pathD: string };
  isSelected: boolean;
  isHovered: boolean;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  selectedColor: string;
  hoverColor: string;
}

// Memoized state path rendering to prevent full 36-path SVG layout recalculations
const StatePath: React.FC<StatePathProps> = React.memo(({
  st,
  isSelected,
  isHovered,
  strokeColor,
  strokeWidth,
  fillColor,
  selectedColor,
  hoverColor,
}) => {
  let fill = fillColor;
  if (isSelected) fill = selectedColor;
  else if (isHovered) fill = hoverColor;

  return (
    <path
      d={st.pathD}
      data-state-name={st.name}
      fill={fill}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      style={{
        cursor: "pointer",
        transition: "fill 0.18s ease, transform 0.18s ease",
        transformBox: "fill-box",
        transformOrigin: "center",
      }}
    >
      <title>{st.name}</title>
    </path>
  );
});
StatePath.displayName = "StatePath";

export const SVGIndiaMap: React.FC<IndiaMapProps> = ({
  fillColor = "#dfe9cd",
  strokeColor = "#f6f2e8",
  strokeWidth = 0.75,
  hoverColor = "#d7b765",
  selectedColor = "#d7b765",
  markers = [],
  selectedStateKey = "",
  onStateSelect,
  onStateHover,
  className = "",
}) => {
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  // Parent event delegation to avoid attaching event listeners on 36 child path elements
  const handleSvgMouseEnter = (e: React.MouseEvent<SVGGElement>) => {
    const target = e.target as SVGPathElement;
    const stateName = target.getAttribute("data-state-name");
    if (stateName && stateName !== hoveredState) {
      setHoveredState(stateName);
      if (onStateHover) onStateHover(stateName);
    }
  };

  const handleSvgMouseLeave = () => {
    setHoveredState(null);
    if (onStateHover) onStateHover(null);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGGElement>) => {
    const target = e.target as SVGPathElement;
    const stateName = target.getAttribute("data-state-name");
    if (stateName && onStateSelect) {
      onStateSelect(stateName);
    }
  };

  return (
    <div className={`coverage-map ${className}`} style={{ position: "relative", width: "100%" }}>
      <svg viewBox="0 0 600 660" style={{ width: "100%", height: "auto", display: "block" }}>
        <g
          onMouseOver={handleSvgMouseEnter}
          onMouseLeave={handleSvgMouseLeave}
          onClick={handleSvgClick}
        >
          {REAL_OFFICIAL_INDIA_MAP.map((st, stIdx) => {
            const isSelected =
              Boolean(selectedStateKey) &&
              (selectedStateKey.toLowerCase() === st.name.toLowerCase() ||
               selectedStateKey.toLowerCase() === st.id.toLowerCase());
            const isHovered = hoveredState === st.name;

            return (
              <StatePath
                key={`${st.id}-${stIdx}`}
                st={st}
                isSelected={isSelected}
                isHovered={isHovered}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                fillColor={fillColor}
                selectedColor={selectedColor}
                hoverColor={hoverColor}
              />
            );
          })}
        </g>

        {/* Hotspot City Markers */}
        {markers.map((m) => (
          <g key={m.id} transform={`translate(${m.x}, ${m.y})`} style={{ cursor: "pointer" }}>
            <circle r="14" fill={m.color || "#f1d879"} opacity="0.25">
              <animate attributeName="r" values="8;18;8" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.45;0.08;0.45" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle r="5.5" fill={m.color || "#f1d879"} stroke="#061923" strokeWidth="1.5" />
            {m.label && (
              <text
                x="0"
                y="18"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10"
                fontWeight="700"
                style={{
                  fontFamily: "Manrope, sans-serif",
                  paintOrder: "stroke",
                  stroke: "rgba(6, 25, 35, 0.95)",
                  strokeWidth: "3.5px",
                  strokeLinejoin: "round",
                }}
              >
                {m.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Hover tooltip */}
      {hoveredState && (
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(6, 25, 35, 0.9)",
            color: "#f8f4e6",
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "0.8rem",
            fontWeight: 700,
            border: "1px solid rgba(255,255,255,0.2)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {hoveredState}
        </div>
      )}
    </div>
  );
};

export interface IndiaCoverageMapProps {
  /** Shared /saturated-crops response, fetched once by the parent and drilled down here. */
  saturatedCrops?: SaturatedCropsApiResponse | SaturatedCropStateItem[] | null;
  isLoading?: boolean;
  onStatesCountChange?: (count: number) => void;
}

// Extracted markers constant outside component render loop to prevent re-creation
const MAP_HOTSPOT_MARKERS = [
  { id: "delhi", label: "Delhi", x: 217, y: 229, color: "#d7b765" },
  { id: "mumbai", label: "Mumbai", x: 153, y: 384, color: "#d7b765" },
  { id: "bengaluru", label: "Bengaluru", x: 223, y: 479, color: "#d7b765" },
];

// Main Export Component for Section 5 (Pan-India Coverage Layer)
export const IndiaCoverageMap: React.FC<IndiaCoverageMapProps> = ({
  saturatedCrops,
  isLoading,
  onStatesCountChange,
}) => {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const isLoaded = !isLoading;

  // Helper to format state names cleanly (e.g. "MADHYA PRADESH" -> "Madhya Pradesh")
  const formatStateName = (name: string): string => {
    if (!name) return "";
    return name
      .trim()
      .toLowerCase()
      .split(" ")
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ""))
      .join(" ");
  };

  // Build the state→data lookup from the shared saturated-crops response (no own fetch).
  const apiDataMap = React.useMemo<Record<string, SaturatedCropStateItem>>(() => {
    const res = saturatedCrops as any;
    const itemsList: SaturatedCropStateItem[] = Array.isArray(res)
      ? res
      : Array.isArray(res?.states)
      ? res.states
      : [];
    if (itemsList.length === 0) return {};

    const map: Record<string, SaturatedCropStateItem> = {};
    itemsList.forEach((item) => {
      if (item && item.state) {
        const rawState = item.state.trim();
        const lowerState = rawState.toLowerCase();
        const cleanStateName = formatStateName(rawState);

        if (!map[lowerState]) {
          map[lowerState] = {
            state: cleanStateName,
            total: 0,
            closed: 0,
            inProgress: 0,
            crops: [],
          };
        }

        // Aggregate totals across case variations (e.g. "UTTAR PRADESH" & "Uttar Pradesh")
        map[lowerState].total += Number(item.total) || 0;
        map[lowerState].closed = (map[lowerState].closed ?? 0) + (Number(item.closed) || 0);
        map[lowerState].inProgress = (map[lowerState].inProgress ?? 0) + (Number(item.inProgress) || 0);

        // Merge crops list and sum crop counts (with closed / in-progress split)
        if (Array.isArray(item.crops)) {
          item.crops.forEach((c: SaturatedCrop) => {
            const existingCrop = map[lowerState].crops.find(
              (x) => x.crop.toLowerCase() === c.crop.toLowerCase()
            );
            if (existingCrop) {
              existingCrop.count += Number(c.count) || 0;
              existingCrop.closed = (existingCrop.closed ?? 0) + (Number(c.closed) || 0);
              existingCrop.inProgress = (existingCrop.inProgress ?? 0) + (Number(c.inProgress) || 0);
            } else {
              map[lowerState].crops.push({
                crop: c.crop,
                count: Number(c.count) || 0,
                closed: Number(c.closed) || 0,
                inProgress: Number(c.inProgress) || 0,
              });
            }
          });
        }
      }
    });

    // Store with original, clean title, and lowercase keys for O(1) instant lookup.
    const finalMap: Record<string, SaturatedCropStateItem> = {};
    Object.keys(map).forEach((k) => {
      const item = map[k];
      finalMap[k] = item;
      finalMap[item.state] = item;
      finalMap[item.state.toLowerCase()] = item;
    });
    return finalMap;
  }, [saturatedCrops]);

  // Distinct-state count, reported up to the parent.
  const statesCount = React.useMemo(() => {
    const seen = new Set<string>();
    for (const item of Object.values(apiDataMap)) seen.add(item.state.toLowerCase());
    return seen.size;
  }, [apiDataMap]);

  useEffect(() => {
    onStatesCountChange?.(statesCount);
  }, [statesCount, onStatesCountChange]);

  const activeStateName = hoveredState || selectedState;
  const formattedActiveStateName = activeStateName ? formatStateName(activeStateName) : null;

  // All saturated states (deduped across case variants), sorted high → low.
  const statesList = React.useMemo(() => {
    const seen = new Set<string>();
    const list: SaturatedCropStateItem[] = [];
    for (const item of Object.values(apiDataMap)) {
      const key = item.state.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(item);
    }
    return list.sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
  }, [apiDataMap]);

  // India-wide totals = the sum of every state's total / closed / in-progress.
  const grandTotals = React.useMemo(
    () =>
      statesList.reduce(
        (acc, s) => ({
          total: acc.total + (Number(s.total) || 0),
          closed: acc.closed + (Number(s.closed) || 0),
          inProgress: acc.inProgress + (Number(s.inProgress) || 0),
        }),
        { total: 0, closed: 0, inProgress: 0 }
      ),
    [statesList]
  );

  // The hovered/selected state's data (null when nothing is focused or if state has no data).
  const activeStateItem = React.useMemo(() => {
    if (!activeStateName) return null;
    return (
      apiDataMap[activeStateName] ||
      apiDataMap[activeStateName.toLowerCase()] ||
      statesList.find(
        (s) => s.state.toLowerCase() === activeStateName.toLowerCase()
      ) ||
      null
    );
  }, [activeStateName, apiDataMap, statesList]);

  const isStateFocused = Boolean(activeStateName);
  const isStateHasData = Boolean(activeStateItem);

  // Scope Labels & Fallback Explanations
  const dataScopeLabel = isStateHasData
    ? `Total Questions Submitted — ${activeStateItem!.state}`
    : isStateFocused
    ? `Total Questions Submitted — ${formattedActiveStateName}`
    : `Total Questions Submitted — Nationwide`;

  const scopeBadge = isStateHasData
    ? "State Live Data"
    : isStateFocused
    ? "No State Data"
    : "All India";

  const scopeDescription = isStateHasData
    ? `Displaying state-specific question and crop breakdown for ${activeStateItem!.state}.`
    : isStateFocused
    ? `No advisory data available for ${formattedActiveStateName} yet.`
    : `Displaying nationwide aggregate coverage across all active states.`;

  // Metrics shown in card: the focused state's figures if it has data; zeros if a state is
  // focused but has no data; nationwide totals when nothing is focused.
  const displayTotals = isStateHasData
    ? {
        total: Number(activeStateItem!.total) || 0,
        closed: Number(activeStateItem!.closed) || 0,
        inProgress: Number(activeStateItem!.inProgress) || 0,
      }
    : isStateFocused
    ? { total: 0, closed: 0, inProgress: 0 }
    : grandTotals;

  const totalQuestions = displayTotals.total;
  const cropsList = activeStateItem?.crops ?? [];

  return (
    <>
      {/* Column 2: Interactive Upright India Coverage Map */}
      <div className="coverage-map-wrap">
        <SVGIndiaMap
          fillColor="#dfe9cd"
          strokeColor="#f6f2e8"
          strokeWidth={0.75}
          selectedColor="#d7b765"
          hoverColor="#c2d4aa"
          selectedStateKey={activeStateName || ""}
          onStateSelect={setSelectedState}
          onStateHover={setHoveredState}
          markers={MAP_HOTSPOT_MARKERS}
        />
        <div className="map-caption">
          <div>HOVER OR TAP A STATE</div>
          <span>INDIA-ONLY OFFICIAL BOUNDARY VISUALIZATION</span>
        </div>
      </div>

      {/* Column 3: Dynamic State Inspector Card */}
      <aside className="state-card">
        {/* Header: State Name & Filter Controls */}
        <div className="state-card-head" style={{ alignItems: "flex-start", gap: "8px" }}>
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <small style={{ display: "block" }}>CURRENT FOCUS</small>
            <strong style={{ fontSize: "1.15rem", color: "var(--forest, #173326)", wordBreak: "break-word" }}>
              {isStateFocused ? formattedActiveStateName : "All India (Nationwide)"}
            </strong>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            <span
              className="status-pill"
              style={{
                background: !isLoaded
                  ? "#f3f4f6"
                  : isStateHasData
                  ? "#eef6f0"
                  : isStateFocused
                  ? "#fef3c7"
                  : "#eef6f0",
                color: !isLoaded
                  ? "#6b7280"
                  : isStateHasData
                  ? "#164e2e"
                  : isStateFocused
                  ? "#92400e"
                  : "#164e2e",
                border: `1px solid ${
                  !isLoaded
                    ? "#e5e7eb"
                    : isStateHasData
                    ? "#c8e6d0"
                    : isStateFocused
                    ? "#fde68a"
                    : "#c8e6d0"
                }`,
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "12px",
              }}
            >
              {scopeBadge}
            </span>
            {selectedState && (
              <button
                type="button"
                onClick={() => setSelectedState(null)}
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#173326b8",
                  background: "transparent",
                  border: "none",
                  textDecoration: "underline",
                  cursor: "pointer",
                  padding: "2px 0",
                }}
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>

        {/* Scope Context Banner */}
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            fontSize: "11px",
            marginTop: "12px",
            background: !isStateFocused
              ? "#eef6f0"
              : isStateHasData
              ? "#eef6f0"
              : "#fffbe8",
            color: !isStateFocused
              ? "#164e2e"
              : isStateHasData
              ? "#164e2e"
              : "#92400e",
            border: `1px solid ${
              !isStateFocused
                ? "#c8e6d0"
                : isStateHasData
                ? "#c8e6d0"
                : "#fde68a"
            }`,
            lineHeight: 1.4,
            display: "flex",
            alignItems: "flex-start",
            gap: "6px",
          }}
        >
          <span style={{ fontSize: "13px", lineHeight: 1 }}>
            {!isStateFocused ? "🌐" : isStateHasData ? "📍" : "ℹ️"}
          </span>
          <span>{scopeDescription}</span>
        </div>

        {/* Total Questions Submitted Metric Box */}
        <div
          style={{
            margin: "14px 0 14px",
            padding: "14px 16px",
            borderRadius: "12px",
            background: "#f7f5ec",
            border: "1px solid var(--line)",
          }}
        >
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              color: "#1733268c",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              display: "block",
            }}
          >
            {dataScopeLabel}
          </span>
          <strong
            style={{
              fontFamily: "Newsreader, serif",
              fontSize: "32px",
              fontWeight: 600,
              color: "var(--forest)",
              display: "block",
              marginTop: "4px",
            }}
          >
            {totalQuestions > 0 ? totalQuestions.toLocaleString("en-IN") : "0"}
          </strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", marginTop: "8px" }}>
            <span style={{ fontSize: "11px", color: "#173326b8" }}>
              Closed:{" "}
              <strong style={{ color: "var(--forest)" }}>
                {displayTotals.closed.toLocaleString("en-IN")}
              </strong>
            </span>
            <span style={{ fontSize: "11px", color: "#173326b8" }}>
              In-Progress:{" "}
              <strong style={{ color: "var(--forest)" }}>
                {displayTotals.inProgress.toLocaleString("en-IN")}
              </strong>
            </span>
          </div>
        </div>

        {/* Breakdown: crop-wise for the focused state (if data exists), else state-wise across India. */}
        <div style={{ marginTop: "14px" }}>
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              color: "#17332694",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              display: "block",
              marginBottom: "10px",
            }}
          >
            {isStateFocused
              ? `Crop-Wise Breakdown — ${formattedActiveStateName}`
              : `State-Wise Breakdown (Nationwide)`}
          </span>

          {isStateFocused ? (
            cropsList.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {cropsList.map((c) => {
                  const cropTotal = Number(c.count) || 0;
                  const cropClosed = Number(c.closed) || 0;
                  const cropInProgress = Number(c.inProgress) || 0;
                  const pct = totalQuestions > 0 ? Math.round((cropTotal / totalQuestions) * 100) : 0;
                  return (
                    <div key={c.crop} style={{ display: "grid", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600, color: "var(--ink)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          {/* Crop icon on a soft-green badge, matched by exact crop name
                              (e.g. "Paddy" → /crops/Paddy.svg). Hidden if no matching SVG exists. */}
                          <span
                            style={{
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "30px",
                              height: "30px",
                              borderRadius: "8px",
                              background: "#e3f0e0",
                              border: "1px solid #bcd9b6",
                            }}
                          >
                            <img
                              src={`/crops/${encodeURIComponent(c.crop)}.svg`}
                              alt=""
                              width={22}
                              height={22}
                              style={{ objectFit: "contain" }}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.crop}
                          </span>
                        </span>
                        <span style={{ color: "#173326b8", flexShrink: 0 }}>
                          <strong>{cropTotal.toLocaleString("en-IN")}</strong> ({pct}%)
                        </span>
                      </div>
                      <div style={{ height: "6px", width: "100%", borderRadius: "999px", background: "#17332617", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.max(4, Math.min(100, pct))}%`,
                            borderRadius: "999px",
                            background: "linear-gradient(90deg, #245d43, #d7b765)",
                            transition: "width 0.4s ease",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#17332699" }}>
                        <span>
                          Closed: <strong style={{ color: "var(--forest)" }}>{cropClosed.toLocaleString("en-IN")}</strong>
                        </span>
                        <span>
                          In-Progress: <strong style={{ color: "var(--forest)" }}>{cropInProgress.toLocaleString("en-IN")}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: "16px", borderRadius: "10px", background: "#f7f5ec", textAlign: "center", color: "#17332680", fontSize: "11px" }}>
                No saturated crop records for {formattedActiveStateName}
              </div>
            )
          ) : statesList.length > 0 ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {statesList.map((s) => {
                const stateTotal = Number(s.total) || 0;
                const stateClosed = Number(s.closed) || 0;
                const stateInProgress = Number(s.inProgress) || 0;
                const pct = totalQuestions > 0 ? Math.round((stateTotal / totalQuestions) * 100) : 0;
                return (
                  <div key={s.state} style={{ display: "grid", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600, color: "var(--ink)" }}>
                      <span>{s.state}</span>
                      <span style={{ color: "#173326b8" }}>
                        <strong>{stateTotal.toLocaleString("en-IN")}</strong> ({pct}%)
                      </span>
                    </div>
                    <div style={{ height: "6px", width: "100%", borderRadius: "999px", background: "#17332617", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(4, Math.min(100, pct))}%`,
                          borderRadius: "999px",
                          background: "linear-gradient(90deg, #245d43, #d7b765)",
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#17332699" }}>
                      <span>
                        Closed: <strong style={{ color: "var(--forest)" }}>{stateClosed.toLocaleString("en-IN")}</strong>
                      </span>
                      <span>
                        In-Progress: <strong style={{ color: "var(--forest)" }}>{stateInProgress.toLocaleString("en-IN")}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "16px", borderRadius: "10px", background: "#f7f5ec", textAlign: "center", color: "#17332680", fontSize: "11px" }}>
              No saturated state records available
            </div>
          )}
        </div>

        <button
          type="button"
          style={{ marginTop: "20px", color: "#ffffff" }}
          onClick={() => alert(`Opening ${formattedActiveStateName || "All-India"} Regional Agri Dashboard...`)}
        >
          <span style={{ color: "#ffffff", fontWeight: 700 }}>View {isStateHasData ? `${formattedActiveStateName}` : "national"} dashboard</span>
          <span style={{ color: "#ffffff", fontWeight: 700 }}>→</span>
        </button>
      </aside>
    </>
  );
};

export default IndiaCoverageMap;
