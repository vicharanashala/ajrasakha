import React, { useState, useEffect } from "react";
import { REAL_OFFICIAL_INDIA_MAP } from "./realOfficialIndiaMapData";
import { publicDashboardService, type SaturatedCropStateItem, type SaturatedCrop } from "@/hooks/services/publicDashboardService";

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

  const handleMouseEnter = (stName: string) => {
    setHoveredState(stName);
    if (onStateHover) onStateHover(stName);
  };

  const handleMouseLeave = () => {
    setHoveredState(null);
    if (onStateHover) onStateHover(null);
  };

  return (
    <div className={`coverage-map ${className}`} style={{ position: "relative", width: "100%" }}>
      <svg viewBox="0 0 600 660" style={{ width: "100%", height: "auto", display: "block" }}>
        <g>
          {REAL_OFFICIAL_INDIA_MAP.map((st, stIdx) => {
            const isSelected =
              Boolean(selectedStateKey) &&
              (selectedStateKey.toLowerCase() === st.name.toLowerCase() ||
               selectedStateKey.toLowerCase() === st.id.toLowerCase());
            const isHovered = hoveredState === st.name;

            let fill = fillColor;
            if (isSelected) fill = selectedColor;
            else if (isHovered) fill = hoverColor;

            return (
              <path
                key={`${st.id}-${stIdx}`}
                d={st.pathD}
                fill={fill}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                style={{
                  cursor: "pointer",
                  transition: "fill 0.18s ease, transform 0.18s ease",
                  transformBox: "fill-box",
                  transformOrigin: "center",
                }}
                onMouseEnter={() => handleMouseEnter(st.name)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onStateSelect && onStateSelect(st.name)}
              >
                <title>{st.name}</title>
              </path>
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
  onStatesCountChange?: (count: number) => void;
}

// Main Export Component for Section 5 (Pan-India Coverage Layer)
export const IndiaCoverageMap: React.FC<IndiaCoverageMapProps> = ({ onStatesCountChange }) => {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [apiDataMap, setApiDataMap] = useState<Record<string, SaturatedCropStateItem>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Fetch /saturated-crops from PublicDashboardController on mount
  useEffect(() => {
    let isMounted = true;

    publicDashboardService.getSaturatedCrops().then((res: any) => {
      if (!isMounted) return;
      setIsLoaded(true);
      if (!res) return;

      // Extract array whether response is { saturationLimit, states: [...] } or direct [...]
      const itemsList: SaturatedCropStateItem[] = Array.isArray(res)
        ? res
        : Array.isArray(res.states)
        ? res.states
        : [];

      if (itemsList.length > 0) {
        const map: Record<string, SaturatedCropStateItem> = {};

        itemsList.forEach((item) => {
          if (item && item.state) {
            const rawState = item.state.trim();
            const lowerState = rawState.toLowerCase();

            if (!map[lowerState]) {
              map[lowerState] = {
                state: rawState,
                total: 0,
                crops: [],
              };
            }

            // Aggregate totals across case variations (e.g. "UTTAR PRADESH" & "Uttar Pradesh")
            map[lowerState].total += Number(item.total) || 0;

            // Merge crops list and sum crop counts
            if (Array.isArray(item.crops)) {
              item.crops.forEach((c: SaturatedCrop) => {
                const existingCrop = map[lowerState].crops.find(
                  (x) => x.crop.toLowerCase() === c.crop.toLowerCase()
                );
                if (existingCrop) {
                  existingCrop.count += Number(c.count) || 0;
                } else {
                  map[lowerState].crops.push({ crop: c.crop, count: Number(c.count) || 0 });
                }
              });
            }
          }
        });

        // Store with both original case key and lowercase key for O(1) instant lookup
        const finalMap: Record<string, SaturatedCropStateItem> = {};
        const uniqueKeys = Object.keys(map);
        uniqueKeys.forEach((k) => {
          const item = map[k];
          finalMap[k] = item;
          finalMap[item.state] = item;
        });

        setApiDataMap(finalMap);
        if (onStatesCountChange) {
          onStatesCountChange(uniqueKeys.length);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [onStatesCountChange]);

  const activeStateName = hoveredState || selectedState;

  // Resolve saturated crop data directly from backend API
  const saturatedItem: SaturatedCropStateItem = React.useMemo(() => {
    if (activeStateName) {
      const match =
        apiDataMap[activeStateName] ||
        apiDataMap[activeStateName.toLowerCase()] ||
        Object.values(apiDataMap).find(
          (item) => item.state.toLowerCase() === activeStateName.toLowerCase()
        );
      if (match) return match;
      return { state: activeStateName, total: 0, crops: [] };
    }

    // If no state is hovered or selected, calculate overall India totals!
    const allStates = Object.values(apiDataMap);
    let overallTotal = 0;
    const cropMap: Record<string, number> = {};

    allStates.forEach((st) => {
      overallTotal += Number(st.total) || 0;
      if (Array.isArray(st.crops)) {
        st.crops.forEach((c) => {
          cropMap[c.crop] = (cropMap[c.crop] || 0) + (Number(c.count) || 0);
        });
      }
    });

    const mergedCrops = Object.keys(cropMap)
      .map((k) => ({ crop: k, count: cropMap[k] }))
      .sort((a, b) => b.count - a.count);

    return {
      state: "All India Coverage",
      total: overallTotal,
      crops: mergedCrops,
    };
  }, [activeStateName, apiDataMap]);

  const totalQuestions = saturatedItem.total;
  const cropsList = saturatedItem.crops || [];

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
          markers={[
            { id: "delhi", label: "Delhi", x: 217, y: 229, color: "#d7b765" },
            { id: "mumbai", label: "Mumbai", x: 153, y: 384, color: "#d7b765" },
            { id: "bengaluru", label: "Bengaluru", x: 223, y: 479, color: "#d7b765" },
          ]}
        />
        <div className="map-caption">
          <div>HOVER OR TAP A STATE</div>
          <span>INDIA-ONLY OFFICIAL BOUNDARY VISUALIZATION</span>
        </div>
      </div>

      {/* Column 3: Dynamic State Inspector Card */}
      <aside className="state-card">
        {/* Header: State Name */}
        <div className="state-card-head">
          <span>
            <small>CURRENT FOCUS</small>
            <strong>{activeStateName}</strong>
          </span>
          <span className="status-pill">{isLoaded ? "Live API" : "Connecting..."}</span>
        </div>

        {/* Total Questions Submitted Metric */}
        <div
          style={{
            margin: "18px 0 14px",
            padding: "14px 16px",
            borderRadius: "12px",
            background: "#f7f5ec",
            border: "1px solid var(--line)",
          }}
        >
          <span style={{ fontSize: "9px", fontWeight: 700, color: "#1733268c", textTransform: "uppercase", letterSpacing: "0.08em", display: "block" }}>
            Total Questions Submitted
          </span>
          <strong style={{ fontFamily: "Newsreader, serif", fontSize: "32px", fontWeight: 600, color: "var(--forest)", display: "block", marginTop: "4px" }}>
            {totalQuestions > 0 ? totalQuestions.toLocaleString("en-IN") : "0"}
          </strong>
        </div>

        {/* Breakdown according to Crops */}
        <div style={{ marginTop: "14px" }}>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "#17332694", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "10px" }}>
            Crop-Wise Breakdown
          </span>

          {cropsList.length > 0 ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {cropsList.map((c) => {
                const pct = totalQuestions > 0 ? Math.round((c.count / totalQuestions) * 100) : 0;
                return (
                  <div key={c.crop} style={{ display: "grid", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600, color: "var(--ink)" }}>
                      <span>{c.crop}</span>
                      <span style={{ color: "#173326b8" }}>
                        <strong>{c.count.toLocaleString("en-IN")}</strong> ({pct}%)
                      </span>
                    </div>
                    {/* Visual bar share indicator */}
                    <div
                      style={{
                        height: "6px",
                        width: "100%",
                        borderRadius: "999px",
                        background: "#17332617",
                        overflow: "hidden",
                      }}
                    >
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
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "16px", borderRadius: "10px", background: "#f7f5ec", textAlign: "center", color: "#17332680", fontSize: "11px" }}>
              No saturated crop records for {activeStateName}
            </div>
          )}
        </div>

        <button
          type="button"
          style={{ marginTop: "20px" }}
          onClick={() => alert(`Opening ${activeStateName} Regional Agri Dashboard...`)}
        >
          <span>View state dashboard</span>
          <span>→</span>
        </button>
      </aside>
    </>
  );
};

export default IndiaCoverageMap;
