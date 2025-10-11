import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RequestService } from "../services/requestService";
import type { IRequest, RequestStatus } from "@/types";

const requestService = new RequestService();

interface UpdateStatusPayload {
  requestId: string;
  status: RequestStatus;
}

export const useUpdateRequestStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, status }: UpdateStatusPayload): Promise<IRequest | null> => {
      return await requestService.updateStatus(requestId, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ["requests"]});
    },
  });
};
