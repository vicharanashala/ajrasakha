/** Top-level tabs in the public header. ACE is the default landing view. */
export interface DashboardTab {
  id: string;
  label: string;
  /** Not built yet — rendered disabled, can't be selected. */
  comingSoon?: boolean;
}

export const DASHBOARD_TABS: DashboardTab[] = [
  { id: "ace", label: "ACE Dashboard" },
  { id: "questions", label: "Question Collection" },
  { id: "future-1", label: "Coming soon", comingSoon: true },
  { id: "future-2", label: "Coming soon", comingSoon: true },
  { id: "future-3", label: "Coming soon", comingSoon: true },
];

export const DEFAULT_TAB = "ace";
