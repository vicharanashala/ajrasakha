import { useMutation } from "@tanstack/react-query";
import { AuthService } from "../../services/authService";

const authService = new AuthService();

export const useResetPassword = () => {
  return useMutation({
    mutationFn: (payload: Parameters<AuthService["resetPasswordWithCode"]>[0]) =>
      authService.resetPasswordWithCode(payload),
  });
};
