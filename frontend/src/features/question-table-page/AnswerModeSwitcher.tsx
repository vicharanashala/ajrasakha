import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { TopRightBadge } from "@/components/NewBadge";
import { MessageCircle, Pencil, Radio, Sparkles, UserRound } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export const MODES = [
    { id: "ajraskha", label: "AJRASKHA", icon: Sparkles },
    { id: "manual", label: "Manual", icon: UserRound },
    { id: "outreach", label: "Outreach", icon: Radio },
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
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
};

type Mode = typeof MODES[number]["id"];

export function AnswerModeSwitcher({
    answerMode,
    handleAnswerModeChange,
}: {
    answerMode: Mode;
    handleAnswerModeChange: (mode: Mode) => void;
}) {
    const groupRef = useRef<HTMLDivElement>(null);
    const [glider, setGlider] = useState({ left: 0, width: 0 });

    useEffect(() => {
        const activeBtn = groupRef.current?.querySelector<HTMLButtonElement>(
            `[data-mode="${answerMode}"]`
        );
        if (activeBtn && groupRef.current) {
            setGlider({ 
                left: activeBtn.offsetLeft, 
                width: activeBtn.offsetWidth 
            });
        }
    }, [answerMode]);

    return (
        <div
            ref={groupRef}
            className="relative flex w-full sm:w-auto items-center gap-0.5 rounded-xl border border-border bg-muted/50 py-3 px-1 overflow-x-auto scrollbar-hiding flex-nowrap"
        >
            <span
                className="absolute inset-y-1.5 rounded-lg border border-border/60 bg-background shadow-sm transition-all duration-200"
                style={{ left: glider.left, width: glider.width }}
            />

            {MODES.map(({ id, label, icon: Icon }) => (
                <Tooltip key={id} delayDuration={1200}>
                    <TooltipTrigger asChild >
                        <button
                            data-mode={id}
                            onClick={() => handleAnswerModeChange(id)}
                            className={`relative z-10 flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${answerMode === id
                                ? "text-primary-foreground scale-[1.02]"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            <Icon className="h-4 w-4" />
                            {id === "outreach" && (
                                <TopRightBadge label="new" right={0} />
                            )}

                            {label}
                        </button>
                    </TooltipTrigger>

                    <TooltipContent side="top" className="max-w-xs text-sm">
                        {MODE_DESCRIPTIONS[id]}
                    </TooltipContent>
                </Tooltip>
            ))}
        </div>
    );
}