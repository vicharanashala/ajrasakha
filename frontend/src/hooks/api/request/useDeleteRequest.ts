import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RequestService } from "../../services/requestService";

const requestService = new RequestService();

export const useSoftDeleteRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) =>
      requestService.softDeleteRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
    },
  });
};
