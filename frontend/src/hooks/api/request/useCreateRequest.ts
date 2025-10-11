import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RequestService } from "../services/requestService";
import type { IDetailedQuestion, IRequest } from "@/types";

const requestService = new RequestService();

export const useCreateRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entityId,
      requestType,
      updatedData,
      reason,
    }: {
      entityId: string;
      requestType: "question_flag" | "others";

      updatedData: IDetailedQuestion | null;
      reason: string;
    }): Promise<IRequest | null> => {
      return await requestService.createRequest(
        entityId,
        requestType,
        updatedData,
        reason
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
    },
  });
};
