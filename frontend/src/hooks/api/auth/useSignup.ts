import { useMutation } from "@tanstack/react-query";
import { AuthService } from "../services/authService";

const authService = new AuthService();

export const useSignup = () => {
  return useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }) => {
      return await authService.signup(data);
    },
  });
};
