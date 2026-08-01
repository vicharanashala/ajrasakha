import React, { useState, useMemo, useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import { REAL_OFFICIAL_INDIA_MAP } from "./realOfficialIndiaMapData";
import { useGeoJson } from "@/features/chatbotDashboard/components/map/hooks/useGeoJson";
import type { PublicUserItem } from "@/hooks/services/publicDashboardService";

export interface ExpertProfile {
  id: string;
  name: string;
  role: string;
  roleType: "agronomist" | "reviewer" | "moderator" | "author" | "researcher";
  institution: string;
  city: string;
  state: string;
  avatar: string;
  expertise: string[];
  advisoriesCount: number;
  x: number;
  y: number;
  lat: number;
  lng: number;
  /** For KVK / SAU pins: the user who covers this KVK / university. */
  coveredBy?: string;
}

export const STATE_COORDINATES: Record<string, [number, number]> = {
  "andhra pradesh": [15.9129, 79.74],
  "arunachal pradesh": [28.218, 94.7278],
  assam: [26.2006, 92.9376],
  bihar: [25.0961, 85.3131],
  chhattisgarh: [21.2787, 81.8661],
  delhi: [28.7041, 77.1025],
  goa: [15.2993, 74.124],
  gujarat: [22.2587, 71.1924],
  haryana: [29.0588, 76.0856],
  "himachal pradesh": [31.1048, 77.1734],
  "jammu & kashmir": [33.7782, 76.5762],
  "jammu and kashmir": [33.7782, 76.5762],
  jharkhand: [23.6102, 85.2799],
  karnataka: [15.3173, 75.7139],
  kerala: [10.8505, 76.2711],
  ladakh: [34.1526, 77.5771],
  "madhya pradesh": [22.9734, 78.6569],
  maharashtra: [19.7515, 75.7139],
  manipur: [24.6637, 93.9063],
  meghalaya: [25.467, 91.3662],
  mizoram: [23.1645, 92.9376],
  nagaland: [26.1584, 94.5624],
  odisha: [20.9517, 85.0985],
  punjab: [31.1471, 75.3412],
  rajasthan: [27.0238, 74.2179],
  sikkim: [27.533, 88.5122],
  "tamil nadu": [11.1271, 78.6569],
  telangana: [18.1124, 79.0193],
  tripura: [23.9408, 91.9882],
  "uttar pradesh": [26.8467, 80.9462],
  uttarakhand: [30.0668, 79.0193],
  "west bengal": [22.9868, 87.855],
  "andaman & nicobar": [11.7401, 92.6586],
  "andaman and nicobar islands": [11.7401, 92.6586],
  chandigarh: [30.7333, 76.7794],
  "dadra and nagar haveli and daman and diu": [20.3974, 72.8328],
  puducherry: [11.9416, 79.8083],
};

export const getInitialsAvatarUrl = (name: string) => {
  const cleanName = encodeURIComponent((name || "Expert").trim());
  return `https://ui-avatars.com/api/?name=${cleanName}&background=173e2e&color=ffe899&bold=true&length=2&font-size=0.45`;
};

export const getAvatarUrl = (avatar?: string | null, name?: string) => {
  if (avatar && typeof avatar === "string" && avatar.trim().length > 0) {
    return avatar.trim();
  }
  return getInitialsAvatarUrl(name || "Expert");
};

const normalizeState = (state: string): string => {
  const s = state.trim().toLowerCase();

  if (
    s.includes("andhra") &&
    (s.includes("padesh") ||
      s.includes("pradesh") ||
      s.includes("prades") ||
      s.includes("andra"))
  ) {
    return "andhra pradesh";
  }
  if (
    s.includes("arunachal") &&
    (s.includes("padesh") || s.includes("pradesh"))
  ) {
    return "arunachal pradesh";
  }
  if (
    s.includes("himachal") &&
    (s.includes("padesh") || s.includes("pradesh"))
  ) {
    return "himachal pradesh";
  }
  if (
    s.includes("madhya") &&
    (s.includes("padesh") || s.includes("pradesh"))
  ) {
    return "madhya pradesh";
  }
  if (
    s.includes("uttar") &&
    (s.includes("padesh") || s.includes("pradesh") || s.includes("prad"))
  ) {
    if (s.includes("uttaranchal") || s.includes("uttarakhand")) {
      return "uttarakhand";
    }
    return "uttar pradesh";
  }
  if (s === "orissa" || s === "odisa" || s === "odisaa" || s === "odisha") {
    return "odisha";
  }
  if (s === "uttaranchal" || s === "uttrakhand") {
    return "uttarakhand";
  }
  if (s === "telengana" || s === "telangana") {
    return "telangana";
  }
  if (s.includes("jammu") && s.includes("kashmir")) {
    return "jammu & kashmir";
  }
  if (s.includes("andaman") && s.includes("nicobar")) {
    return "andaman & nicobar";
  }
  if (s.includes("daman") && s.includes("diu")) {
    return "dadra and nagar haveli and daman and diu";
  }
  return s;
};

// Helper component to handle Leaflet camera smooth flyTo
const LeafletFlyTo: React.FC<{ target: L.LatLngBoundsExpression | null }> = ({
  target,
}) => {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyToBounds(target, { duration: 1.2, maxZoom: 8, padding: [30, 30] });
    }
  }, [target, map]);
  return null;
};

// Create custom HTML marker for Leaflet map using L.divIcon
const createCustomMarkerIcon = (
  avatarUrl: string,
  name: string,
  isHovered: boolean,
) => {
  const firstName = name.split(" ")[0] || "Expert";
  return L.divIcon({
    className: "leaflet-expert-custom-icon",
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        <!-- Pulsating Radar Ring -->
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 1.5px solid #d6b763;
          animation: leafletPulse 2.4s infinite ease-in-out;
          pointer-events: none;
        "></div>

        <!-- Teardrop Pin Shape -->
        <div style="
          width: 28px;
          height: 34px;
          background: ${isHovered ? "#f1d879" : "#0d2b1f"};
          border: 2px solid #d6b763;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 6px 16px rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.25s ease, background 0.25s ease;
          margin-bottom: -4px;
        ">
          <!-- Avatar inside pin -->
          <img
            src="${avatarUrl}"
            alt="${firstName}"
            style="
              width: 19px;
              height: 19px;
              border-radius: 50%;
              object-fit: cover;
              transform: rotate(45deg);
              border: 1px solid #d6b763;
            "
          />
        </div>

        <!-- Label Badge -->
        ${
          isHovered
            ? `<div style="
                background: rgba(6, 25, 35, 0.95);
                color: #f1d879;
                border: 1px solid #d6b763;
                padding: 2px 6px;
                border-radius: 8px;
                font-size: 10px;
                font-weight: 800;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                z-index: 10;
              ">${firstName}</div>`
            : ""
        }
      </div>
    `,
    iconSize: [34, 44],
    iconAnchor: [17, 40],
  });
};

interface ExpertStatePathProps {
  st: { id: string; name: string; pathD: string };
  isHovered: boolean;
}

const ExpertStatePath: React.FC<ExpertStatePathProps> = React.memo(({ st, isHovered }) => {
  return (
    <path
      d={st.pathD}
      data-state-name={st.name}
      fill={isHovered ? "url(#stateHoverGrad)" : "url(#stateDefaultGrad)"}
      stroke={isHovered ? "#ffffff" : "rgba(86, 185, 138, 0.65)"}
      strokeWidth={isHovered ? 1.8 : 0.75}
      style={{
        cursor: "pointer",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        transformBox: "fill-box",
        transformOrigin: "center",
        transform: isHovered ? "scale(1.008) translateZ(10px)" : "scale(1)",
        filter: isHovered ? "url(#glowGold)" : "none",
      }}
    >
      <title>{st.name} — Click to view its users</title>
    </path>
  );
});
ExpertStatePath.displayName = "ExpertStatePath";

interface ExpertNetworkMapProps {
  publicUsers?: PublicUserItem[] | null;
  className?: string;
  /** What the map plots: experts (default), KVKs covered, or SAU universities — per state. */
  mode?: "experts" | "kvk" | "sau";
}

export const ExpertNetworkMap: React.FC<ExpertNetworkMapProps> = ({
  publicUsers,
  className = "",
  mode = "experts",
}) => {
  const [viewMode, setViewMode] = useState<"leaflet" | "svg">("leaflet");
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<L.LatLngBoundsExpression | null>(null);
  // Pins are hidden on initial load — only shown after user clicks a state or list item
  const [pinsVisible, setPinsVisible] = useState(false);
  const activeProfileId = selectedPinId || activePinId;
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});

  // Reset pins + selection whenever the tab/mode changes
  useEffect(() => {
    setPinsVisible(false);
    setSelectedState(null);
    setActivePinId(null);
    setSelectedPinId(null);
    setFlyTarget(null);
  }, [mode]);

  const { statesGeo } = useGeoJson();

  // Parse live API public users from backend response
  const experts = useMemo(() => {
    if (!publicUsers || publicUsers.length === 0) return [];

    const safeString = (val: any): string => {
      if (typeof val === "string") return val.trim();
      if (typeof val === "number" || typeof val === "boolean") return String(val);
      if (Array.isArray(val)) return val.map(safeString).filter(Boolean).join(", ");
      if (val && typeof val === "object") {
        if (typeof val.name === "string") return val.name.trim();
        if (typeof val.label === "string") return val.label.trim();
        if (typeof val.title === "string") return val.title.trim();
      }
      return "";
    };

    const stateCounts: Record<string, number> = {};
    const dynamicMapped: ExpertProfile[] = [];

    const placeInState = (rawState: string) => {
      const normalized = rawState ? normalizeState(rawState) : "";
      const match =
        normalized && normalized !== "all"
          ? REAL_OFFICIAL_INDIA_MAP.find(
              (st) =>
                st.name.toLowerCase() === normalized ||
                st.id.toLowerCase() === normalized,
            )
          : undefined;

      const baseLat =
        normalized && STATE_COORDINATES[normalized]
          ? STATE_COORDINATES[normalized][0]
          : match?.cy
            ? 28.6 - (match.cy - 200) * 0.035
            : 22.5;
      const baseLng =
        normalized && STATE_COORDINATES[normalized]
          ? STATE_COORDINATES[normalized][1]
          : match?.cx
            ? 70 + (match.cx - 150) * 0.04
            : 78.9;

      const stateId = match?.id || normalized || "default";
      const stateIdx = stateCounts[stateId] || 0;
      stateCounts[stateId] = stateIdx + 1;

      const baseX = match?.cx ?? 300;
      const baseY = match?.cy ?? 300;
      let x = baseX;
      let y = baseY;
      let lat = baseLat;
      let lng = baseLng;

      if (stateIdx > 0) {
        const angle = (stateIdx * 137.5 * Math.PI) / 180;
        const radius = 6 + stateIdx * 3.2;
        x = Math.round(baseX + Math.cos(angle) * radius);
        y = Math.round(baseY + Math.sin(angle) * radius);

        const geoRadius = 0.22 + stateIdx * 0.12;
        lat = Number((baseLat + Math.sin(angle) * geoRadius).toFixed(4));
        lng = Number((baseLng + Math.cos(angle) * geoRadius).toFixed(4));
      }

      return { matchName: match?.name || rawState || "India", x, y, lat, lng };
    };

    if (mode === "kvk" || mode === "sau") {
      publicUsers.forEach((u) => {
        if (safeString(u.role).toLowerCase() === "admin") return;
        const coveredBy =
          [safeString(u.firstName), safeString(u.lastName)]
            .filter(Boolean)
            .join(" ")
            .trim() || "—";

        if (mode === "kvk") {
          const kvks = Array.isArray(u.kvkCovered) ? u.kvkCovered : [];
          kvks.forEach((k, ki) => {
            const name = safeString(k?.name);
            if (!name) return;
            const pos = placeInState(safeString(k?.state));
            const district = safeString(k?.district);
            dynamicMapped.push({
              id: `kvk-${safeString(u.firstName)}-${ki}-${name}`,
              name,
              role: "KVK COVERED",
              roleType: "agronomist",
              institution: district ? `${district} District` : pos.matchName,
              city: district || `${pos.matchName} Hub`,
              state: pos.matchName,
              avatar: getInitialsAvatarUrl(name),
              expertise: [],
              advisoriesCount: 0,
              x: pos.x,
              y: pos.y,
              lat: pos.lat,
              lng: pos.lng,
              coveredBy,
            });
          });
        } else {
          const uni = safeString(u.university);
          if (!uni) return;
          const pos = placeInState(safeString(u.preference?.state));
          const district = safeString(u.preference?.district);
          dynamicMapped.push({
            id: `sau-${safeString(u.firstName)}-${uni}`,
            name: uni,
            role: "SAU / UNIVERSITY",
            roleType: "researcher",
            institution: uni,
            city: district || `${pos.matchName} Hub`,
            state: pos.matchName,
            avatar: getInitialsAvatarUrl(uni),
            expertise: [],
            advisoriesCount: 0,
            x: pos.x,
            y: pos.y,
            lat: pos.lat,
            lng: pos.lng,
            coveredBy,
          });
        }
      });
      return dynamicMapped;
    }

    publicUsers.forEach((u, idx) => {
      if (safeString(u.role).toLowerCase() === "admin") return;

      const firstName = safeString(u.firstName);
      const lastName = safeString(u.lastName);
      const userName =
        [firstName, lastName].filter(Boolean).join(" ").trim() ||
        `Agri Professional #${idx + 1}`;

      const rawState = safeString(u.preference?.state);
      const normalizedStateName = rawState ? normalizeState(rawState) : "";
      let matchStateObj =
        normalizedStateName && normalizedStateName !== "all"
          ? REAL_OFFICIAL_INDIA_MAP.find(
              (st) =>
                st.name.toLowerCase() === normalizedStateName ||
                st.id.toLowerCase() === normalizedStateName,
            )
          : undefined;

      if (!matchStateObj) {
        matchStateObj =
          REAL_OFFICIAL_INDIA_MAP[idx % REAL_OFFICIAL_INDIA_MAP.length];
      }

      const stateId = matchStateObj.id;
      const stateIdx = stateCounts[stateId] || 0;
      stateCounts[stateId] = stateIdx + 1;

      const baseX = matchStateObj.cx ?? 300;
      const baseY = matchStateObj.cy ?? 300;
      const baseLat =
        STATE_COORDINATES[matchStateObj.name.toLowerCase()]?.[0] ?? 22.5;
      const baseLng =
        STATE_COORDINATES[matchStateObj.name.toLowerCase()]?.[1] ?? 78.9;

      let x = baseX;
      let y = baseY;
      let lat = baseLat;
      let lng = baseLng;

      if (stateIdx > 0) {
        const angle = (stateIdx * 137.5 * Math.PI) / 180;
        const radius = Math.min(10, 4 + (stateIdx % 3) * 3);
        x = Math.round(baseX + Math.cos(angle) * radius);
        y = Math.round(baseY + Math.sin(angle) * radius);

        const geoRadius = 0.2 + (stateIdx % 4) * 0.15;
        lat = Number((baseLat + Math.sin(angle) * geoRadius).toFixed(4));
        lng = Number((baseLng + Math.cos(angle) * geoRadius).toFixed(4));
      }

      const rawRole = (safeString(u.role) || "expert").toLowerCase();
      let roleLabel = "AGRICULTURAL EXPERT";
      if (rawRole === "admin") roleLabel = "SYSTEM ADMIN";
      else if (rawRole === "moderator") roleLabel = "CONTENT MODERATOR";
      else if (rawRole === "auditor") roleLabel = "QUALITY AUDITOR";
      else if (rawRole === "gate_keeper" || rawRole === "gatekeeper")
        roleLabel = "GATEKEEPER";
      else if (rawRole === "expert") roleLabel = "AGRONOMY EXPERT";
      else roleLabel = rawRole.toUpperCase();

      const crop = safeString(u.preference?.crops?.[0]);

      const expertiseList: string[] = [];
      if (crop && crop.toLowerCase() !== "all") expertiseList.push(crop);
      if (expertiseList.length === 0) {
        const defaultExpertiseSets = [
          ["Organic Farming", "Crop Protection"],
          ["Soil Health", "Nutrient Balancing"],
          ["Pest & Disease Control", "Horticulture"],
          ["Agronomy", "Irrigation Technology"],
          ["Seed Science", "Sustainable Agriculture"],
        ];
        expertiseList.push(
          ...defaultExpertiseSets[idx % defaultExpertiseSets.length],
        );
      }

      const universityStr = safeString(u.university);
      const districtStr = safeString(u.preference?.district);

      const institution =
        universityStr || `${matchStateObj.name} KVK & SAU Network`;
      const city = districtStr || `${matchStateObj.name} Hub`;

      const createdDate = u.createdAt ? new Date(u.createdAt) : null;
      const baseCount =
        createdDate && !isNaN(createdDate.getTime())
          ? Math.max(
              40,
              480 -
                Math.floor(
                  (Date.now() - createdDate.getTime()) /
                    (1000 * 60 * 60 * 24 * 5),
                ),
            )
          : 110 + idx * 12;
      const advisoriesCount = Math.max(20, baseCount + (idx % 7) * 16);

      dynamicMapped.push({
        id: `user-api-${idx}`,
        name: userName,
        role: roleLabel,
        roleType: (rawRole as any) || "agronomist",
        institution,
        city,
        state: matchStateObj.name,
        avatar: getAvatarUrl(u.avatar, userName),
        expertise: expertiseList,
        advisoriesCount,
        x,
        y,
        lat,
        lng,
      });
    });

    return dynamicMapped;
  }, [publicUsers, mode]);

  const activeStateName = selectedState;

  const nounPlural = mode === "kvk" ? "KVKs" : mode === "sau" ? "SAUs" : "experts";
  const networkTitle =
    mode === "kvk"
      ? "Pan-India KVK Network"
      : mode === "sau"
        ? "Pan-India SAU Network"
        : "Pan-India Expert Network";

  const visibleExperts = useMemo(() => {
    if (!activeStateName) {
      if (activeProfileId) {
        const activeExp = experts.find((e) => e.id === activeProfileId);
        return activeExp ? [activeExp] : experts;
      }
      return experts;
    }
    return experts.filter(
      (e) => e.state.toLowerCase() === activeStateName.toLowerCase(),
    );
  }, [experts, activeStateName, activeProfileId]);

  const bannerExperts = useMemo(() => {
    return activeStateName ? visibleExperts : experts;
  }, [activeStateName, visibleExperts, experts]);

  const hoveredProfile = useMemo(() => {
    if (!activeProfileId) return null;
    return experts.find((e) => e.id === activeProfileId) || null;
  }, [experts, activeProfileId]);

  return (
    <div
      className={`expert-network-layout-wrap ${className}`}
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "nowrap",
        gap: "14px",
        width: "100%",
        borderRadius: "24px",
        background: "#081c15",
        padding: "14px",
        border: "1px solid rgba(214, 183, 99, 0.25)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        boxSizing: "border-box",
        alignItems: "stretch",
      }}
    >
      {/* Custom Styles */}
      <style>{`
        @keyframes leafletPulse {
          0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0.9; }
          50% { transform: translate(-50%, -50%) scale(1.4); opacity: 0.3; }
          100% { transform: translate(-50%, -50%) scale(0.6); opacity: 0.9; }
        }
        .leaflet-container {
          background: #061710 !important;
          border-radius: 18px;
          z-index: 1 !important;
        }
        .leaflet-expert-custom-icon {
          background: transparent !important;
          border: none !important;
        }
        .india-tooltip {
          background: rgba(6, 25, 35, 0.95) !important;
          color: #faf8f1 !important;
          border: 1px solid rgba(214, 183, 99, 0.5) !important;
          border-radius: 8px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          box-shadow: 0 4px 14px rgba(0,0,0,0.5) !important;
        }
        .india-tooltip::before { display: none !important; }
        .sidebar-expert-list::-webkit-scrollbar {
          width: 5px;
        }
        .sidebar-expert-list::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
        }
        .sidebar-expert-list::-webkit-scrollbar-thumb {
          background: rgba(214, 183, 99, 0.4);
          border-radius: 4px;
        }
      `}</style>

      {/* LEFT: Compact Map Container (Flex ~58% width) */}
      <div
        style={{
          flex: "1 1 58%",
          minWidth: "0",
          position: "relative",
          borderRadius: "18px",
          overflow: "hidden",
          height: "540px",
          background: "#061710",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        {/* View Switcher Toggle Button (Leaflet Map vs 3D Vector SVG) */}
        <div
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            zIndex: 1100,
            background: "rgba(6, 25, 35, 0.92)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(214, 183, 99, 0.4)",
            borderRadius: "14px",
            padding: "3px",
            display: "flex",
            gap: "3px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode("leaflet")}
            style={{
              padding: "4px 10px",
              borderRadius: "10px",
              border: "none",
              background: viewMode === "leaflet" ? "#d6b763" : "transparent",
              color: viewMode === "leaflet" ? "#0d2b1f" : "#faf8f1",
              fontWeight: 800,
              fontSize: "0.7rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>🗺️</span> Leaflet
          </button>
          <button
            type="button"
            onClick={() => setViewMode("svg")}
            style={{
              padding: "4px 10px",
              borderRadius: "10px",
              border: "none",
              background: viewMode === "svg" ? "#d6b763" : "transparent",
              color: viewMode === "svg" ? "#0d2b1f" : "#faf8f1",
              fontWeight: 800,
              fontSize: "0.7rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>🎨</span> 3D Vector
          </button>
        </div>

        {/* Registered Active Users Badge bottom-left */}
        <div
          style={{
            position: "absolute",
            bottom: "12px",
            left: "12px",
            zIndex: 1100,
            background: "rgba(6, 25, 35, 0.92)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(214, 183, 99, 0.4)",
            padding: "5px 12px",
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: "#f8f4e6",
            fontSize: "0.72rem",
            fontWeight: 700,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "#22c55e",
              boxShadow: "0 0 8px #22c55e",
            }}
          />
          <span>
            {`${(publicUsers?.filter((u) => u.role?.toLowerCase() !== "admin").length ?? 0).toLocaleString()} ACTIVE ${nounPlural.toUpperCase()}`}
          </span>
        </div>

        {/* Leaflet Map vs 3D Vector Render */}
        {viewMode === "leaflet" ? (
          <MapContainer
            center={[22.5, 78.9629]}
            zoom={5}
            minZoom={4.2}
            maxZoom={10}
            zoomControl={false}
            style={{ width: "100%", height: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            />

            {Boolean(statesGeo) && (
              <GeoJSON
                key={`states-${selectedState}-${hoveredState}`}
                data={statesGeo as any}
                style={(feature) => {
                  const stName =
                    feature?.properties?.NAME_1 ||
                    feature?.properties?.st_nm ||
                    "";
                  const isSelected =
                    selectedState &&
                    normalizeState(selectedState) === normalizeState(stName);
                  const isHovered =
                    hoveredState &&
                    normalizeState(hoveredState) === normalizeState(stName);

                  return {
                    fillColor: isSelected
                      ? "#f1d879"
                      : isHovered
                        ? "#d6b763"
                        : "#133a2a",
                    fillOpacity: isSelected ? 0.75 : isHovered ? 0.6 : 0.45,
                    color: isSelected || isHovered ? "#ffffff" : "#3e7e5e",
                    weight: isSelected ? 2.4 : isHovered ? 1.8 : 0.9,
                  };
                }}
                onEachFeature={(feature, layer) => {
                  const stName =
                    feature?.properties?.NAME_1 ||
                    feature?.properties?.st_nm ||
                    "";
                  layer.bindTooltip(`<b>${stName}</b>`, {
                    sticky: true,
                    className: "india-tooltip",
                  });
                  layer.on({
                    mouseover: () => setHoveredState(stName),
                    mouseout: () => setHoveredState(null),
                    click: () => {
                      const norm = normalizeState(stName);
                      setSelectedState((prev) =>
                        prev && normalizeState(prev) === norm ? null : stName,
                      );
                      setPinsVisible(true);
                      const bounds = (layer as L.Polygon).getBounds?.();
                      if (bounds) setFlyTarget(bounds);
                    },
                  });
                }}
              />
            )}

            {pinsVisible && visibleExperts.map((exp) => {
              const isPinHovered = activeProfileId === exp.id;
              const avatarHref = failedAvatars[exp.id]
                ? getInitialsAvatarUrl(exp.name)
                : getAvatarUrl(exp.avatar, exp.name);

              const icon = createCustomMarkerIcon(
                avatarHref,
                exp.name,
                isPinHovered,
              );

              return (
                <Marker
                  key={exp.id}
                  position={[exp.lat, exp.lng]}
                  icon={icon}
                  eventHandlers={{
                    mouseover: () => setActivePinId(exp.id),
                    mouseout: () => setActivePinId(null),
                    click: () =>
                      setSelectedPinId((prev) =>
                        prev === exp.id ? null : exp.id,
                      ),
                  }}
                />
              );
            })}

            <LeafletFlyTo target={flyTarget} />
          </MapContainer>
        ) : (
          <svg
            viewBox="0 0 600 660"
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.6))",
            }}
          >
            <defs>
              <linearGradient id="stateDefaultGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1e543e" stopOpacity="0.92" />
                <stop offset="100%" stopColor="#0e3324" stopOpacity="0.96" />
              </linearGradient>

              <linearGradient id="stateHoverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f1d879" />
                <stop offset="100%" stopColor="#b68f30" />
              </linearGradient>

              <filter id="glowGold" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              <filter id="pinShadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#000000" floodOpacity="0.6" />
              </filter>
            </defs>

            <g
              onMouseOver={(e) => {
                const target = e.target as SVGPathElement;
                const stateName = target.getAttribute("data-state-name");
                if (stateName && stateName !== hoveredState) {
                  setHoveredState(stateName);
                }
              }}
              onMouseLeave={() => setHoveredState(null)}
              onClick={(e) => {
                const target = e.target as SVGPathElement;
                const stateName = target.getAttribute("data-state-name");
                if (stateName) {
                  setSelectedState((prev) => (prev === stateName ? null : stateName));
                  setPinsVisible(true);
                }
              }}
            >
              {REAL_OFFICIAL_INDIA_MAP.map((st, stIdx) => {
                const matches = (name: string | null) =>
                  Boolean(name) &&
                  (name!.toLowerCase() === st.name.toLowerCase() ||
                    name!.toLowerCase() === st.id.toLowerCase());
                const isHovered = matches(selectedState) || matches(hoveredState);

                return (
                  <ExpertStatePath
                    key={`${st.id}-${stIdx}`}
                    st={st}
                    isHovered={isHovered}
                  />
                );
              })}
            </g>

            {pinsVisible && visibleExperts.map((exp) => {
              const isPinHovered = activeProfileId === exp.id;
              const avatarHref = failedAvatars[exp.id]
                ? getInitialsAvatarUrl(exp.name)
                : getAvatarUrl(exp.avatar, exp.name);

              return (
                <g
                  key={exp.id}
                  transform={`translate(${exp.x}, ${exp.y})`}
                  onMouseEnter={() => setActivePinId(exp.id)}
                  onMouseLeave={() => setActivePinId(null)}
                  onClick={() =>
                    setSelectedPinId((prev) => (prev === exp.id ? null : exp.id))
                  }
                  style={{
                    cursor: "pointer",
                    transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    transform: isPinHovered
                      ? `translate(${exp.x}px, ${exp.y - 10}px) scale(1.35)`
                      : `translate(${exp.x}px, ${exp.y}px) scale(1)`,
                    zIndex: isPinHovered ? 100 : 1,
                  }}
                >
                  <circle r="18" fill="none" stroke="#d6b763" strokeWidth="1.5" opacity="0.6">
                    <animate attributeName="r" values="10;26;10" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0.0;0.8" dur="2.4s" repeatCount="indefinite" />
                  </circle>

                  <path
                    d="M 0,-24 C -12,-24 -18,-14 0,4 C 18,-14 12,-24 0,-24 Z"
                    fill={isPinHovered ? "#f1d879" : "#0d2b1f"}
                    stroke="#d6b763"
                    strokeWidth="2"
                    filter="url(#pinShadow)"
                  />

                  <g transform="translate(0, -15)">
                    <clipPath id={`avatar-clip-${exp.id}`}>
                      <circle cx="0" cy="0" r="9.5" />
                    </clipPath>
                    <circle cx="0" cy="0" r="10.5" fill="#d6b763" />
                    <image
                      href={avatarHref}
                      x="-9.5"
                      y="-9.5"
                      height="19"
                      width="19"
                      clipPath={`url(#avatar-clip-${exp.id})`}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  </g>

                  {isPinHovered && (
                    <text
                      x="0"
                      y="16"
                      textAnchor="middle"
                      fill={isPinHovered ? "#f1d879" : "#ffffff"}
                      fontSize={isPinHovered ? "9.5" : "8"}
                      fontWeight="800"
                      style={{
                        fontFamily: "Manrope, sans-serif",
                        paintOrder: "stroke",
                        stroke: "rgba(6, 25, 35, 0.98)",
                        strokeWidth: "3.5px",
                        strokeLinejoin: "round",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {exp.name.split(" ")[0]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* RIGHT: Dedicated Data Sidebar Panel (Fixed 300px width on Right Side) */}
      <div
        style={{
          flex: "0 0 300px",
          width: "300px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          background: "rgba(6, 25, 35, 0.92)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(214, 183, 99, 0.35)",
          borderRadius: "18px",
          padding: "14px",
          height: "540px",
          boxSizing: "border-box",
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        }}
      >
        {/* Sidebar Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "8px",
            borderBottom: "1px solid rgba(214, 183, 99, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#d6b763",
                boxShadow: "0 0 10px #d6b763",
                flexShrink: 0,
              }}
            />
            <h3
              style={{
                margin: 0,
                color: "#faf8f1",
                fontSize: "0.86rem",
                fontWeight: 800,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {activeStateName || networkTitle}
            </h3>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            <span style={{ color: "#d6b763", opacity: 0.85, fontWeight: 700, fontSize: "0.72rem" }}>
              ({activeStateName ? visibleExperts.length : experts.length})
            </span>
            {selectedState && (
              <button
                type="button"
                onClick={() => {
                  setSelectedState(null);
                  setSelectedPinId(null);
                  setActivePinId(null);
                  setFlyTarget(null);
                }}
                aria-label={`Close ${selectedState}`}
                style={{
                  width: "18px",
                  height: "18px",
                  flexShrink: 0,
                  borderRadius: "50%",
                  border: "1px solid rgba(214,183,99,0.5)",
                  background: "rgba(255,255,255,0.1)",
                  color: "#f8f4e6",
                  cursor: "pointer",
                  fontSize: "12px",
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Scrollable List of Experts / KVKs / SAUs */}
        <div
          className="sidebar-expert-list"
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "5px",
            paddingRight: "2px",
          }}
        >
          {bannerExperts.length > 0 ? (
            bannerExperts.map((exp) => {
              const isSelected = activeProfileId === exp.id;
              const subText = exp.coveredBy
                ? `Covered by ${exp.coveredBy}`
                : [exp.city, exp.role].filter(Boolean).join(" · ");
              return (
                <button
                  key={exp.id}
                  onMouseEnter={() => setActivePinId(exp.id)}
                  onMouseLeave={() => setActivePinId(null)}
                  onClick={() => {
                    setSelectedPinId((prev) => (prev === exp.id ? null : exp.id));
                    if (exp.lat && exp.lng) {
                      setFlyTarget([[exp.lat, exp.lng], [exp.lat, exp.lng]]);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 8px",
                    borderRadius: "10px",
                    textAlign: "left",
                    cursor: "pointer",
                    border: isSelected
                      ? "1px solid #f1d879"
                      : "1px solid rgba(255,255,255,0.08)",
                    background: isSelected
                      ? "rgba(214,183,99,0.22)"
                      : "rgba(255,255,255,0.04)",
                    color: "#f8f4e6",
                    transition: "all 0.15s ease",
                  }}
                >
                  <img
                    src={
                      failedAvatars[exp.id]
                        ? getInitialsAvatarUrl(exp.name)
                        : getAvatarUrl(exp.avatar, exp.name)
                    }
                    alt=""
                    onError={() =>
                      setFailedAvatars((prev) => ({ ...prev, [exp.id]: true }))
                    }
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      objectFit: "cover",
                      flexShrink: 0,
                      border: "1.5px solid rgba(214,183,99,0.5)",
                    }}
                  />
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {exp.name}
                    </span>
                    {subText && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 500,
                          opacity: 0.75,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {subText}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          ) : (
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.78rem", padding: "12px", textAlign: "center" }}>
              No {nounPlural} found in {activeStateName || "this region"}
            </div>
          )}
        </div>

        {/* Selected / Hovered Profile Details Box */}
        {hoveredProfile && (
          <div
            style={{
              background: "rgba(10, 30, 22, 0.95)",
              border: "1.5px solid rgba(214, 183, 99, 0.5)",
              borderRadius: "12px",
              padding: "10px",
              marginTop: "auto",
              boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
              position: "relative",
              flexShrink: 0,
            }}
          >
            {selectedPinId && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPinId(null);
                  setActivePinId(null);
                }}
                aria-label="Close detail"
                style={{
                  position: "absolute",
                  top: "6px",
                  right: "6px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  border: "1px solid rgba(214,183,99,0.4)",
                  background: "rgba(255,255,255,0.1)",
                  color: "#f8f4e6",
                  cursor: "pointer",
                  fontSize: "11px",
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <img
                src={
                  failedAvatars[hoveredProfile.id]
                    ? getInitialsAvatarUrl(hoveredProfile.name)
                    : getAvatarUrl(hoveredProfile.avatar, hoveredProfile.name)
                }
                alt={hoveredProfile.name}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "1.5px solid #d6b763",
                }}
              />
              <div style={{ minWidth: 0 }}>
                <h4 style={{ margin: 0, fontSize: "0.8rem", fontWeight: 800, color: "#faf8f1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {hoveredProfile.name}
                </h4>
                <span style={{ fontSize: "0.64rem", fontWeight: 700, color: "#d6b763", textTransform: "uppercase" }}>
                  {hoveredProfile.role}
                </span>
              </div>
            </div>

            <div style={{ fontSize: "0.7rem", color: "#d1d5db", display: "grid", gap: "3px" }}>
              <div>📍 <strong>{hoveredProfile.city}, {hoveredProfile.state}</strong></div>
              <div>🏛 {hoveredProfile.institution}</div>
              {hoveredProfile.coveredBy && (
                <div>👤 Covered by {hoveredProfile.coveredBy}</div>
              )}
            </div>

            {hoveredProfile.expertise.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                {hoveredProfile.expertise.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      background: "rgba(214, 183, 99, 0.15)",
                      color: "#fef08a",
                      border: "1px solid rgba(214, 183, 99, 0.3)",
                      padding: "2px 6px",
                      borderRadius: "8px",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpertNetworkMap;
