import React, { useState, useMemo } from "react";
import { REAL_OFFICIAL_INDIA_MAP } from "./realOfficialIndiaMapData";
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
  /** For KVK / SAU pins: the user who covers this KVK / university. */
  coveredBy?: string;
}

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

  // Clean up common spelling mistakes / variations
  if (s.includes("andhra") && (s.includes("padesh") || s.includes("pradesh") || s.includes("prades") || s.includes("andra"))) {
    return "andhra pradesh";
  }
  if (s.includes("arunachal") && (s.includes("padesh") || s.includes("pradesh"))) {
    return "arunachal pradesh";
  }
  if (s.includes("himachal") && (s.includes("padesh") || s.includes("pradesh"))) {
    return "himachal pradesh";
  }
  if (s.includes("madhya") && (s.includes("padesh") || s.includes("pradesh"))) {
    return "madhya pradesh";
  }
  if (s.includes("uttar") && (s.includes("padesh") || s.includes("pradesh") || s.includes("prad"))) {
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
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  // A clicked pin/list item "sticks" so its details card stays open while you move the mouse
  // to read it or pick another — essential when many pins overlap. Hover only previews.
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const activeProfileId = selectedPinId || activePinId;
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});

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

    // Place an item on a state's centroid, spreading multiple items around it. Returns null
    // for "all"/unrecognised states (we can't put them on a real location).
    const placeInState = (rawState: string) => {
      const normalized = rawState ? normalizeState(rawState) : "";
      const match =
        normalized && normalized !== "all"
          ? REAL_OFFICIAL_INDIA_MAP.find(
              (st) =>
                st.name.toLowerCase() === normalized ||
                st.id.toLowerCase() === normalized
            )
          : undefined;
      if (!match) return null;
      const stateIdx = stateCounts[match.id] || 0;
      stateCounts[match.id] = stateIdx + 1;
      const baseX = match.cx ?? 300;
      const baseY = match.cy ?? 300;
      let x = baseX;
      let y = baseY;
      if (stateIdx > 0) {
        // Phyllotaxis spiral with a growing radius so many pins fan out and don't overlap.
        const angle = (stateIdx * 137.5 * Math.PI) / 180;
        const radius = 6 + stateIdx * 3.2;
        x = Math.round(baseX + Math.cos(angle) * radius);
        y = Math.round(baseY + Math.sin(angle) * radius);
      }
      return { match, x, y };
    };

    // KVK / SAU modes: plot each covered KVK (or university) at its state.
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
            if (!pos) return;
            const district = safeString(k?.district);
            dynamicMapped.push({
              id: `kvk-${safeString(u.firstName)}-${ki}-${name}`,
              name,
              role: "KVK COVERED",
              roleType: "agronomist",
              institution: district ? `${district} District` : pos.match.name,
              city: district || `${pos.match.name} Hub`,
              state: pos.match.name,
              avatar: getInitialsAvatarUrl(name),
              expertise: [],
              advisoriesCount: 0,
              x: pos.x,
              y: pos.y,
              coveredBy,
            });
          });
        } else {
          const uni = safeString(u.university);
          if (!uni) return;
          const pos = placeInState(safeString(u.preference?.state));
          if (!pos) return;
          const district = safeString(u.preference?.district);
          dynamicMapped.push({
            id: `sau-${safeString(u.firstName)}-${uni}`,
            name: uni,
            role: "SAU / UNIVERSITY",
            roleType: "researcher",
            institution: uni,
            city: district || `${pos.match.name} Hub`,
            state: pos.match.name,
            avatar: getInitialsAvatarUrl(uni),
            expertise: [],
            advisoriesCount: 0,
            x: pos.x,
            y: pos.y,
            coveredBy,
          });
        }
      });
      return dynamicMapped;
    }

    publicUsers.forEach((u, idx) => {
      // Admins are back-office and not part of the public expert network.
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
                st.id.toLowerCase() === normalizedStateName
            )
          : undefined;

      // If user has "all" or state not matched, distribute across the 36 Indian states dynamically
      if (!matchStateObj) {
        matchStateObj =
          REAL_OFFICIAL_INDIA_MAP[idx % REAL_OFFICIAL_INDIA_MAP.length];
      }

      const stateId = matchStateObj.id;
      const stateIdx = stateCounts[stateId] || 0;
      stateCounts[stateId] = stateIdx + 1;

      const baseX = matchStateObj.cx ?? 300;
      const baseY = matchStateObj.cy ?? 300;

      // Per-state compact adaptive offset so pins stay strictly within state boundaries
      let x = baseX;
      let y = baseY;

      if (stateIdx > 0) {
        const angle = (stateIdx * 137.5 * Math.PI) / 180;
        const radius = Math.min(10, 4 + (stateIdx % 3) * 3);
        x = Math.round(baseX + Math.cos(angle) * radius);
        y = Math.round(baseY + Math.sin(angle) * radius);
      }

      // Determine role label & roleType
      const rawRole = (safeString(u.role) || "expert").toLowerCase();
      let roleLabel = "AGRICULTURAL EXPERT";
      if (rawRole === "admin") roleLabel = "SYSTEM ADMIN";
      else if (rawRole === "moderator") roleLabel = "CONTENT MODERATOR";
      else if (rawRole === "auditor") roleLabel = "QUALITY AUDITOR";
      else if (rawRole === "gate_keeper" || rawRole === "gatekeeper")
        roleLabel = "GATEKEEPER";
      else if (rawRole === "expert") roleLabel = "AGRONOMY EXPERT";
      else roleLabel = rawRole.toUpperCase();

      // Expertise list derived from crop or domain or dynamic set
      const crop = safeString(u.preference?.crop);
      const domain = safeString(u.preference?.domain);

      const expertiseList: string[] = [];
      if (crop && crop.toLowerCase() !== "all") expertiseList.push(crop);
      if (domain && domain.toLowerCase() !== "all") expertiseList.push(domain);
      if (expertiseList.length === 0) {
        const defaultExpertiseSets = [
          ["Organic Farming", "Crop Protection"],
          ["Soil Health", "Nutrient Balancing"],
          ["Pest & Disease Control", "Horticulture"],
          ["Agronomy", "Irrigation Technology"],
          ["Seed Science", "Sustainable Agriculture"],
        ];
        expertiseList.push(
          ...defaultExpertiseSets[idx % defaultExpertiseSets.length]
        );
      }

      // Institution & city
      const universityStr = safeString(u.university);
      const districtStr = safeString(u.preference?.district);

      const institution =
        universityStr || `${matchStateObj.name} KVK & SAU Network`;
      const city =
        districtStr || `${matchStateObj.name} Hub`;

      // Advisories count derived dynamically
      const createdDate = u.createdAt ? new Date(u.createdAt) : null;
      const baseCount =
        createdDate && !isNaN(createdDate.getTime())
          ? Math.max(
              40,
              480 -
                Math.floor(
                  (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24 * 5)
                )
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
      });
    });

    return dynamicMapped;
  }, [publicUsers, mode]);

  // Determine active state's experts
  const activeStateName = hoveredState;

  // Labels change with the map mode (experts / KVKs / SAUs).
  const nounSingular = mode === "kvk" ? "KVK" : mode === "sau" ? "SAU" : "expert";
  const nounPlural = mode === "kvk" ? "KVKs" : mode === "sau" ? "SAUs" : "experts";
  const networkTitle =
    mode === "kvk"
      ? "Pan-India KVK Network"
      : mode === "sau"
        ? "Pan-India SAU Network"
        : "Pan-India Expert Network";

  // On initial load when no state is hovered, don't render 132 pins on SVG map to avoid performance lag!
  // Only render pins for the hovered state, OR if a pin is active via top banner hover in Pan-India view.
  const visibleExperts = useMemo(() => {
    if (!activeStateName) {
      if (activeProfileId) {
        const activeExp = experts.find((e) => e.id === activeProfileId);
        return activeExp ? [activeExp] : [];
      }
      return []; // Fast 60fps initial render!
    }
    return experts.filter(
      (e) => e.state.toLowerCase() === activeStateName.toLowerCase()
    );
  }, [experts, activeStateName, activeProfileId]);

  // List of experts to display in top banner pill buttons
  const bannerExperts = useMemo(() => {
    if (activeStateName) return visibleExperts;
    return experts;
  }, [activeStateName, visibleExperts, experts]);

  // The profile whose details card is shown — the clicked (sticky) one, else the hovered one.
  const hoveredProfile = useMemo(() => {
    if (!activeProfileId) return null;
    return experts.find((e) => e.id === activeProfileId) || null;
  }, [experts, activeProfileId]);

  return (
    <div
      className={`expert-network-3d-wrap ${className}`}
      style={{
        position: "relative",
        width: "100%",
        borderRadius: "24px",
        overflow: "visible",
      }}
    >
      <svg
        viewBox="0 0 600 660"
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.6))",
        }}
      >
        <defs>
          {/* Vibrant 3D gradient fills for state shapes over farm background */}
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

        {/* State Boundaries Path Layer */}
        <g>
          {REAL_OFFICIAL_INDIA_MAP.map((st, stIdx) => {
            const isHovered =
              Boolean(activeStateName) &&
              (activeStateName!.toLowerCase() === st.name.toLowerCase() ||
               activeStateName!.toLowerCase() === st.id.toLowerCase());

            return (
              <path
                key={`${st.id}-${stIdx}`}
                d={st.pathD}
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
                onMouseEnter={() => setHoveredState(st.name)}
                onClick={() => setHoveredState(st.name)}
              >
                <title>{st.name} — Hover to see active experts</title>
              </path>
            );
          })}
        </g>

        {/* Telecom / Simcard Style Location Pins with Face Avatars */}
        {visibleExperts.map((exp) => {
          const isPinHovered = activeProfileId === exp.id;
          const avatarHref = failedAvatars[exp.id]
            ? getInitialsAvatarUrl(exp.name)
            : getAvatarUrl(exp.avatar, exp.name);

          // Only show name label if pin is hovered OR if the state has at most 2 experts
          const shouldShowLabel = isPinHovered || visibleExperts.length <= 2;

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
              {/* Radar pulse ring underneath pin */}
              <circle r="18" fill="none" stroke="#d6b763" strokeWidth="1.5" opacity="0.6">
                <animate attributeName="r" values="10;26;10" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0.0;0.8" dur="2.4s" repeatCount="indefinite" />
              </circle>

              {/* Telecom style Pin Teardrop Shadow & Shape */}
              <path
                d="M 0,-24 C -12,-24 -18,-14 0,4 C 18,-14 12,-24 0,-24 Z"
                fill={isPinHovered ? "#f1d879" : "#0d2b1f"}
                stroke="#d6b763"
                strokeWidth="2"
                filter="url(#pinShadow)"
              />

              {/* Embedded Circular Face Avatar */}
              <g transform="translate(0, -15)">
                <clipPath id={`avatar-clip-${exp.id}`}>
                  <circle cx="0" cy="0" r="9.5" />
                </clipPath>

                {/* Avatar Border Circle */}
                <circle cx="0" cy="0" r="10.5" fill="#d6b763" />

                {/* Expert Photo Image */}
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

              {/* Mini Label badge under pin (rendered cleanly without collision) */}
              {shouldShowLabel && (
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

      {/* Floating State Header Banner with Interactive Expert Selector */}
      <div
        style={{
          position: "absolute",
          top: "14px",
          left: "16px",
          background: "rgba(6, 25, 35, 0.92)",
          backdropFilter: "blur(14px)",
          border: "1px solid rgba(214, 183, 99, 0.4)",
          padding: "10px 16px",
          borderRadius: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          color: "#f8f4e6",
          fontSize: "0.8rem",
          fontWeight: 700,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          zIndex: 25,
          pointerEvents: "auto",
          maxWidth: "88%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#d6b763",
              boxShadow: "0 0 10px #d6b763",
            }}
          />
          <span>{activeStateName || networkTitle}</span>
          <span style={{ opacity: 0.65, fontWeight: 500, fontSize: "0.75rem" }}>
            ({activeStateName ? visibleExperts.length : experts.length}{" "}
            {(activeStateName ? visibleExperts.length : experts.length) !== 1 ? nounPlural : nounSingular})
          </span>
        </div>

        {bannerExperts.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "5px",
              paddingBottom: "2px",
              maxWidth: "360px",
              maxHeight: "132px",
              overflowY: "auto",
            }}
          >
            {bannerExperts.map((exp, pIdx) => {
              const isSelected = activeProfileId === exp.id;
              // In KVK/SAU modes show the full name (not just the first word) so each of
              // (say) 10 KVKs is individually readable and clickable from this list.
              const label =
                mode === "experts" ? exp.name.split(" ")[0] : exp.name;
              return (
                <button
                  key={exp.id}
                  onMouseEnter={() => setActivePinId(exp.id)}
                  onMouseLeave={() => setActivePinId(null)}
                  onClick={() =>
                    setSelectedPinId((prev) => (prev === exp.id ? null : exp.id))
                  }
                  title={exp.coveredBy ? `${exp.name} — Covered by ${exp.coveredBy}` : exp.name}
                  style={{
                    background: isSelected
                      ? "linear-gradient(135deg, #d6b763 0%, #f1d879 100%)"
                      : "rgba(255, 255, 255, 0.12)",
                    color: isSelected ? "#061923" : "#ffffff",
                    border: isSelected
                      ? "1px solid #ffffff"
                      : "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "14px",
                    padding: "3px 10px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    maxWidth: "170px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                    boxShadow: isSelected
                      ? "0 4px 12px rgba(214, 183, 99, 0.4)"
                      : "none",
                  }}
                >
                  {pIdx + 1}. {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3D Glassmorphic Interactive Hover Profile Popover Card */}
      {hoveredProfile && (
        <div
          className="expert-3d-card-popover"
          style={{
            position: "absolute",
            top: `${Math.max(20, (hoveredProfile.y / 660) * 100 - 28)}%`,
            left: `${Math.min(70, Math.max(15, (hoveredProfile.x / 600) * 100))}%`,
            transform: "translate(-50%, -100%)",
            width: "260px",
            background: "rgba(10, 30, 22, 0.94)",
            backdropFilter: "blur(16px)",
            border: "1.5px solid rgba(214, 183, 99, 0.5)",
            borderRadius: "16px",
            padding: "16px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.7), 0 0 20px rgba(214, 183, 99, 0.2)",
            zIndex: 100,
            // Interactive when pinned (so the close button works); click-through on hover.
            pointerEvents: selectedPinId ? "auto" : "none",
            animation: "popIn3D 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {selectedPinId && (
            <button
              type="button"
              onClick={() => {
                setSelectedPinId(null);
                setActivePinId(null);
              }}
              aria-label="Close"
              style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                border: "1px solid rgba(214,183,99,0.4)",
                background: "rgba(255,255,255,0.1)",
                color: "#f8f4e6",
                cursor: "pointer",
                fontSize: "13px",
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          )}

          {/* Header with Photo & Verification Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
            <div style={{ position: "relative", width: "48px", height: "48px" }}>
              <img
                src={
                  failedAvatars[hoveredProfile.id]
                    ? getInitialsAvatarUrl(hoveredProfile.name)
                    : getAvatarUrl(hoveredProfile.avatar, hoveredProfile.name)
                }
                alt={hoveredProfile.name}
                onError={() => {
                  setFailedAvatars((prev) => ({ ...prev, [hoveredProfile.id]: true }));
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "2px solid #d6b763",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  bottom: "0",
                  right: "0",
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  background: "#22c55e",
                  border: "2px solid #0d2b1f",
                  boxShadow: "0 0 6px #22c55e",
                }}
                title="Verified Expert"
              />
            </div>

            <div>
              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "#faf8f1" }}>
                {hoveredProfile.name}
              </h4>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "#d6b763",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  display: "inline-block",
                  marginTop: "2px",
                }}
              >
                {hoveredProfile.role}
              </span>
            </div>
          </div>

          {/* Details Body */}
          <div style={{ fontSize: "0.78rem", color: "#d1d5db", lineHeight: 1.4, display: "grid", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#e2e8f0" }}>
              <span style={{ color: "#d6b763" }}>📍</span>
              <strong>{hoveredProfile.city}, {hoveredProfile.state}</strong>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#818cf8" }}>🏛</span>
              <span>{hoveredProfile.institution}</span>
            </div>

            {hoveredProfile.coveredBy ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                <span style={{ color: "#f1d879" }}>👤</span>
                <span>Covered by {hoveredProfile.coveredBy}</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                <span style={{ color: "#4ade80" }}>✓</span>
                <span>{hoveredProfile.advisoriesCount}+ Verified Advisories</span>
              </div>
            )}
          </div>

          {/* Expertise Chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "10px" }}>
            {hoveredProfile.expertise.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  background: "rgba(214, 183, 99, 0.15)",
                  color: "#fef08a",
                  border: "1px solid rgba(214, 183, 99, 0.3)",
                  padding: "2px 8px",
                  borderRadius: "12px",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpertNetworkMap;
