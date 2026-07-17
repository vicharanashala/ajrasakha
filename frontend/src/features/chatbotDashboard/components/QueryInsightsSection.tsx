// ─── Query Insights Section Component ───────────────────────────────────────
import { motion } from "framer-motion";
import DashboardQueryCategories from "../DashboardQueryCategories";
import { TopCropsCard } from "./TopCropsCard";
import { LazySectionSkeleton } from "../AnnamDashboard_dev";

interface QueryInsightsSectionProps {
    queryCategories: any;
    topCrops: any;
    isLoadingQueryCategories: boolean;
    isLoadingTopCrops: boolean;
    errorLoadingtopCrops: Error | string | null;
    shouldLoadQueryInsights: boolean;
    source: "annam" | "whatsapp";
    userType: string;
}

export function QueryInsightsSection({
    queryCategories,
    topCrops,
    isLoadingQueryCategories,
    isLoadingTopCrops,
    errorLoadingtopCrops,
    shouldLoadQueryInsights,
    source,
    userType,
}: QueryInsightsSectionProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="h-full"
            >
                {shouldLoadQueryInsights ? (
                    <DashboardQueryCategories
                        categories={queryCategories}
                        source={source}
                        userType={userType}
                        isLoading={isLoadingQueryCategories}
                    />
                ) : (
                    <LazySectionSkeleton className="h-[360px]" />
                )}
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut", delay: 0.08 }}
                className="h-full"
            >
                {shouldLoadQueryInsights ? (
                    <TopCropsCard
                        topCrops={topCrops}
                        isLoadingTopCrops={isLoadingTopCrops}
                        errorLoadingtopCrops={errorLoadingtopCrops}
                        source={source}
                        userType={userType}
                    />
                ) : (
                    <LazySectionSkeleton className="h-[360px]" />
                )}
            </motion.div>
        </div>
    );
}

export default QueryInsightsSection;