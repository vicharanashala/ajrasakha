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
import { Skeleton } from "@/components/atoms/skeleton";

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
  isLoading: boolean
  districtAnalytic?: any
  metric: "questions" | "users" | "activeUsers"
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
  todayActiveFarmersData,
  isLoading = false,
  districtAnalytic,
  metric = "questions",
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


    const totalBlockCoordinator = districtAnalytic?.slice(1).reduce((acc: number, data: any)=> acc+data?.blockCoordinator, 0);

    const totalDistrictCoordinator = districtAnalytic?.slice(1).reduce((acc: number, data: any)=> acc+data?.districtCoordinator, 0);

    const totalVillageVolunteer = districtAnalytic?.slice(1).reduce((acc: number, data: any)=> acc+data?.villageCoordinator, 0);

  const uniqueSubTotal = districtAnalytic?.reduce((acc: number, data: any) => acc+data?.uniqueQuestions, 0);

  const duplicateSubTotal = districtAnalytic?.reduce((acc:number, data: any) => acc+data?.duplicateQuestions, 0);

  const districtData = districtAnalytic?.find((data: any)=> data.district === selectedDistrict);


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

  const renderCardValue = (
  value: string | number,
) => {
  if (isLoading) {
    return (
      <Skeleton className="h-6 w-16" />
    );
  }

  return value;
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
  // label="Questions"

  label = {
    <div className="flex items-center gap-1">
      <span>Questions</span>
      {!isIndiaView && <TooltipProvider>
        <Tooltip>
           <TooltipTrigger asChild>
            <InfoIcon className="h-3 w-3 cursor-pointer text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent side="top">
            <div className="space-y-1 text-xs">

              <div>
                Duplicate Questions {": "}
                {selectedDistrict ?  districtData.duplicateQuestions : duplicateSubTotal}
              </div>

              
              <div>
                Unique Questions {": "}
                {selectedDistrict ?  districtData.uniqueQuestions : uniqueSubTotal}
              </div>

            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>}
    </div>
  }
  value={renderCardValue(fmt(
    isIndiaView
      ? questionStatusData?.closedVsTotalQuestions.totalQuestions
      : activeAnalytics.questions
  ))}
  icon={<Activity className="h-3.5 w-3.5" />}
/>
          <StatCard
  label="Answers"
  value={renderCardValue(fmt(
    isIndiaView
      ? questionStatusData?.closedVsTotalQuestions.closed.count
      : activeAnalytics.answers
  ))}
  icon={<Activity className="h-3.5 w-3.5" />}
/>
            <StatCard
  label="Users"
  value={renderCardValue(fmt(
    isIndiaView
      ? allUsers.totalUsers
      : activeAnalytics.users
  ))}
  icon={<Users className="h-3.5 w-3.5" />}
/>
            <StatCard
  label="Active"
  value={renderCardValue(fmt(
    isIndiaView
      ? todayActiveFarmersData?.totalUsers
      : activeAnalytics.activeUsers
  ))}
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
                {isIndiaView ? allUsers?.userRoleCounts?.districtCoordinator ?? 0: selectedState? totalDistrictCoordinator : districtData?.districtCoordinator}
              </div>

              <div>
                Block Coordinators:{" "}
                {isIndiaView ? allUsers?.userRoleCounts?.blockCoordinator ?? 0: selectedState? totalBlockCoordinator: districtData?.blockCoordinator}
              </div>

              <div>
                Village Volunteers:{" "}
                {isIndiaView ? allUsers?.userRoleCounts?.villageVolunteer ?? 0: selectedDistrict ? totalVillageVolunteer: districtData?.villageVolunteer}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  }
  value={renderCardValue(fmt(
    isIndiaView
      ? allUsers?.userRoleCounts?.coordinator
      : activeAnalytics.coordinators
  ))}
  icon={<Building2 className="h-3.5 w-3.5" />}
/>
            <StatCard
              label="Avg closure"
              value={`${
                districtAnalytics || stateAnalytics
                  ? (activeAnalytics.closureHrs / 60).toFixed(2)
                  : (questionStatusData?.closedVsTotalQuestions.closed.avgTimeMinutes / 60).toFixed(2)
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
            isLoading = {isLoading}
            renderCardValue= {renderCardValue}
            metric={metric}
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
            state = {selectedState}
            source={source}
            userType= {userType}
          />
        )}
      </div>
    </aside>
  );
}