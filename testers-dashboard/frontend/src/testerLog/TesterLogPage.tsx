import { useState } from "react";
import { TesterLogForm } from "./components/TesterLogForm";
import { TesterLogHistory } from "./components/TesterLogHistory";
import { TesterLogSummary } from "./components/TesterLogSummary";
import { ClipboardList, History, BarChart3, Clock } from "lucide-react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { cn } from "@/lib/utils";
import type { ITesterLogEntry } from "./types";

type Tab = "form" | "history" | "summary";

export function TesterLogPage() {
    const [activeTab, setActiveTab] = useState<Tab>("form");
    const [resumeEntry, setResumeEntry] = useState<ITesterLogEntry | null>(null);
    const { data: user } = useGetCurrentUser({});

    const testerName =
        [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
        user?.email ||
        "Tester";

    const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
        {
            key: "form",
            label: resumeEntry ? `Resume (${resumeEntry.testId || "On Hold"})` : "Log New Test Case",
            icon: resumeEntry ? <Clock className="h-4 w-4 text-amber-500" /> : <ClipboardList className="h-4 w-4" />,
        },
        { key: "history", label: "My History", icon: <History className="h-4 w-4" /> },
        { key: "summary", label: "My Summary", icon: <BarChart3 className="h-4 w-4" /> },
    ];

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
            {/* Header */}
            <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Tester Log</h1>
                <p className="text-sm text-muted-foreground">
                    Log your test cases directly — data is automatically attributed to your account.
                </p>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 border-b border-border">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px cursor-pointer",
                            activeTab === tab.key
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
                        )}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div>
                <div className={activeTab === "form" ? "block" : "hidden"}>
                    <TesterLogForm
                        testerName={testerName}
                        userEmail={user?.email}
                        editingEntry={resumeEntry}
                        onCancelEdit={() => setResumeEntry(null)}
                        onSuccess={() => {
                            setResumeEntry(null);
                            setActiveTab("history");
                        }}
                    />
                </div>
                {activeTab === "history" && (
                    <div>
                        <TesterLogHistory
                            onResumeEntry={(entry) => {
                                setResumeEntry(entry);
                                setActiveTab("form");
                            }}
                        />
                    </div>
                )}
                {activeTab === "summary" && (
                    <div>
                        <TesterLogSummary
                            onLogNewTest={() => {
                                setResumeEntry(null);
                                setActiveTab("form");
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
