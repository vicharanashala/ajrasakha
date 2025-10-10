import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../services/userService";
import type { IUser } from "@/types";
import toast from "react-hot-toast";

const userService = new UserService();

export const useEditUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["edit_user"],
    mutationFn: async (user: Partial<IUser>): Promise<void | null> => {
      return await userService.edit(user);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
    onError: () => {
      toast.error("Failed to update, try again!");
    },
  });
};
