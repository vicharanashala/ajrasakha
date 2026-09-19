import { useMemo, useState } from "react";
import FunctionsPanel from "./components/FunctionsPanel/FunctionsPanel";
import PopTranslationPanel from "./components/FunctionsPanel/PopTranslationPanel";
import DocumentManagementPanel from "./components/DocumentManagement/DocumentManagementPanel";

// Reaching this dashboard at all requires admin/moderator/expert (PlaygroundHeader.tsx,
// mobile-sidebar.tsx) — FAQ-Cluster narrows further to admin only; POP-Translation and
// POP-Management (renamed from "Document Management" 2026-09-18) are open to the same audience as
// the parent tab.
const ALL_TABS = [
  { id: "faq-cluster", label: "FAQ-Cluster", roles: ["admin"] },
  { id: "pop-translation", label: "POP-Translation", roles: ["admin", "moderator", "expert"] },
  { id: "document-management", label: "POP-Management", roles: ["admin", "moderator", "expert"] },
] as const;

type TabId = (typeof ALL_TABS)[number]["id"];

// userRole comes from play-ground.tsx's useGetCurrentUser() — the tab that renders this dashboard
// is already gated to admin/moderator/expert there, so `role` is always one of those three, but
// the filter below is written defensively rather than assuming that stays true forever.
export function DataProcessingDashboard({ userRole }: { userRole?: string | null }) {
  const TABS = useMemo(() => ALL_TABS.filter((t) => t.roles.includes(userRole as any)), [userRole]);
  const [activeTab, setActiveTab] = useState<TabId>("faq-cluster");
  const effectiveTab = TABS.some((t) => t.id === activeTab) ? activeTab : TABS[0]?.id;

  return (
    <div className="flex flex-col">
      <div className="flex gap-1 border-b border-border px-4 py-2.5 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
              ${
                effectiveTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {effectiveTab === "faq-cluster" && <FunctionsPanel />}
        {effectiveTab === "pop-translation" && (
          <PopTranslationPanel onJobCreated={() => {}} />
        )}
        {effectiveTab === "document-management" && <DocumentManagementPanel />}
      </div>
    </div>
  );
}
