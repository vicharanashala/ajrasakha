import { useState } from "react";
import FunctionsPanel from "./components/FunctionsPanel/FunctionsPanel";
import PopTranslationPanel from "./components/FunctionsPanel/PopTranslationPanel";

const TABS = [
  { id: "faq-cluster", label: "FAQ-Cluster" },
  { id: "pop-translation", label: "POP-Translation" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DataProcessingDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("faq-cluster");

  return (
    <div className="flex flex-col">
      <div className="flex gap-1 border-b border-border px-4 py-2.5 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
              ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "faq-cluster" && <FunctionsPanel />}
        {activeTab === "pop-translation" && (
          <PopTranslationPanel onJobCreated={() => {}} />
        )}
      </div>
    </div>
  );
}
