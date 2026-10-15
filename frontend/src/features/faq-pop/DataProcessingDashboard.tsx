import { useEffect, useMemo, useState } from "react";
import FunctionsPanel from "./components/FunctionsPanel/FunctionsPanel";
import PopTranslationPanel from "./components/FunctionsPanel/PopTranslationPanel";
import DocumentManagementPanel from "./components/DocumentManagement/DocumentManagementPanel";
import UserManagementPanel from "./components/DocumentManagement/UserManagementPanel";
import { setPopIdentity, getDashboardMe, type DashboardMe } from "./api";

// Reaching this dashboard at all now requires only being signed in (PlaygroundHeader.tsx,
// play-ground.tsx, mobile-sidebar.tsx — previously admin/moderator/expert only; every role gets
// whatever access an expert had) — FAQ-Cluster narrows further to admin only. POP-Translation
// (both the legacy file-tree runner here AND every translation-related action inside
// POP-Management — Translate button, upload/delete translation & review, cancel job) requires
// can_translate from GET /dashboard/me (backend 403s otherwise) — a per-user list, not a role.
// POP-Management itself is open to every role that reaches this dashboard — everyone gets
// view/download/filter, edits are gated inside by can_edit (also a per-user list). "User
// Management" is admin-only (is_admin) — unchanged.
const ALL_TABS = [
  { id: "faq-cluster", label: "FAQ-Cluster", roles: ["admin"] },
  { id: "pop-translation", label: "POP-Translation" },
  { id: "document-management", label: "POP-Management" },
] as const;

type TabId = (typeof ALL_TABS)[number]["id"] | "user-management";

export function DataProcessingDashboard({
  userRole,
  userId,
}: {
  userRole?: string | null;
  userId?: string | null;
}) {
  // Every POP_API request needs X-User-Id/X-User-Role — keep the module-level identity in api.ts
  // in sync with whoever is signed in, before any dashboard panel below fires its first request.
  useEffect(() => {
    setPopIdentity(userId || undefined, userRole || undefined);
  }, [userId, userRole]);

  const [me, setMe] = useState<DashboardMe | null>(null);
  useEffect(() => {
    if (!userId) return;
    getDashboardMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, [userId, userRole]);

  const TABS = useMemo(() => {
    const base = ALL_TABS.filter((t) => {
      if (t.id === "pop-translation") return Boolean(me?.can_translate);
      if (t.id === "document-management") return true;
      return (t as { roles: readonly string[] }).roles.includes(userRole as any);
    });
    if (me?.is_admin) {
      return [...base, { id: "user-management" as const, label: "User Management" }];
    }
    return base;
  }, [userRole, me]);

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
        {effectiveTab === "document-management" && (
          <DocumentManagementPanel
            canEdit={Boolean(me?.can_edit)}
            canTranslate={Boolean(me?.can_translate)}
            canApproveUploads={Boolean(me?.can_approve_uploads)}
            isAdmin={Boolean(me?.is_admin)}
          />
        )}
        {effectiveTab === "user-management" && <UserManagementPanel />}
      </div>
    </div>
  );
}
