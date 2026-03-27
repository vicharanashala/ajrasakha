import React, { useState } from "react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type DashboardView =
  | "overview"
  | "farmer-segments"
  | "usage-patterns"
  | "geo-intelligence"
  | "feedback-sentiment"
  | "bugs-ux"
  | "query-analysis"
  | "app-health";

interface NavItemConfig {
  label: string;
  icon: React.ReactNode;
  view: DashboardView;
  badge?: string;
  badgeVariant?: "red" | "amber";
  children?: ChildNavItem[];
}

interface ChildNavItem {
  id: string;
  label: string;
}

interface SidebarSection {
  sectionLabel: string;
  items: NavItemConfig[];
}

interface DashboardSidebarProps {
  activeView: DashboardView;
  onViewChange: (view: DashboardView) => void;
  healthScore?: number;
  healthLabel?: string;
}

// ─── ICONS (must be defined before NAV_SECTIONS which uses them) ───────────────

const GridIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1.5" fill="#3AAA5A" />
    <rect x="9" y="1" width="6" height="6" rx="1.5" fill="#3AAA5A" opacity=".5" />
    <rect x="1" y="9" width="6" height="6" rx="1.5" fill="#3AAA5A" opacity=".5" />
    <rect x="9" y="9" width="6" height="6" rx="1.5" fill="#3AAA5A" opacity=".3" />
  </svg>
);

const UserIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="6" r="3" stroke="#888" strokeWidth="1.2" />
    <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#888" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const ChartLineIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <path d="M2 12l3-4 3 2 3-5 3 3" stroke="#888" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GlobeIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="#888" strokeWidth="1.2" />
    <path d="M8 2v6l3 3" stroke="#888" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const StarIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5 6.5 5z" stroke="#888" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

const BugIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="#888" strokeWidth="1.2" />
    <path d="M8 5v4M8 11v.5" stroke="#888" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const ListIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <path d="M3 4h10M3 8h7M3 12h5" stroke="#888" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const SunIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <path d="M8 2v2M8 12v2M2 8h2M12 8h2M4.5 4.5l1.4 1.4M10.1 10.1l1.4 1.4M4.5 11.5l1.4-1.4M10.1 5.9l1.4-1.4" stroke="#888" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="8" cy="8" r="2.5" stroke="#888" strokeWidth="1.2" />
  </svg>
);

// ─── STATIC DATA ──────────────────────────────────────────────────────────────

const FARMER_SEGMENT_CHILDREN: ChildNavItem[] = [
  { id: "power", label: "Power farmers" },
  { id: "casual", label: "Casual seekers" },
  { id: "repeat", label: "Repeat askers" },
  { id: "silent", label: "Silent lurkers" },
  { id: "churned", label: "Churned users" },
  { id: "institutional", label: "Institutional" },
];

const NAV_SECTIONS: SidebarSection[] = [
  {
    sectionLabel: "Core views",
    items: [
      { label: "Overview",         icon: <GridIcon />,      view: "overview" },
      { label: "Farmer segments",  icon: <UserIcon />,      view: "farmer-segments", children: FARMER_SEGMENT_CHILDREN },
      { label: "Usage patterns",   icon: <ChartLineIcon />, view: "usage-patterns" },
      { label: "Geo intelligence", icon: <GlobeIcon />,     view: "geo-intelligence" },
    ],
  },
  {
    sectionLabel: "Quality",
    items: [
      { label: "Feedback & sentiment", icon: <StarIcon />, view: "feedback-sentiment" },
      { label: "Bugs & UX issues",     icon: <BugIcon />,  view: "bugs-ux", badge: "7", badgeVariant: "red" },
    ],
  },
  {
    sectionLabel: "Intelligence",
    items: [
      { label: "Query analysis",  icon: <ListIcon />, view: "query-analysis", badge: "28%", badgeVariant: "amber" },
      { label: "App health score", icon: <SunIcon />,  view: "app-health" },
    ],
  },
];

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeView,
  onViewChange,
  healthScore = 70,
  healthLabel = "Moderate · needs improvement",
}) => {
  const [segmentsExpanded, setSegmentsExpanded] = useState<boolean>(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  const handleNavClick = (view: DashboardView, hasChildren?: boolean) => {
    if (hasChildren) {
      setSegmentsExpanded((prev) => !prev);
    }
    onViewChange(view);
  };

  const handleChildClick = (childId: string, parentView: DashboardView) => {
    setActiveSegmentId(childId);
    onViewChange(parentView);
  };

  const healthBarWidth = `${Math.min(100, Math.max(0, healthScore))}%`;
  const healthScoreColor =
    healthScore >= 75 ? "#1E7A3C" : healthScore >= 50 ? "#854F0B" : "#A32D2D";

  return (
    <aside
      style={{
        width: 210,
        background: "#fff",
        borderRight: "0.5px solid #e5e5e5",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        overflowX: "hidden",
        position: "relative",
      }}
    >
      {/* ── NAV SECTIONS ── */}
      <div style={{ flex: 1, paddingTop: 16, paddingBottom: 80 }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.sectionLabel}>
            {/* Section label */}
            <SidebarSectionLabel>{section.sectionLabel}</SidebarSectionLabel>

            {/* Nav items */}
            {section.items.map((item) => {
              const isActive = activeView === item.view;
              const isExpandable = !!(item.children && item.children.length > 0);
              const isExpanded = isExpandable && segmentsExpanded;

              return (
                <div key={item.view}>
                  <NavItemRow
                    label={item.label}
                    icon={item.icon}
                    badge={item.badge}
                    badgeVariant={item.badgeVariant}
                    active={isActive}
                    expandable={isExpandable}
                    expanded={isExpanded}
                    onClick={() => handleNavClick(item.view, isExpandable)}
                  />

                  {/* Child items (e.g. Farmer Segments sub-items) */}
                  {isExpandable && isExpanded && (
                    <div>
                      {item.children!.map((child) => (
                        <ChildNavItemRow
                          key={child.id}
                          label={child.label}
                          active={activeSegmentId === child.id}
                          onClick={() => handleChildClick(child.id, item.view)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── HEALTH SCORE FOOTER ── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          padding: "12px 16px",
          borderTop: "0.5px solid #e5e5e5",
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 11, color: "#aaa" }}>Health score</div>
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}
        >
          <div
            style={{
              flex: 1,
              height: 4,
              background: "#f0f0f0",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: healthBarWidth,
                height: "100%",
                background: "#3AAA5A",
                borderRadius: 2,
                transition: "width 0.6s ease",
              }}
            />
          </div>
          <span
            style={{ fontSize: 12, fontWeight: 500, color: healthScoreColor }}
          >
            {healthScore}
          </span>
        </div>
        <div style={{ fontSize: 10, color: "#BA7517", marginTop: 2 }}>
          {healthLabel}
        </div>
      </div>
    </aside>
  );
};

// ─── SUB-COMPONENTS ────────────────────────────────────────────────────────────

interface NavItemRowProps {
  label: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?: "red" | "amber";
  active: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onClick: () => void;
}

const NavItemRow: React.FC<NavItemRowProps> = ({
  label,
  icon,
  badge,
  badgeVariant = "red",
  active,
  expandable,
  expanded,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 16px",
        cursor: "pointer",
        fontSize: 13,
        color: active ? "#1E7A3C" : "#666",
        fontWeight: active ? 500 : 400,
        borderLeft: `2px solid ${active ? "#3AAA5A" : "transparent"}`,
        background: active ? "#EAF6EC" : "transparent",
        transition: "all 0.15s",
        userSelect: "none",
      }}
    >
      {/* Icon */}
      <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
        {icon}
      </span>

      {/* Label */}
      <span style={{ flex: 1 }}>{label}</span>

      {/* Badge */}
      {badge && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: "1px 5px",
            borderRadius: 10,
            background: badgeVariant === "amber" ? "#BA7517" : "#E24B4A",
            color: "#fff",
          }}
        >
          {badge}
        </span>
      )}

      {/* Expand/collapse chevron */}
      {expandable && (
        <ChevronIcon expanded={!!expanded} />
      )}
    </div>
  );
};

interface ChildNavItemRowProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const ChildNavItemRow: React.FC<ChildNavItemRowProps> = ({
  label,
  active,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "7px 16px 7px 32px",
        cursor: "pointer",
        fontSize: 12,
        color: active ? "#1E7A3C" : "#888",
        fontWeight: active ? 500 : 400,
        borderLeft: `2px solid ${active ? "#3AAA5A" : "transparent"}`,
        background: active ? "#f0faf2" : "transparent",
        transition: "all 0.15s",
        userSelect: "none",
      }}
    >
      {active && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#3AAA5A",
            flexShrink: 0,
            display: "inline-block",
          }}
        />
      )}
      {label}
    </div>
  );
};

const SidebarSectionLabel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    style={{
      fontSize: 10,
      fontWeight: 500,
      color: "#aaa",
      padding: "0 16px",
      margin: "16px 0 4px",
      textTransform: "uppercase",
      letterSpacing: "0.6px",
    }}
  >
    {children}
  </div>
);

// ChevronIcon remains below — it's not used in NAV_SECTIONS so no ordering issue

interface ChevronIconProps {
  expanded: boolean;
}

const ChevronIcon: React.FC<ChevronIconProps> = ({ expanded }) => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 12 12"
    fill="none"
    style={{
      transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
      transition: "transform 0.2s ease",
      flexShrink: 0,
    }}
  >
    <path d="M2 4l4 4 4-4" stroke="#aaa" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
