import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PublicDashboardService } from "../../services/publicDashboardService";

const service = new PublicDashboardService();

const ITEMS_KEY = ["public-dashboard-items"];
const USERS_KEY = ["public-dashboard-users"];
const SATURATED_CROPS_KEY = ["public-dashboard-saturated-crops"];

/** Read all public dashboard items (saturation limit, outreach videos, …). */
export const usePublicDashboardItems = () =>
  useQuery({
    queryKey: ITEMS_KEY,
    queryFn: () => service.getItems(),
    staleTime: 5 * 60 * 1000,
  });

/** Read active users with public-facing profile fields. */
export const usePublicDashboardUsers = () =>
  useQuery({
    queryKey: USERS_KEY,
    queryFn: () => service.getUsers(),
    staleTime: 5 * 60 * 1000,
  });

/** Read the saturated-crops-by-state aggregation (used for Crops/States covered stats). */
export const usePublicDashboardSaturatedCrops = () =>
  useQuery({
    queryKey: SATURATED_CROPS_KEY,
    queryFn: () => service.getSaturatedCrops(),
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

/** Admin: upload an image/video file to GCS; stores its URL as an item. */
export const useUploadPublicDashboardMedia = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["upload-public-dashboard-media"],
    mutationFn: ({ file, type, name }: { file: File; type: "image" | "video"; name?: string }) =>
      service.uploadMedia(file, type, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });
};

/** Admin: reorder public dashboard items. */
export const useReorderPublicDashboardItems = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["reorder-public-dashboard-items"],
    mutationFn: (orderedIds: string[]) => service.reorderItems(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });
};
