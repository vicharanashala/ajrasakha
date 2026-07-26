import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PublicDashboardService } from "../../services/publicDashboardService";

const service = new PublicDashboardService();

const ITEMS_KEY = ["public-dashboard-items"];

/** Read all public dashboard items (saturation limit, outreach videos, …). */
export const usePublicDashboardItems = () =>
  useQuery({
    queryKey: ITEMS_KEY,
    queryFn: () => service.getItems(),
    staleTime: 5 * 60 * 1000,
  });

/** Admin: add an item. */
export const useAddPublicDashboardItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["add-public-dashboard-item"],
    mutationFn: ({ name, value }: { name: string; value: unknown }) =>
      service.addItem(name, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });
};

/** Admin: update an item by id. */
export const useUpdatePublicDashboardItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["update-public-dashboard-item"],
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; value?: unknown };
    }) => service.updateItem(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });
};

/** Admin: delete an item by id. */
export const useDeletePublicDashboardItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["delete-public-dashboard-item"],
    mutationFn: (id: string) => service.deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });
};
