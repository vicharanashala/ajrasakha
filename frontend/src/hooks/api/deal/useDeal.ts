import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DealService,
  type ICreateDealPayload,
  type DealStatus,
} from "../../services/dealService";

const dealService = new DealService();

// ─── GET MY DEALS (as farmer or buyer) ──────────────────────────────────────

export const useGetMyDeals = () => {
  return useQuery({
    queryKey: ["myDeals"],
    queryFn: async () => await dealService.getMyDeals(),
  });
};

// ─── CREATE DEAL (buyer makes an offer) ─────────────────────────────────────

export const useCreateDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["createDeal"],
    mutationFn: async (payload: ICreateDealPayload) => {
      return await dealService.createDeal(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myDeals"] });
    },
  });
};

// ─── UPDATE DEAL STATUS (farmer accepts/rejects, either party completes/cancels) ──

export const useUpdateDealStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["updateDealStatus"],
    mutationFn: async ({ dealId, status }: { dealId: string; status: DealStatus }) => {
      return await dealService.updateDealStatus(dealId, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myDeals"] });
    },
  });
};
