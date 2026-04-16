import { useMutation } from "@tanstack/react-query";
import { AuthService } from "../../services/authService";

const authService = new AuthService();

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: (email: string) => authService.forgotPassword(email),
  });
};
