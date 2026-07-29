import { useDashboardData } from "../hooks/useDashboardData";
import { EightCardsComponent } from "../MetricCard ";
import Spinner from "@/components/atoms/spinner";
import { useMemo } from "react";

export function CoordinatorKpiCards({ userId }: { userId: string }) {
  const { data, isLoading } = useDashboardData(
    {
      village: "all",
      crop: "all",
      season: "all",
      userType: "all",
      coordinatorId: userId,
    },
    "annam",
    Boolean(userId),
  );

  const kpiRow1WithOverlay = useMemo(() => {
    if (!data?.kpiRow1) return [];
    return data.kpiRow1
      .filter((card) => ["dau", "queries", "session"].includes(card.id))
      .map((card) => ({ ...card, isDummy: false }));
  }, [data?.kpiRow1]);

  const kpiRow2WithOverlay = useMemo(() => {
    if (!data?.kpiRow2) return [];
    return data.kpiRow2
      .filter((card) => card.id === "totalInstalls")
      .map((card) => ({ ...card, isDummy: false }));
  }, [data?.kpiRow2]);

  if (isLoading) {
    return (
      <div className="flex h-28 items-center justify-center rounded-xl border border-border bg-card p-4">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mb-6">
      <EightCardsComponent
        kpiRow1={kpiRow1WithOverlay}
        kpiRow2={kpiRow2WithOverlay}
        source="annam"
        userType="all"
        isLoading={false}
      />
    </div>
  );
}
