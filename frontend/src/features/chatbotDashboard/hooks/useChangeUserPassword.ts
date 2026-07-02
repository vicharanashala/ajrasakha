import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import { toast } from "sonner";

export function useChangeUserPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      source,
      newPassword,
      keepLoggedIn,
    }: {
      userId: string;
      source: string;
      newPassword: string;
      keepLoggedIn: boolean;
    }) => {
      const result = await apiFetch<{success?: boolean; message?: string}>(
        `${env.apiBaseUrl()}/analytics/admin/users/${userId}/change-password?source=${source}`,
        {
          method: "POST",
          body: JSON.stringify({ newPassword, keepLoggedIn }),
        },
      );

      if (!result?.success) {
        throw new Error(result?.message || "Failed to change password");
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-details"] });
      toast.success("Password changed successfully");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to change password");
    },
  });
}
