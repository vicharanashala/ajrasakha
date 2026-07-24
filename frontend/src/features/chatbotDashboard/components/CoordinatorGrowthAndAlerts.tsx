import React, { Suspense } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import { AlertCard } from "../AlertCard";
import { DuplicateQuestionsModal } from "./DuplicateQuestionsModal";
import type { DashboardFilterValues } from "../DashboardFilters";
import { useQueryCategories } from "../hooks/useActiveUsersAnalytics";
import { useTopCrops } from "../hooks/useTopCrops";
import { QueryInsightsSection } from "./QueryInsightsSection";
import { DashboardStateWiseAnalytics } from "../DashboardQueryState";

const LazyUserGrowthChart = React.lazy(
  () => import("./UserGrowthChart"),
);

export function CoordinatorGrowthAndAlerts({
  userId,
  isDistrictCoordinator = false,
}: {
  userId: string;
  isDistrictCoordinator?: boolean;
}) {
  const source = "annam";
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = React.useState(false);

  const filters: DashboardFilterValues = {
    village: "all",
    crop: "all",
    season: "all",
    userType: "all",
    coordinatorId: userId,
  };

  const { data, isFetching } = useDashboardData(filters, source, true);

  // Fetch query categories and top crops specific to this coordinator
  const { data: queryCategories, isLoading: isLoadingQueryCategories } =
    useQueryCategories(source, "all", true, userId);

  const {
    data: topCrops,
    isLoading: isLoadingTopCrops,
    error: errorLoadingtopCrops,
  } = useTopCrops(source, "all", true, userId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 mb-4 items-stretch">
        <Suspense fallback={<div className="h-[380px] bg-card rounded-md animate-pulse border border-border" />}>
          <LazyUserGrowthChart
            source={source}
            userType="all"
            coordinatorId={userId}
          />
        </Suspense>

        <div>
          <AlertCard
            alerts={data.alerts}
            inactiveUsersLast3Days={((data as any).inactiveUsersLast3Days ?? 0)}
            duplicateQuestionsCount={
              (data as any).duplicateQuestionsCount ?? 0
            }
            onDuplicateClick={() => setIsDuplicateModalOpen(true)}
            lowFeedbackUsersCount={null}
            hideLowFeedback={true}
            source={source}
            isFetching={isFetching}
            coordinatorId={userId}
          />

          {isDuplicateModalOpen && (
            <DuplicateQuestionsModal
              onClose={() => setIsDuplicateModalOpen(false)}
              source={source}
              userType="all"
              coordinatorId={userId}
            />
          )}
        </div>
      </div>

      <QueryInsightsSection
        queryCategories={queryCategories}
        topCrops={topCrops}
        isLoadingQueryCategories={isLoadingQueryCategories}
        isLoadingTopCrops={isLoadingTopCrops}
        errorLoadingtopCrops={errorLoadingtopCrops}
        shouldLoadQueryInsights={true}
        source={source}
        userType="all"
        coordinatorId={userId}
      />

      {isDistrictCoordinator && (
        <div className="mt-6">
          <DashboardStateWiseAnalytics
            source={source}
            userType="all"
            coordinatorId={userId}
          />
        </div>
      )}
    </div>
  );
}
