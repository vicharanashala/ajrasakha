import React, { useState, useEffect, useCallback } from "react";

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

// ─── ICONS ────────────────────────────────────────────────────────────────────

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
        <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.2" />
        <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
);
const ChartLineIcon: React.FC = () => (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
        <path d="M2 12l3-4 3 2 3-5 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
const GlobeIcon: React.FC = () => (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 2v6l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
);
const StarIcon: React.FC = () => (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
        <path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5 6.5 5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
);
const BugIcon: React.FC = () => (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
);
const ListIcon: React.FC = () => (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
        <path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
);
const SunIcon: React.FC = () => (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
        <path d="M8 2v2M8 12v2M2 8h2M12 8h2M4.5 4.5l1.4 1.4M10.1 10.1l1.4 1.4M4.5 11.5l1.4-1.4M10.1 5.9l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
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
            { label: "Overview", icon: <GridIcon />, view: "overview" },
            { label: "Farmer segments", icon: <UserIcon />, view: "farmer-segments", children: FARMER_SEGMENT_CHILDREN },
            { label: "Usage patterns", icon: <ChartLineIcon />, view: "usage-patterns" },
            { label: "Geo intelligence", icon: <GlobeIcon />, view: "geo-intelligence" },
        ],
    },
    {
        sectionLabel: "Quality",
        items: [
            { label: "Feedback & sentiment", icon: <StarIcon />, view: "feedback-sentiment" },
            { label: "Bugs & UX issues", icon: <BugIcon />, view: "bugs-ux", badge: "7", badgeVariant: "red" },
        ],
    },
    {
        sectionLabel: "Intelligence",
        items: [
            { label: "Query analysis", icon: <ListIcon />, view: "query-analysis", badge: "28%", badgeVariant: "amber" },
            { label: "App health score", icon: <SunIcon />, view: "app-health" },
        ],
    },
];

const MOBILE_BREAKPOINT = 768;

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
    activeView,
    onViewChange,
    healthScore = 70,
    healthLabel = "Moderate · needs improvement",
}) => {
    const [segmentsExpanded, setSegmentsExpanded] = useState<boolean>(false);
    const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<boolean>(() => window.innerWidth <= MOBILE_BREAKPOINT);
    const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= MOBILE_BREAKPOINT);

    // Track mobile/desktop and auto-collapse on mobile
    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
            setIsMobile(mobile);
            if (mobile) setCollapsed(true);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Escape key closes sidebar on mobile
    useEffect(() => {
        if (!isMobile || collapsed) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setCollapsed(true);
        };
        document.addEventListener("keydown", handleEsc);
        return () => document.removeEventListener("keydown", handleEsc);
    }, [isMobile, collapsed]);

    const handleNavClick = useCallback((view: DashboardView, hasChildren?: boolean) => {
        if (hasChildren) {
            if (collapsed) {
                setCollapsed(false);
                setSegmentsExpanded(true);
            } else {
                setSegmentsExpanded((prev) => !prev);
            }
        } else {
            setActiveSegmentId(null);
            // On mobile, close sidebar when a non-expandable item is clicked
            if (isMobile) setCollapsed(true);
        }
        onViewChange(view);
    }, [collapsed, isMobile, onViewChange]);

    const handleChildClick = useCallback((childId: string, parentView: DashboardView) => {
        setActiveSegmentId(childId);
        onViewChange(parentView);
        // On mobile, close after selecting a child
        if (isMobile) setCollapsed(true);
    }, [isMobile, onViewChange]);

    const healthBarWidth = `${Math.min(100, Math.max(0, healthScore))}%`;
    const healthScoreColor =
        healthScore >= 75 ? "#1E7A3C" : healthScore >= 50 ? "#854F0B" : "#A32D2D";

    // On mobile when expanded: overlay mode. Otherwise: inline mode.
    const isOverlay = isMobile && !collapsed;

    // Sidebar content (shared between inline and overlay modes)
    const sidebarContent = (
        <aside
            style={{
                transition: isMobile
                    ? "transform 0.28s cubic-bezier(0.4,0,0.2,1)"
                    : "width 0.28s cubic-bezier(0.4,0,0.2,1)",
            }}
            className={`
                bg-(--card) border-r border-(--border) shrink-0
                flex flex-col overflow-hidden relative
                ${isMobile
                    ? "w-[220px] h-full"
                    : collapsed ? "w-[58px]" : "w-[220px]"
                }
            `}
        >
            {/* ── HEADER: hamburger + close ── */}
            <div className={`
                flex items-center border-b border-(--border) h-[52px]
                ${collapsed && !isMobile ? "justify-center px-0" : "justify-between px-3"}
            `}>
                <button
                    onClick={() => setCollapsed((p) => !p)}
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    className="flex items-center justify-center rounded-lg w-8 h-8 shrink-0 text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--accent) transition-all duration-150"
                >
                    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                        <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>

                {/* Close ✕ button only on mobile overlay */}
                {isOverlay && (
                    <button
                        onClick={() => setCollapsed(true)}
                        aria-label="Close sidebar"
                        className="flex items-center justify-center rounded-lg w-8 h-8 shrink-0 text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--accent) transition-all duration-150"
                    >
                        <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </button>
                )}
            </div>

            {/* ── NAV SECTIONS ── */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden pb-20 pt-1">
                {NAV_SECTIONS.map((section) => (
                    <div key={section.sectionLabel}>
                        {/* Section label — hidden when collapsed on desktop */}
                        <div className={`
                            overflow-hidden transition-all duration-200
                            ${(collapsed && !isMobile) ? "h-0 opacity-0 mt-0" : "h-auto opacity-100 mt-3"}
                        `}>
                            <div className="text-[10px] font-semibold text-(--muted-foreground) px-4 mb-1 uppercase tracking-widest">
                                {section.sectionLabel}
                            </div>
                        </div>

                        {/* Dot separator when collapsed on desktop */}
                        {collapsed && !isMobile && (
                            <div className="flex justify-center my-2">
                                <div className="w-1 h-1 rounded-full bg-(--border)" />
                            </div>
                        )}

                        {section.items.map((item) => {
                            const isActive = activeView === item.view;
                            const isExpandable = !!(item.children && item.children.length > 0);
                            const showExpanded = isExpandable && segmentsExpanded && (!collapsed || isMobile);

                            return (
                                <div key={item.view}>
                                    <NavItemRow
                                        label={item.label}
                                        icon={item.icon}
                                        badge={item.badge}
                                        badgeVariant={item.badgeVariant}
                                        active={isActive}
                                        expandable={isExpandable}
                                        expanded={showExpanded}
                                        collapsed={collapsed && !isMobile}
                                        onClick={() => handleNavClick(item.view, isExpandable)}
                                    />
                                    {isExpandable && showExpanded && (
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
            <div className="absolute bottom-0 left-0 w-full border-t border-(--border) bg-(--card) overflow-hidden">
                {(collapsed && !isMobile) ? (
                    <div className="flex justify-center items-center py-3" title={`Health score: ${healthScore} — ${healthLabel}`}>
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ background: `conic-gradient(${healthScoreColor} ${healthScore * 3.6}deg, #e5e7eb ${healthScore * 3.6}deg)` }}
                        >
                            <div className="w-5 h-5 rounded-full bg-(--card) flex items-center justify-center">
                                <span style={{ color: healthScoreColor }} className="text-[9px] font-bold">{healthScore}</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] text-(--muted-foreground)">Health score</span>
                            <span className="text-[12px] font-semibold" style={{ color: healthScoreColor }}>{healthScore}</span>
                        </div>
                        <div className="w-full h-[3px] bg-(--muted) rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-700 ease-out"
                                style={{ width: healthBarWidth, background: healthScoreColor }}
                            />
                        </div>
                        <div className="text-[10px] mt-1.5" style={{ color: "#BA7517" }}>
                            {healthLabel}
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );

    // ── MOBILE: overlay drawer ──
    if (isMobile) {
        return (
            <>
                {/* Collapsed state: just the hamburger strip */}
                {collapsed && (
                    <div className="shrink-0 flex items-center justify-center w-[24px] h-full border-r border-(--border) bg-(--card)">
                        <button
                            onClick={() => setCollapsed(false)}
                            aria-label="Open sidebar"
                            title="Open sidebar"
                            className="flex items-center justify-center rounded-md w-5 h-5 text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--accent) transition-all duration-150"
                        >
                            <svg width={12} height={12} viewBox="0 0 16 16" fill="none">
                                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Overlay: backdrop + drawer */}
                {!collapsed && (
                    <div
                        className="fixed inset-0 z-50 flex"
                        style={{ animation: "fadeIn 0.15s ease-out" }}
                    >
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                            onClick={() => setCollapsed(true)}
                        />
                        {/* Drawer */}
                        <div
                            className="relative z-10 h-full"
                            style={{ animation: "slideInLeft 0.28s cubic-bezier(0.4,0,0.2,1)" }}
                        >
                            {sidebarContent}
                        </div>
                    </div>
                )}

                {/* Keyframe animations */}
                <style>{`
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes slideInLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }
                `}</style>
            </>
        );
    }

    // ── DESKTOP: inline collapsible ──
    return sidebarContent;
};

// ─── NAV ITEM ROW ─────────────────────────────────────────────────────────────

interface NavItemRowProps {
    label: string;
    icon: React.ReactNode;
    badge?: string;
    badgeVariant?: "red" | "amber";
    active: boolean;
    expandable?: boolean;
    expanded?: boolean;
    collapsed?: boolean;
    onClick: () => void;
}

const NavItemRow: React.FC<NavItemRowProps> = ({
    label, icon, badge, badgeVariant = "red",
    active, expandable, expanded, collapsed = false, onClick,
}) => (
    <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
        title={collapsed ? label : undefined}
        className={`
            group relative flex items-center cursor-pointer select-none
            transition-all duration-150
            ${collapsed
                ? "mx-2 my-0.5 rounded-lg justify-center px-0 py-2.5"
                : "px-3 py-2 mx-2 my-0.5 rounded-lg gap-2.5 text-[13px]"
            }
            ${active
                ? "bg-[#EAF6EC] dark:bg-[#1a3a24] text-[#1E7A3C] dark:text-[#4adc64] font-medium"
                : "text-(--muted-foreground) hover:bg-(--accent) hover:text-(--foreground)"
            }
        `}
    >
        {active && (
            <span className={`
                absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#3AAA5A]
                ${collapsed ? "-left-2" : "-left-3"}
            `} />
        )}

        <span className="shrink-0 flex items-center scale-75 md:scale-100">{icon}</span>

        {!collapsed && (
            <>
                <span className="flex-1 leading-snug">{label}</span>
                {badge && (
                    <span className={`text-[10px] font-medium px-1.5 py-px rounded-full text-white leading-none ${badgeVariant === "amber" ? "bg-[#BA7517]" : "bg-[#E24B4A]"}`}>
                        {badge}
                    </span>
                )}
                {expandable && (
                    <svg width={12} height={12} viewBox="0 0 12 12" fill="none"
                        style={{ transition: "transform 0.2s ease" }}
                        className={`shrink-0 ${expanded ? "rotate-180" : "rotate-0"}`}
                    >
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </>
        )}

        {collapsed && badge && (
            <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${badgeVariant === "amber" ? "bg-[#BA7517]" : "bg-[#E24B4A]"}`} />
        )}
    </div>
);

// ─── CHILD NAV ITEM ROW ───────────────────────────────────────────────────────

interface ChildNavItemRowProps {
    label: string;
    active: boolean;
    onClick: () => void;
}

const ChildNavItemRow: React.FC<ChildNavItemRowProps> = ({ label, active, onClick }) => (
    <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
        className={`
            flex items-center gap-2 pl-10 pr-3 py-[6px] mx-2 my-0.5 rounded-lg
            cursor-pointer text-xs select-none transition-all duration-150
            ${active
                ? "bg-[#f0faf2] dark:bg-[#1a3a24] text-[#1E7A3C] dark:text-[#4adc64] font-medium"
                : "text-(--muted-foreground) hover:bg-(--accent) hover:text-(--foreground)"
            }
        `}
    >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? "bg-[#3AAA5A]" : "bg-(--border)"}`} />
        {label}
    </div>
);
