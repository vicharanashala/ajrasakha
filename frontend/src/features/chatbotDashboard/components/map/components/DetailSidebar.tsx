/* ============================================================
   DETAIL SIDEBAR - Right panel with stats and drill-down content
============================================================ */

import { Layers, Activity, Users, Building2 } from "lucide-react";
import type { Analytics, DistrictDetails as DistrictDetailsType, LevelKey, GeoFeature } from "../lib/types";
import { fmt } from "../lib/formatters";
import { StatCard } from "./StatCard";
import { StateList } from "./StateList";
import { DistrictList } from "./DistrictList";
import { DistrictDetails } from "./DistrictDetails";
import { useUserDetails, type PaginatedUserDetailsResponse } from "@/features/chatbotDashboard/hooks/useUserDetails";

import { Tooltip,  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
 } from "@/components/atoms/tooltip";

 import { InfoIcon } from "lucide-react";
interface MapFeatureBase {
  type: string;
  properties: Record<string, unknown>;
  geometry?: unknown;
}

interface DetailSidebarProps {
  level: LevelKey;
  selectedState: string | null;
  selectedDistrict: string | null;
  statesWithData: {
    features: MapFeatureBase[];
  } | null;
  districtsOfState: {
    features: MapFeatureBase[];
  } | null;
  districtDetails: DistrictDetailsType | null;
  onSelectState: (name: string, feature: GeoFeature) => void;
  onSelectDistrict: (name: string, feature: GeoFeature) => void;
  source: string;
  userType: string;
  questionStatusData: any;
  todayActiveFarmersData: PaginatedUserDetailsResponse
}

export function DetailSidebar({
  level,
  selectedState,
  selectedDistrict,
  statesWithData,
  districtsOfState,
  districtDetails,
  onSelectState,
  onSelectDistrict,
  source,
  userType,
  questionStatusData,
  todayActiveFarmersData
}: DetailSidebarProps) {
  // Calculate aggregated analytics
  const stateAnalytics = selectedState && statesWithData
    ? statesWithData.features.find((x) => x.properties._name === selectedState)
        ?.properties._analytics as Analytics | undefined
    : undefined;

  const districtAnalytics = selectedDistrict && districtsOfState
    ? districtsOfState.features.find((x) => x.properties._name === selectedDistrict)
        ?.properties._analytics as Analytics | undefined
    : undefined;

  const countryAnalytics = statesWithData
    ? statesWithData.features.reduce(
        (acc, f) => {
          const x = f.properties._analytics as Analytics;
          return {
            questions: acc.questions + x.questions,
            answers: acc.answers + x.answers,
            users: acc.users + x.users,
            activeUsers: acc.activeUsers + x.activeUsers,
            coordinators: acc.coordinators + x.coordinators,
            closureHrs: acc.closureHrs + x.closureHrs,
          };
        },
        { questions: 0, answers: 0, users: 0, activeUsers: 0, coordinators: 0, closureHrs: 0 },
      )
    : null;

  const activeAnalytics = districtAnalytics ?? stateAnalytics ?? countryAnalytics;
      const isIndiaView = !selectedState && !selectedDistrict;
  const {data: allUsers} = useUserDetails(undefined, undefined, 1, 1, "", source as any, "", [], [], "", "", "", "", "all",false, false, userType as any, [], "totalQuestions", "desc", false, "", "verified", true)


  const getTitle = () => {
    if (level === "india") return "Country overview";
    if (level === "state" && !selectedDistrict) return "State details";
    return "District details";
  };

  const getSubtitle = () => {
    if (selectedDistrict) return `${selectedState} · District`;
    if (selectedState) return "Click any district on the map to drill down";
    return "Click any state on the map to view its districts";
  };

  return (
    <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
          {getTitle()}
        </div>
        <h2 className="mt-1 text-xl font-semibold text-foreground">
          {selectedDistrict ?? selectedState ?? "India"}
        </h2>
        <p className="text-xs text-muted-foreground">{getSubtitle()}</p>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {/* Stats Grid */}
        {activeAnalytics && (
          <div className="grid grid-cols-2 gap-2">
            <StatCard
  label="Questions"
  value={fmt(
    isIndiaView
      ? questionStatusData?.closedVsTotalQuestions.totalQuestions
      : activeAnalytics.questions
  )}
  icon={<Activity className="h-3.5 w-3.5" />}
/>
          <StatCard
  label="Answers"
  value={fmt(
    isIndiaView
      ? questionStatusData?.closedVsTotalQuestions.closedQuestions
      : activeAnalytics.answers
  )}
  icon={<Activity className="h-3.5 w-3.5" />}
/>
            <StatCard
  label="Users"
  value={fmt(
    isIndiaView
      ? allUsers.totalUsers
      : activeAnalytics.users
  )}
  icon={<Users className="h-3.5 w-3.5" />}
/>
            <StatCard
  label="Active"
  value={fmt(
    isIndiaView
      ? todayActiveFarmersData?.totalUsers
      : activeAnalytics.activeUsers
  )}
  icon={<Users className="h-3.5 w-3.5" />}
/>
{/* <StatCard
  label="Coordinators"
  value={fmt(
    isIndiaView
      ? todayActiveFarmersData?.userRoleCounts?.coordinator
      : activeAnalytics.coordinators
  )}
  icon={<Building2 className="h-3.5 w-3.5" />}
/> */}

<StatCard
  label={
    <div className="flex items-center gap-1">
      <span>Coordinators</span>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon className="h-3 w-3 cursor-pointer text-muted-foreground" />
          </TooltipTrigger>

          <TooltipContent side="top">
            <div className="space-y-1 text-xs">
              <div>
                District Coordinators:{" "}
                {todayActiveFarmersData?.userRoleCounts?.district_coordinator ?? 0}
              </div>

              <div>
                Block Coordinators:{" "}
                {todayActiveFarmersData?.userRoleCounts?.block_coordinator ?? 0}
              </div>

              <div>
                Village Volunteers:{" "}
                {todayActiveFarmersData?.userRoleCounts?.village_volunteer ?? 0}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  }
  value={fmt(
    isIndiaView
      ? todayActiveFarmersData?.userRoleCounts?.coordinator
      : activeAnalytics.coordinators
  )}
  icon={<Building2 className="h-3.5 w-3.5" />}
/>
            <StatCard
              label="Avg closure"
              value={`${
                districtAnalytics || stateAnalytics
                  ? (activeAnalytics.closureHrs / 60).toFixed(2)
                  : (questionStatusData?.closedVsTotalQuestions.avgCloseTimeMinutes / 60).toFixed(2)
              }h`}
              icon={<Activity className="h-3.5 w-3.5" />}
            />
          </div>
        )}

        {/* State List (at India level) */}
        {!selectedState && (
          <StateList
            statesWithData={statesWithData as { features: MapFeatureBase[] } | null}
            onSelectState={onSelectState}
          />
        )}

        {/* District List (at state level) */}
        {selectedState && !selectedDistrict && (
          <DistrictList
            districtsOfState={districtsOfState as { features: MapFeatureBase[] } | null}
            selectedState={selectedState}
            onSelectDistrict={onSelectDistrict}
          />
        )}

        {/* District Details (at district level) */}
        {selectedDistrict && (
          <DistrictDetails
            details={districtDetails}
            selectedDistrict={selectedDistrict}
          />
        )}
      </div>
    </aside>
  );
}