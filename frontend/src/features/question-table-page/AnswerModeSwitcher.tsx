import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import {
    BookOpen,
    ChevronLeft,
    ChevronRight,
    FileText,
    LeafyGreen,
    MessageCircle,
    Radio,
    Search,
    Shuffle,
    Sparkles,
    Sprout,
    UserCheck,
    UserRound,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export const MODES = [
    { id: "ajraskha", label: "AJRASAKHA", icon: Sparkles },
    { id: "manual", label: "Manual", icon: UserRound },
    { id: "outreach", label: "Outreach", icon: Radio },
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    { id: "annadatha", label: "AnnaDatha", icon: Sprout },
    { id: "draft", label: "Draft", icon: FileText },
    { id: "pae", label: "PAE", icon: UserCheck },
    { id: "non_agri", label: "Non-Agri", icon: LeafyGreen },
    { id: "training", label: "Training", icon: BookOpen },
    { id: "dynamic", label: "Dynamic", icon: Shuffle },
] as const;

const MODE_DESCRIPTIONS: Record<string, string> = {
    ajraskha:
        "Questions coming from Ajraskha chatbot (Source: AJRASAKHA)",
    manual:
        "Questions added by moderators (Source: AGRI_EXPERT)",
    whatsapp:
        "Questions coming from WhatsApp chatbot (Source: WHATSAPP)",
    outreach:
        "Questions collected via outreach programs (Source: OUTREACH)",
    annadatha:
        "Questions from AnnaDatha collection (Source: QUESTION_COLLECTION)",
    draft:
        "Questions saved as draft (Status: Draft)",
    pae:
        "Questions assigned to PAE experts (pae_review: true)",
    non_agri:
        "Non-agricultural questions separated for dedicated tracking",
    dynamic:
        "Questions marked as dynamic (Status: Dynamic)",
    search:
        "Search results across all sources",
    training:
        "Questions used for training purposes",
};

type Mode = typeof MODES[number]["id"] | "search";

const SOURCE_TO_MODE: Record<string, string> = {
    AJRASAKHA: "ajraskha",
    AGRI_EXPERT: "manual",
    WHATSAPP: "whatsapp",
    OUTREACH: "outreach",
    QUESTION_COLLECTION: "annadatha",
};

export type DedicatedSubTab = "questions" | "feedbacks";

export function AnswerModeSwitcher({
    answerMode,
    handleAnswerModeChange,
    currentUserIsTrainingUser = false,
    currentUserIsAdmin = false,
    canViewTraining = false,
    hasSearch = false,
    sourceCounts,
    totalSearchCount,
    showDedicated = false,
    isDedicatedView = false,
    onDedicatedClick,
    dedicatedSubTab,
    onDedicatedSubTabChange,
}: {
    answerMode: Mode;
    handleAnswerModeChange: (mode: Mode) => void;
    currentUserIsTrainingUser?: boolean;
    currentUserIsAdmin?: boolean;
    canViewTraining?: boolean;
    hasSearch?: boolean;
    sourceCounts?: { source: string; count: number }[];
    totalSearchCount?: number;
    /** Show the "My Assignment" tab (moderator/admin only) */
    showDedicated?: boolean;
    /** True when the dedicated tab is currently active */
    isDedicatedView?: boolean;
    /** Called when the dedicated tab is clicked */
    onDedicatedClick?: () => void;
    /** Current sub-tab in dedicated view (questions or feedbacks) - controlled by parent */
    dedicatedSubTab?: DedicatedSubTab;
    /** Called when the dedicated sub-tab changes - controlled by parent */
    onDedicatedSubTabChange?: (tab: DedicatedSubTab) => void;
}) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const groupRef = useRef<HTMLDivElement>(null);
    const [glider, setGlider] = useState({ left: 0, width: 0 });
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [isMouseDown, setIsMouseDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeftState, setScrollLeftState] = useState(0);

    const visibleModes = currentUserIsTrainingUser
        ? MODES.filter((mode) => mode.id === "training")
        : (currentUserIsAdmin || canViewTraining)
            ? MODES
            : MODES.filter((mode) => mode.id !== "training");

    const updateGlider = useCallback(() => {
        const activeBtn = groupRef.current?.querySelector<HTMLButtonElement>(
            isDedicatedView ? `[data-mode="dedicated"]` : `[data-mode="${answerMode}"]`
        );
        if (activeBtn && groupRef.current) {
            setGlider({
                left: activeBtn.offsetLeft,
                width: activeBtn.offsetWidth,
            });
        }
    }, [answerMode, isDedicatedView]);

    const updateScrollButtons = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const { scrollLeft, scrollWidth, clientWidth } = container;
        const overflowing = scrollWidth > clientWidth + 4;
        setIsOverflowing(overflowing);
        setCanScrollLeft(scrollLeft > 4);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
    }, []);

    useEffect(() => {
        updateGlider();
        updateScrollButtons();

        const activeBtn = groupRef.current?.querySelector<HTMLButtonElement>(
            isDedicatedView ? `[data-mode="dedicated"]` : `[data-mode="${answerMode}"]`
        );
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        }
    }, [answerMode, isDedicatedView, updateGlider, updateScrollButtons]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        const group = groupRef.current;

        const handleResize = () => {
            updateGlider();
            updateScrollButtons();
        };

        window.addEventListener("resize", handleResize);

        let ro: ResizeObserver | null = null;
        if (group) {
            ro = new ResizeObserver(handleResize);
            ro.observe(group);
        }

        if (container) {
            container.addEventListener("scroll", updateScrollButtons, { passive: true });
        }

        const timer = setTimeout(() => {
            updateGlider();
            updateScrollButtons();
        }, 50);

        return () => {
            clearTimeout(timer);
            window.removeEventListener("resize", handleResize);
            if (ro) ro.disconnect();
            if (container) container.removeEventListener("scroll", updateScrollButtons);
        };
    }, [updateGlider, updateScrollButtons]);

    const scroll = (direction: "left" | "right") => {
        if (scrollContainerRef.current) {
            const step = Math.max(160, Math.floor(scrollContainerRef.current.clientWidth * 0.5));
            const scrollAmount = direction === "left" ? -step : step;
            scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!scrollContainerRef.current) return;
        setIsMouseDown(true);
        setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
        setScrollLeftState(scrollContainerRef.current.scrollLeft);
    };

    const handleMouseLeaveOrUp = () => {
        setIsMouseDown(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isMouseDown || !scrollContainerRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollContainerRef.current.offsetLeft;
        const walk = (x - startX) * 1.5;
        scrollContainerRef.current.scrollLeft = scrollLeftState - walk;
    };

    return (
        <div className="relative flex w-full items-center rounded-xl border border-border bg-muted/50 p-1 overflow-hidden">
            {/* Left Integrated Scroll Button (Medium devices only) */}
            {isOverflowing && (
                <button
                    type="button"
                    onClick={() => scroll("left")}
                    disabled={!canScrollLeft}
                    aria-label="Scroll tabs left"
                    className={cn(
                        "hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 mr-0.5",
                        canScrollLeft
                            ? "hover:text-foreground hover:bg-background hover:shadow-sm border border-transparent hover:border-border/60 cursor-pointer text-foreground"
                            : "opacity-25 pointer-events-none"
                    )}
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
            )}

            {/* Scrollable Tabs Track */}
            <div
                ref={scrollContainerRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeaveOrUp}
                onMouseUp={handleMouseLeaveOrUp}
                onMouseMove={handleMouseMove}
                className="relative flex flex-1 items-center overflow-x-auto overflow-y-hidden select-none scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] touch-pan-x"
            >
                <div ref={groupRef} className="relative flex items-center gap-0.5 min-w-max py-0.5 px-0.5">
                    <span
                        className="absolute inset-y-0.5 rounded-lg border border-border/60 bg-background shadow-sm transition-all duration-200"
                        style={{ left: glider.left, width: glider.width }}
                    />

                    {!currentUserIsTrainingUser && hasSearch && (
                        <Tooltip delayDuration={1200}>
                            <TooltipTrigger asChild>
                                <button
                                    data-mode="search"
                                    onClick={() => handleAnswerModeChange("search")}
                                    className={cn(
                                        "relative z-10 flex flex-shrink-0 items-center gap-1.5 px-4 sm:px-5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer select-none",
                                        !isDedicatedView && answerMode === "search"
                                            ? "text-foreground font-semibold scale-[1.01]"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Search className={cn("h-4 w-4", !isDedicatedView && answerMode === "search" ? "text-primary" : "text-muted-foreground")} />
                                    Search Results
                                    {totalSearchCount != null && (
                                        <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                                            {totalSearchCount}
                                        </span>
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-sm">
                                {MODE_DESCRIPTIONS["search"]}
                            </TooltipContent>
                        </Tooltip>
                    )}

                    {visibleModes.map(({ id, label, icon: Icon }) => {
                        const srcKey = Object.entries(SOURCE_TO_MODE).find(([, mode]) => mode === id)?.[0];
                        const srcCount = srcKey ? sourceCounts?.find(s => s.source === srcKey)?.count : undefined;
                        const isActive = !isDedicatedView && answerMode === id;
                        return (
                            <Tooltip key={id} delayDuration={1200}>
                                <TooltipTrigger asChild>
                                    <button
                                        data-mode={id}
                                        onClick={() => handleAnswerModeChange(id as Mode)}
                                        className={cn(
                                            "relative z-10 flex flex-shrink-0 items-center gap-1.5 px-4 sm:px-5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer select-none",
                                            isActive
                                                ? "text-foreground font-semibold scale-[1.01]"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                                        <span>{label}</span>
                                        
                                        {hasSearch && srcCount != null && (
                                            <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                                                {srcCount}
                                            </span>
                                        )}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-sm">
                                    {MODE_DESCRIPTIONS[id]}
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}

                    {/* Dedicated / My Assignment tab — shown only for moderators/admins */}
                    {showDedicated && (
                        <Tooltip delayDuration={1200}>
                            <TooltipTrigger asChild>
                                <button
                                    data-mode="dedicated"
                                    onClick={onDedicatedClick}
                                    className={cn(
                                        "relative z-10 flex flex-shrink-0 items-center gap-1.5 px-4 sm:px-5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer select-none",
                                        isDedicatedView
                                            ? "text-foreground font-semibold scale-[1.01]"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <UserCheck className={cn("h-4 w-4", isDedicatedView ? "text-primary" : "text-muted-foreground")} />
                                    My Assignment
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-sm">
                                Questions assigned to you
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </div>

            {/* Right Integrated Scroll Button (Medium devices only) */}
            {isOverflowing && (
                <button
                    type="button"
                    onClick={() => scroll("right")}
                    disabled={!canScrollRight}
                    aria-label="Scroll tabs right"
                    className={cn(
                        "hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 ml-0.5",
                        canScrollRight
                            ? "hover:text-foreground hover:bg-background hover:shadow-sm border border-transparent hover:border-border/60 cursor-pointer text-foreground"
                            : "opacity-25 pointer-events-none"
                    )}
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}
