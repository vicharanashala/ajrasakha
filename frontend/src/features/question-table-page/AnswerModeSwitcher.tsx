import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { TopRightBadge } from "@/components/NewBadge";
import { BookOpen, FileText, LeafyGreen, MessageCircle, Radio, Search, Sparkles, UserCheck, UserRound } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export const MODES = [
    { id: "ajraskha", label: "AJRASKHA", icon: Sparkles },
    { id: "manual", label: "Manual", icon: UserRound },
    { id: "outreach", label: "Outreach", icon: Radio },
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    { id: "draft", label: "Draft", icon: FileText },
    { id: "pae", label: "PAE", icon: UserCheck },
    { id: "non_agri", label: "Non-Agri", icon: LeafyGreen },
    { id: "training", label: "Training", icon: BookOpen },
    // { id: "dynamic", label: "Dynamic", icon: Zap },
] as const

const MODE_DESCRIPTIONS: Record<string, string> = {
    ajraskha:
        "Questions coming from Ajraskha chatbot (Source: AJRASAKHA)",
    manual:
        "Questions added by moderators (Source: AGRI_EXPERT)",
    whatsapp:
        "Questions coming from WhatsApp chatbot (Source: WHATSAPP)",
    outreach:
        "Questions collected via outreach programs (Source: OUTREACH)",
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
};

export function AnswerModeSwitcher({
    answerMode,
    handleAnswerModeChange,
    hasSearch = false,
    sourceCounts,
    totalSearchCount,
    showDedicated = false,
    isDedicatedView = false,
    onDedicatedClick,
}: {
    answerMode: Mode;
    handleAnswerModeChange: (mode: Mode) => void;
    hasSearch?: boolean;
    sourceCounts?: { source: string; count: number }[];
    totalSearchCount?: number;
    /** Show the "My Assignment" tab (moderator/admin only) */
    showDedicated?: boolean;
    /** True when the dedicated tab is currently active */
    isDedicatedView?: boolean;
    /** Called when the dedicated tab is clicked */
    onDedicatedClick?: () => void;
}) {
    const groupRef = useRef<HTMLDivElement>(null);
    const [glider, setGlider] = useState({ left: 0, width: 0 });

    useEffect(() => {
        const activeBtn = groupRef.current?.querySelector<HTMLButtonElement>(
            isDedicatedView ? `[data-mode="dedicated"]` : `[data-mode="${answerMode}"]`
        );
        if (activeBtn && groupRef.current) {
            setGlider({
                left: activeBtn.offsetLeft,
                width: activeBtn.offsetWidth
            });
        }
    }, [answerMode, isDedicatedView]);

    return (
        <div
            ref={groupRef}
            className="relative flex w-full items-center gap-0.5 rounded-xl border border-border bg-muted/50 py-2 px-1.5 overflow-x-auto scrollbar-hiding flex-nowrap"
        >
            <span
                className="absolute inset-y-1 rounded-lg border border-border/60 bg-background shadow-sm transition-all duration-200"
                style={{ left: glider.left, width: glider.width }}
            />

            {hasSearch && (
                <Tooltip delayDuration={1200}>
                    <TooltipTrigger asChild>
                        <button
                            data-mode="search"
                            onClick={() => handleAnswerModeChange("search")}
                            className={`relative z-10 flex flex-shrink-0 items-center gap-1.5 px-5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${answerMode === "search"
                                ? "text-primary-foreground scale-[1.02]"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            <Search className="h-4 w-4" />
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

            {MODES.map(({ id, label, icon: Icon }) => {
                const srcKey = Object.entries(SOURCE_TO_MODE).find(([, mode]) => mode === id)?.[0];
                const srcCount = srcKey ? sourceCounts?.find(s => s.source === srcKey)?.count : undefined;
                return (
                    <Tooltip key={id} delayDuration={1200}>
                        <TooltipTrigger asChild>
                            <button
                                data-mode={id}
                                onClick={() => handleAnswerModeChange(id as Mode)}
                                className={`relative z-10 flex flex-shrink-0 items-center gap-1.5 px-5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${!isDedicatedView && answerMode === id
                                    ? "text-primary-foreground scale-[1.02]"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                <Icon className="h-4 w-4" />
                                {(id === "draft" || id === "pae" || id === "non_agri" || id === "training") && (
                                    <TopRightBadge label="new" right={0} />
                                )}
                                {label}
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
                <>
                    <Tooltip delayDuration={1200}>
                        <TooltipTrigger asChild>
                            <button
                                data-mode="dedicated"
                                onClick={onDedicatedClick}
                                className={`relative z-10 flex flex-shrink-0 items-center gap-1.5 px-5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
                                    isDedicatedView
                                        ? "text-primary-foreground scale-[1.02]"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <UserCheck className="h-4 w-4" />
                                My Assignment
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-sm">
                            Questions assigned to you for moderation
                        </TooltipContent>
                    </Tooltip>
                </>
            )}
        </div>
    );
}