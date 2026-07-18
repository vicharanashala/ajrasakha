import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DashboardContentService,
  type DashboardBlock,
  type DashboardStat,
} from "@/hooks/services/dashboardContentService";

const service = new DashboardContentService();

/** Public read of the editable dashboard content. */
export const useGetDashboardContent = () =>
  useQuery({
    queryKey: ["dashboard-content"],
    queryFn: () => service.get(),
  });

/** Admin/moderator save. */
export const useUpdateDashboardContent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["update-dashboard-content"],
    mutationFn: ({
      blocks,
      stats,
      saturationThreshold,
    }: {
      blocks: DashboardBlock[];
      stats: DashboardStat[];
      saturationThreshold?: number;
    }) => service.update(blocks, stats, saturationThreshold),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-content"] });
      toast.success("Dashboard content saved");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save content"),
  });
};
