import { useMutation } from "@tanstack/react-query";
import type { ExtendedUserCredential } from "@/types";
import { AuthService } from "../../services/authService";
import { toast } from "@/shared/components/toast";

const authService = new AuthService();

export const useLoginWithGoogle = () => {
  return useMutation({
    mutationFn: async (firebaseLoginRes: ExtendedUserCredential) => {
      return await authService.loginWithGoogle(firebaseLoginRes);
    },
    onSuccess: () => {
      toast.success("Logged in successfully");
    },
    onError: (error: unknown) => {
      console.error("Google login failed:", error);
      toast.error("Login failed, please try again");
    },
  });
};
