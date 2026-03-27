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
    healthScore >= 75 ? "text-[#1E7A3C]" : healthScore >= 50 ? "text-[#854F0B]" : "text-[#A32D2D]";

  return (
    <aside className="w-[210px] bg-white border-r border-gray-200 shrink-0 flex flex-col overflow-y-auto overflow-x-hidden relative">
      {/* ── NAV SECTIONS ── */}
      <div className="flex-1 pt-4 pb-20">
        {NAV_SECTIONS.map((section) => (
          <div key={section.sectionLabel}>
            <SidebarSectionLabel>{section.sectionLabel}</SidebarSectionLabel>

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
      <div className="absolute bottom-0 left-0 w-full px-4 py-3 border-t border-gray-200 bg-white">
        <div className="text-[11px] text-gray-400">Health score</div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1 bg-gray-100 rounded-sm overflow-hidden">
            <div
              className="h-full bg-[#3AAA5A] rounded-sm transition-all duration-600"
              style={{ width: healthBarWidth }}
            />
          </div>
          <span className={`text-xs font-medium ${healthScoreColor}`}>
            {healthScore}
          </span>
        </div>
        <div className="text-[10px] text-[#BA7517] mt-0.5">
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
      className={`
        flex items-center gap-2.5 px-4 py-2 cursor-pointer text-[13px] select-none
        transition-all duration-150 border-l-2
        ${active
          ? "border-l-[#3AAA5A] bg-[#EAF6EC] text-[#1E7A3C] font-medium"
          : "border-l-transparent text-gray-500 font-normal hover:bg-gray-50"
        }
      `}
    >
      {/* Icon */}
      <span className="shrink-0 flex items-center">
        {icon}
      </span>

      {/* Label */}
      <span className="flex-1">{label}</span>

      {/* Badge */}
      {badge && (
        <span
          className={`
            text-[10px] font-medium px-1.5 py-px rounded-full text-white
            ${badgeVariant === "amber" ? "bg-[#BA7517]" : "bg-[#E24B4A]"}
          `}
        >
          {badge}
        </span>
      )}

      {/* Expand/collapse chevron */}
      {expandable && <ChevronIcon expanded={!!expanded} />}
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
      className={`
        flex items-center gap-2.5 pl-8 pr-4 py-[7px] cursor-pointer text-xs select-none
        transition-all duration-150 border-l-2
        ${active
          ? "border-l-[#3AAA5A] bg-[#f0faf2] text-[#1E7A3C] font-medium"
          : "border-l-transparent text-gray-400 font-normal hover:bg-gray-50"
        }
      `}
    >
      {active && (
        <span className="w-[5px] h-[5px] rounded-full bg-[#3AAA5A] shrink-0 inline-block" />
      )}
      {label}
    </div>
  );
};

const SidebarSectionLabel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="text-[10px] font-medium text-gray-400 px-4 mt-4 mb-1 uppercase tracking-wider">
    {children}
  </div>
);

// ─── CHEVRON ICON ─────────────────────────────────────────────────────────────

interface ChevronIconProps {
  expanded: boolean;
}

const ChevronIcon: React.FC<ChevronIconProps> = ({ expanded }) => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 12 12"
    fill="none"
    className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : "rotate-0"}`}
  >
    <path d="M2 4l4 4 4-4" stroke="#aaa" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
