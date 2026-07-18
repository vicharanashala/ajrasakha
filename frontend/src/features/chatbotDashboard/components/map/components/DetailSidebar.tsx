/* ============================================================
   DETAIL SIDEBAR - Right panel with stats and drill-down content
============================================================ */

import { Layers, Activity, Users, Building2 } from "lucide-react";
import type {
  Analytics,
  DistrictDetails as DistrictDetailsType,
  LevelKey,
  GeoFeature,
} from "../lib/types";
import { fmt } from "../lib/formatters";
import { StatCard } from "./StatCard";
import { StateList } from "./StateList";
import { DistrictList } from "./DistrictList";
import { DistrictDetails } from "./DistrictDetails";
import {
  useUserDetails,
  type PaginatedUserDetailsResponse,
} from "@/features/chatbotDashboard/hooks/useUserDetails";
import { Skeleton } from "@/components/atoms/skeleton";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

import { InfoIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { QueryCategoryQuestionsModal } from "../../QueryCategoryQuestionsModal";
import { ActiveUserDetailsModal } from "@/features/chatbotDashboard/ActiveUserDetailsTable";
import { useUserMertices } from "@/features/chatbotDashboard/hooks/useDashboardData";
import { FeedbackUsersModal } from "@/features/chatbotDashboard/FeedbackUsersModal";
import { useClosedQuestionLocation } from "@/features/chatbotDashboard/hooks/useFeedbackUsers";
import { ClosedInLastTwoHoursCard } from "@/features/chatbotDashboard/ClosedInLastTwoHoursCard";
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
  todayActiveFarmersData: PaginatedUserDetailsResponse;
  isLoading: boolean;
  districtAnalytic?: any;
  metric: "questions" | "users" | "activeUsers";
  status: string | null;
  handleClick: (value?: string) => void;
  setStatus: (value: string | null) => void;
  isIndiaView: boolean;
  clickedState: string | null;
  setClickedState: (value: string | null) => void;
  clickedDistrict: string | null;
  setClickedDistrict: (value: string | null) => void;
  analyticsData?: any;
  weeklyAnalyticsData?: any;
  monthlyAnalyticsData?: any;
  questionStatusRange?: any
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
  status,
  handleClick,
  setStatus,
  isIndiaView,
  clickedState,
  setClickedState,
  clickedDistrict,
  setClickedDistrict,
  analyticsData,
  weeklyAnalyticsData,
  monthlyAnalyticsData,
  questionStatusRange,
}: DetailSidebarProps) {
  const [isPassed, setIsPassed] = useState(false);
  const [showActiveUsersModal, setShowActiveUsersModal] = useState(false);
  const [showModeratorsModal, setShowModeratorsModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showFeedBackModal, setShowFeedBackModal] = useState(false);
  const [rating, setRating] = useState<"all" | "positive" | "negative">("all");
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)

  const { data: userMetricesData } = useUserMertices(
    source as any,
    userType as any,
    questionStatusRange.startTime,
    questionStatusRange.endTime,
    true,
  );

  const {
    data: closedQuestionLocationData,
    isLoading: isClosedQuestionLoading,
  } = useClosedQuestionLocation({
    source,
    userType,
    state: selectedState ?? undefined,
    district: selectedDistrict ?? undefined,
    enabled: !isIndiaView,
  });

  // Calculate aggregated analytics

  const stateAnalytics =
    selectedState && statesWithData
      ? (statesWithData.features.find(
          (x) => x.properties._name === selectedState,
        )?.properties._analytics as Analytics | undefined)
      : undefined;

  const districtAnalytics =
    selectedDistrict && districtsOfState
      ? (districtsOfState.features.find(
          (x) => x.properties._name === selectedDistrict,
        )?.properties._analytics as Analytics | undefined)
      : undefined;

  const totalBlockCoordinator = districtAnalytic
    ?.slice(1)
    .reduce((acc: number, data: any) => acc + data?.blockCoordinator, 0);

  const totalDistrictCoordinator = districtAnalytic
    ?.slice(1)
    .reduce((acc: number, data: any) => acc + data?.districtCoordinator, 0);

  const totalVillageVolunteer = districtAnalytic
    ?.slice(1)
    .reduce((acc: number, data: any) => acc + data?.villageCoordinator, 0);

  const uniqueSubTotal = districtAnalytic?.reduce(
    (acc: number, data: any) => acc + data?.uniqueQuestions,
    0,
  );

  const duplicateSubTotal = districtAnalytic?.reduce(
    (acc: number, data: any) => acc + data?.duplicateQuestions,
    0,
  );

  const districtData = districtAnalytic?.find(
    (data: any) => data.district === selectedDistrict,
  );

  const countryAnalytics = statesWithData
    ? statesWithData.features.reduce(
        (acc, f) => {
          const x = f.properties._analytics as Analytics;
          return {
            questions: acc.questions + x.questions,
            // answers: acc.answers + x.answers,
            feedback: acc.feedback + x.feedback,
            users: acc.users + x.users,
            activeUsers: acc.activeUsers + x.activeUsers,
            coordinators: acc.coordinators + x.coordinators,
            closureHrs: acc.closureHrs + x.closureHrs,
          };
        },
        {
          questions: 0,
          // answers: 0,
          feedback: 0,
          users: 0,
          activeUsers: 0,
          coordinators: 0,
          closureHrs: 0,
        },
      )
    : null;

  const activeAnalytics =
    districtAnalytics ?? stateAnalytics ?? countryAnalytics;
  // const isIndiaView = !selectedState && !selectedDistrict;

  const closedData = isIndiaView
    ? questionStatusData?.closedInLastTwoHours
    : closedQuestionLocationData;

  const safeCount = closedData?.closedInTwoHoursCount ?? 0;

  const safeTotalClosed = closedData?.totalClosedCount ?? 0;

  const totalPassed = closedData?.totalPassCount ?? 0;

  const passedInLastTwoHours = closedData?.passInTwoHoursCount ?? 0;

  const combinedPct =
    ((safeCount + passedInLastTwoHours) / (safeTotalClosed + totalPassed)) *
      100 || 0;
      console.log("Start and end is", questionStatusRange.startTime,
    questionStatusRange.endTime)

    useEffect(()=>{
      if(questionStatusRange.startTime !== undefined || questionStatusRange.endTime !== undefined){
        setStartDate(new Date(questionStatusRange.startTime));
        setEndDate(new Date(questionStatusRange.endTime));
        return
      }else {
        setStartDate(undefined);
        setEndDate(undefined);
        return
      }
    },[questionStatusRange.startTime, questionStatusRange.endTime])
    
  const { data: allUsers } = useUserDetails(
    startDate,
    endDate,
    1,
    10,
    "",
    source as any,
    "",
    [],
    [],
    "",
    "",
    "",
    "",
    "yes",
    false,
    false,
    userType as any,
    [],
    "totalQuestions",
    "desc",
    false,
    "",
    "verified",
    true,
  );

  console.log ("All users data for date range", startDate, endDate, " is", allUsers);
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

  const renderCardValue = (value: string | number) => {
    if (isLoading) {
      return <Skeleton className="h-6 w-16" />;
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
              onClick={() => handleClick("all")}
              // label="Questions"
              label={
                <div className="flex items-center gap-1">
                  <span>Questions</span>
                  {!isIndiaView && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="h-3 w-3 cursor-pointer text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <div className="space-y-1 text-xs">
                            <div>
                              Duplicate Questions {": "}
                              {selectedDistrict
                                ? districtData?.duplicateQuestions
                                : duplicateSubTotal}
                            </div>

                            <div>
                              Unique Questions {": "}
                              {selectedDistrict
                                ? districtData?.uniqueQuestions
                                : uniqueSubTotal}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              }
              value={renderCardValue(
                isIndiaView
                  ? questionStatusData?.closedVsTotalQuestions.totalQuestions
                  : activeAnalytics.questions,
              )}
              icon={<Activity className="h-3.5 w-3.5" />}
              tooltip={
                <div className="space-y-1 text-xs">
                  <div>Total questions asked by users.</div>
                </div>
              }
            />

            {status ? (
              <QueryCategoryQuestionsModal
                status={status}
                source={source}
                userType={userType}
                isPassed={isPassed}
                onClose={() => {
                  setStatus(null);
                  setIsPassed(false);
                }}
                isIndiaView={isIndiaView}
                startDate={questionStatusRange.startTime}
                endDate= {questionStatusRange.endTime}
              />
            ) : clickedState ? (
              <QueryCategoryQuestionsModal
                state={selectedState}
                source={source}
                userType={userType}
                isQueryCategory={false}
                onClose={() => setClickedState(null)}
                startDate={questionStatusRange.startTime}
                endDate= {questionStatusRange.endTime}
               
              />
            ) : clickedDistrict ? (
              <QueryCategoryQuestionsModal
                district={selectedDistrict}
                state={selectedState}
                source={source}
                userType={userType}
                isQueryCategory={false}
                onClose={() => setClickedDistrict(null)}
                startDate={questionStatusRange.startTime}
                endDate= {questionStatusRange.endTime}
              />
            ) : null}
            {showActiveUsersModal && (
              <ActiveUserDetailsModal
                source={source}
                userType={userType}
                state={selectedState ?? undefined}
                district={selectedDistrict ?? undefined}
                onClose={() => setShowActiveUsersModal(false)}
                type="activeUsers"
                startDate={questionStatusRange.startTime}
                endDate= {questionStatusRange.endTime}
              />
            )}
            {source !== "whatsapp" ? (
              <StatCard
                onClick={() => setShowFeedBackModal(true)}
                label="Feedback"
                value={renderCardValue(
                  isIndiaView
                    ? (userMetricesData?.feedbackData?.stats?.positiveCount ??
                        0) +
                        (userMetricesData?.feedbackData?.stats?.negativeCount ??
                          0)
                    : activeAnalytics.feedback,
                )}
                icon={<Activity className="h-3.5 w-3.5" />}
                tooltip={
                  <div className="space-y-1 text-xs">
                    <div>Total feedback given by users.</div>
                  </div>
                }
              />
            ) : (
              <StatCard
                label="Todays Questions"
                value={
                  isIndiaView
                    ? analyticsData[analyticsData?.length - 1].totalQuestions
                    : 0
                }
                tooltip={
                  <div className="space-y-1 text-xs">
                    <div>Total Question asked today</div>
                  </div>
                }
              />
            )}
            {showFeedBackModal && (
              <FeedbackUsersModal
                source={source}
                userType={userType}
                onClose={() => setShowFeedBackModal(false)}
                setRating={setRating}
                rating={rating}
                isMapComponent={true}
                state={selectedState ?? undefined}
                district={selectedDistrict ?? undefined}
                startDate={questionStatusRange.startTime}
                endDate= {questionStatusRange.endTime}
              />
            )}
            {showUsersModal && (
              <ActiveUserDetailsModal
                source={source}
                userType={userType}
                state={selectedState ?? undefined}
                district={selectedDistrict ?? undefined}
                onClose={() => setShowUsersModal(false)}
                type="users"
              />
            )}
          {source !== "whatsapp" &&
 !startDate &&
 !endDate && (
  <StatCard
    onClick={() => setShowUsersModal(true)}
    label="Users"
    value={renderCardValue(
      isIndiaView ? allUsers.totalUsers : activeAnalytics.users,
    )}
    icon={<Users className="h-3.5 w-3.5" />}
    tooltip={
      <div className="space-y-1 text-xs">
        <div>Total registered users.</div>
      </div>
    }
  />
)}

{source === "whatsapp" && (
  <StatCard
    label="Weekly Questions"
    value={
      isIndiaView
        ? weeklyAnalyticsData?.[weeklyAnalyticsData.length - 1]?.totalQuestions ?? 0
        : 0
    }
  />
)}
            {source !== "whatsapp" && (
              <StatCard
                onClick={() => setShowActiveUsersModal(true)}
                label={<span>Active</span>}
                value={renderCardValue(
                  isIndiaView
                    ? !startDate ? todayActiveFarmersData?.totalUsers : allUsers.totalUsers
                    : activeAnalytics.activeUsers,
                )}
                icon={<Users className="h-3.5 w-3.5" />}
                tooltip={
                  <div className="space-y-1 text-xs">
                    <div>Total active users count right now.</div>
                  </div>
                }
              />
            )}
            {showModeratorsModal && (
              <ActiveUserDetailsModal
                source={source}
                userType={userType}
                state={selectedState ?? undefined}
                district={selectedDistrict ?? undefined}
                onClose={() => setShowModeratorsModal(false)}
                type="moderators"
              />
            )}
            {source !== "whatsapp" &&
 !startDate &&
 !endDate ? (
  <StatCard
    onClick={() => setShowModeratorsModal(true)}
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
                  {isIndiaView
                    ? (allUsers?.userRoleCounts?.districtCoordinator ?? 0)
                    : selectedState
                      ? totalDistrictCoordinator
                      : districtData?.districtCoordinator}
                </div>

                <div>
                  Block Coordinators:{" "}
                  {isIndiaView
                    ? (allUsers?.userRoleCounts?.blockCoordinator ?? 0)
                    : selectedState
                      ? totalBlockCoordinator
                      : districtData?.blockCoordinator}
                </div>

                <div>
                  Village Volunteers:{" "}
                  {isIndiaView
                    ? (allUsers?.userRoleCounts?.villageVolunteer ?? 0)
                    : selectedDistrict
                      ? totalVillageVolunteer
                      : districtData?.villageVolunteer}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    }
    value={renderCardValue(
      fmt(
        isIndiaView
          ? allUsers?.userRoleCounts?.coordinator
          : activeAnalytics.coordinators,
      ),
    )}
    icon={<Building2 className="h-3.5 w-3.5" />}
    tooltip={
      <div className="space-y-1 text-xs">
        <div>Coordinators Count.</div>
      </div>
    }
  />
) : source === "whatsapp" ? (
  <StatCard
    label="Monthly Questions"
    value={
      isIndiaView
        ? monthlyAnalyticsData?.[monthlyAnalyticsData.length - 1]
            ?.totalQuestions ?? 0
        : 0
    }
    tooltip={
      <div className="space-y-1 text-xs">
        <div>Monthly Questions Asked</div>
      </div>
    }
  />
) : null}

            <StatCard
              onClick={() => setShowResolutionModal(true)}
              label="Resolution Rate"
              value={
                isLoading || isClosedQuestionLoading ? (
                  <Skeleton className="h-6 w-16" />
                ) : (
                  `${combinedPct.toFixed(1)}%`
                )
              }
              icon={<Activity className="h-3.5 w-3.5" />}
                          tooltip={
    <div className="space-y-1 text-xs">
      <div>
        Resolution Rate of Questions
      </div>
    </div>
  }
            />
            {showResolutionModal && (
              <div
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
                onClick={() => setShowResolutionModal(false)}
              >
                <div
                  className="w-[900px] max-w-[95vw]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ClosedInLastTwoHoursCard
                    source={source}
                    userType={userType}
                    closedInLastTwoHours={safeCount}
                    totalClosed={safeTotalClosed}
                    passedInLastTwoHours={passedInLastTwoHours}
                    totalPassed={totalPassed}
                    isMapComponent={true}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* State List (at India level) */}
        {!selectedState && (
          <StateList
            statesWithData={
              statesWithData as { features: MapFeatureBase[] } | null
            }
            onSelectState={onSelectState}
            isLoading={isLoading}
            renderCardValue={renderCardValue}
            metric={metric}
          />
        )}

        {/* District List (at state level) */}
        {selectedState && !selectedDistrict && (
          <DistrictList
            districtsOfState={
              districtsOfState as { features: MapFeatureBase[] } | null
            }
            selectedState={selectedState}
            onSelectDistrict={onSelectDistrict}
          />
        )}

        {/* District Details (at district level) */}
        {selectedDistrict && (
          <DistrictDetails
            details={districtDetails}
            selectedDistrict={selectedDistrict}
            state={selectedState}
            source={source}
            userType={userType}
            districtAnalytic={districtAnalytic}
          />
        )}
      </div>
    </aside>
  );
}
