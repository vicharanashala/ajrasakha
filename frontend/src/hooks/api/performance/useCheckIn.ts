import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api/api-fetch";

export const useCheckIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch("/performance/check-in", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      queryClient.invalidateQueries({ queryKey: ["review-level"] });
      queryClient.invalidateQueries({ queryKey: ["experts"] });
    },
  });
};

