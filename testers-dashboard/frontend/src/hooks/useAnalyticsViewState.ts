import { useState, useEffect } from "react";
import { useZohoTicketStatuses } from "./useZohoTicketStatuses";
import { UNASSIGNED_TEAM_LABEL } from "../utils";
import type { ITestersDashboardDiagnostics } from "../services/testersDashboardSummaryService";

export type IDefectsTabKey = "open" | "closed" | "onHold" | "escalated";
export type IAnalyticsChartTab = "trust" | "farmer" | "response" | "tat";

// Card-level view state (defect ticket views/tabs/pagination/team pills,
// Score Trend tab, expanded panels) plus the Zoho ticket-status lookups,
// shared by SheetAnalyticsSection and DbAnalyticsSection. Called at the top
// of each section - above its loading/error early returns - so this state
// survives those states exactly as it did in the former shared section.
export function useAnalyticsViewState(diagnostics: ITestersDashboardDiagnostics | undefined) {
  const { data: zohoData } = useZohoTicketStatuses();
  const zohoStatuses = zohoData?.statuses ?? {};
  const [releaseHealthExpanded, setReleaseHealthExpanded] = useState(false);
  const [weakestModuleExpanded, setWeakestModuleExpanded] = useState(false);
  // Two independent switchable views on the same card - "critical" (Critical
  // Defect Tickets: Critical/High only) and "all" (All Tickets: every
  // sheet-linked ticket, any severity). Each keeps its own active status
  // tab, pagination, and team-pill selection so switching views never leaks
  // one view's position into the other.
  const [defectsView, setDefectsView] = useState<"critical" | "all">("critical");

  const [activeDefectsTabCritical, setActiveDefectsTabCritical] = useState<IDefectsTabKey>("open");
  const [openTicketsPageCritical, setOpenTicketsPageCritical] = useState(0);
  const [closedTicketsPageCritical, setClosedTicketsPageCritical] = useState(0);
  const [onHoldTicketsPageCritical, setOnHoldTicketsPageCritical] = useState(0);
  const [escalatedTicketsPageCritical, setEscalatedTicketsPageCritical] = useState(0);
  const [selectedTeamCritical, setSelectedTeamCritical] = useState<string | null>(null);

  const [activeDefectsTabAll, setActiveDefectsTabAll] = useState<IDefectsTabKey>("open");
  const [openTicketsPageAll, setOpenTicketsPageAll] = useState(0);
  const [closedTicketsPageAll, setClosedTicketsPageAll] = useState(0);
  const [onHoldTicketsPageAll, setOnHoldTicketsPageAll] = useState(0);
  const [escalatedTicketsPageAll, setEscalatedTicketsPageAll] = useState(0);
  const [selectedTeamAll, setSelectedTeamAll] = useState<string | null>(null);

  const activeDefectsTab = defectsView === "critical" ? activeDefectsTabCritical : activeDefectsTabAll;
  const setActiveDefectsTab = defectsView === "critical" ? setActiveDefectsTabCritical : setActiveDefectsTabAll;
  const selectedTeam = defectsView === "critical" ? selectedTeamCritical : selectedTeamAll;
  const setSelectedTeam = defectsView === "critical" ? setSelectedTeamCritical : setSelectedTeamAll;
  const toggleSelectedTeam = (key: string) => setSelectedTeam((prev) => (prev === key ? null : key));

  // Switching views resets the target view to its Open tab and page 1, so
  // the user never lands mid-list in state left over from the other view.
  function switchDefectsView(view: "critical" | "all") {
    setDefectsView(view);
    if (view === "critical") {
      setActiveDefectsTabCritical("open");
      setOpenTicketsPageCritical(0);
    } else {
      setActiveDefectsTabAll("open");
      setOpenTicketsPageAll(0);
    }
  }
  const [activeChartTab, setActiveChartTab] = useState<IAnalyticsChartTab>("trust");

  const getTicketTeam = (ticketId: string): string => zohoStatuses[ticketId]?.team || UNASSIGNED_TEAM_LABEL;
  const matchesTeam = (ticketId: string, team: string | null): boolean => !team || getTicketTeam(ticketId) === team;
  const matchesSelectedTeam = (ticketId: string): boolean => matchesTeam(ticketId, selectedTeam);

  const getTicketDisplayNumber = (ticketId: string): string => zohoStatuses[ticketId]?.ticketNumber || ticketId;

  // Critical Defect Tickets view - Critical/High-only pool
  // (diagnostics.openTickets); one reset effect per status tab, each keyed
  // on this view's own team-pill selection so a team change on the All
  // Tickets view never resets this view's pagination.
  useEffect(() => {
    setOpenTicketsPageCritical(0);
  }, [
    selectedTeamCritical,
    diagnostics?.openTickets.filter((t) => {
      const status = zohoStatuses[t.id]?.status?.toLowerCase();
      return (!status || status === "open") && matchesTeam(t.id, selectedTeamCritical);
    }).length,
  ]);

  useEffect(() => {
    setClosedTicketsPageCritical(0);
  }, [
    selectedTeamCritical,
    diagnostics?.openTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "closed" && matchesTeam(t.id, selectedTeamCritical),
    ).length,
  ]);

  useEffect(() => {
    setOnHoldTicketsPageCritical(0);
  }, [
    selectedTeamCritical,
    diagnostics?.openTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "on hold" && matchesTeam(t.id, selectedTeamCritical),
    ).length,
  ]);

  useEffect(() => {
    setEscalatedTicketsPageCritical(0);
  }, [
    selectedTeamCritical,
    diagnostics?.openTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "escalated" && matchesTeam(t.id, selectedTeamCritical),
    ).length,
  ]);

  // All Tickets view - every linked ticket regardless of severity
  // (diagnostics.allTickets); same per-status reset pattern as above, keyed
  // on its own team-pill selection.
  useEffect(() => {
    setOpenTicketsPageAll(0);
  }, [
    selectedTeamAll,
    diagnostics?.allTickets.filter((t) => {
      const status = zohoStatuses[t.id]?.status?.toLowerCase();
      return (!status || status === "open") && matchesTeam(t.id, selectedTeamAll);
    }).length,
  ]);

  useEffect(() => {
    setClosedTicketsPageAll(0);
  }, [
    selectedTeamAll,
    diagnostics?.allTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "closed" && matchesTeam(t.id, selectedTeamAll),
    ).length,
  ]);

  useEffect(() => {
    setOnHoldTicketsPageAll(0);
  }, [
    selectedTeamAll,
    diagnostics?.allTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "on hold" && matchesTeam(t.id, selectedTeamAll),
    ).length,
  ]);

  useEffect(() => {
    setEscalatedTicketsPageAll(0);
  }, [
    selectedTeamAll,
    diagnostics?.allTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "escalated" && matchesTeam(t.id, selectedTeamAll),
    ).length,
  ]);

  const deriveTicketStatusKey = (ticketId: string): IDefectsTabKey => {
    const status = zohoStatuses[ticketId]?.status?.toLowerCase();
    if (status === "closed") return "closed";
    if (status === "on hold") return "onHold";
    if (status === "escalated") return "escalated";
    return "open";
  };

  return {
    releaseHealthExpanded,
    setReleaseHealthExpanded,
    weakestModuleExpanded,
    setWeakestModuleExpanded,
    defectsView,
    switchDefectsView,
    activeDefectsTab,
    setActiveDefectsTab,
    selectedTeam,
    toggleSelectedTeam,
    activeChartTab,
    setActiveChartTab,
    pages: {
      openTicketsPageCritical,
      setOpenTicketsPageCritical,
      closedTicketsPageCritical,
      setClosedTicketsPageCritical,
      onHoldTicketsPageCritical,
      setOnHoldTicketsPageCritical,
      escalatedTicketsPageCritical,
      setEscalatedTicketsPageCritical,
      openTicketsPageAll,
      setOpenTicketsPageAll,
      closedTicketsPageAll,
      setClosedTicketsPageAll,
      onHoldTicketsPageAll,
      setOnHoldTicketsPageAll,
      escalatedTicketsPageAll,
      setEscalatedTicketsPageAll,
    },
    getTicketTeam,
    matchesSelectedTeam,
    getTicketDisplayNumber,
    deriveTicketStatusKey,
  };
}

export type IAnalyticsViewState = ReturnType<typeof useAnalyticsViewState>;
