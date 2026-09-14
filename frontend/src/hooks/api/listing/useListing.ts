import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ListingService,
  type ICreateListingPayload,
} from "../../services/listingService";

const listingService = new ListingService();

// ─── GET ALL LISTINGS (buyer browse/search) ───────────────────────────────

export const useGetAllListings = (params?: {
  crop?: string;
  state?: string;
  district?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: ["listings", params],
    queryFn: async () => await listingService.getAllListings(params),
    placeholderData: (prev) => prev,
  });
};

// ─── GET MY LISTINGS (farmer) ──────────────────────────────────────────────

export const useGetMyListings = () => {
  return useQuery({
    queryKey: ["myListings"],
    queryFn: async () => await listingService.getMyListings(),
  });
};

// ─── CREATE LISTING (farmer) ────────────────────────────────────────────────

export const useCreateListing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["createListing"],
    mutationFn: async (payload: ICreateListingPayload) => {
      return await listingService.createListing(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["myListings"] });
    },
  });
};

// ─── UPDATE LISTING (farmer) ─────────────────────────────────────────────────

export const useUpdateListing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["updateListing"],
    mutationFn: async ({
      listingId,
      payload,
    }: {
      listingId: string;
      payload: Partial<ICreateListingPayload>;
    }) => {
      return await listingService.updateListing(listingId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["myListings"] });
    },
  });
};

// ─── DELETE LISTING (farmer) ────────────────────────────────────────────────

export const useDeleteListing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["deleteListing"],
    mutationFn: async (listingId: string) => {
      return await listingService.deleteListing(listingId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["myListings"] });
    },
  });
};
