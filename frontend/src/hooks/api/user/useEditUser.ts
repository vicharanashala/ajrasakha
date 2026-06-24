import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import type { IUser } from "@/types";
import {toast} from "sonner";
import { useAuthStore } from "@/stores/auth-store";

const userService = new UserService();

export const useEditUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["edit_user"],
    mutationFn: async (user: Partial<IUser>): Promise<void | null> => {
      return await userService.edit(user);
    },
    onSuccess: (_,user_variable) => {
      const fullName=[user_variable?.firstName,user_variable?.lastName].filter(Boolean).join(" ");
      const {user}=useAuthStore.getState();
      if(user?.name!==fullName)
        useAuthStore.getState().updateUser({
          name: fullName,
        });
      queryClient.invalidateQueries({
        queryKey: ["users"],
        exact: false,
      });

      //  Refresh moderator experts list
      queryClient.invalidateQueries({
        queryKey: ["experts"],
        exact: false,
      });
    },
    onError: () => {
      toast.error("Failed to update, try again!");
    },
  });
};



export const useBlockUser = (userId:string,action:string) => {
  const queryClient =useQueryClient();
  return useMutation({
    mutationKey:['block_users'],
    mutationFn: async (): Promise<void | null> => {
     return await userService.isBlockUser(userId,action)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey:['users']})
    },
    onError:() => {
      toast.error(`Failed to ${action} Expert`)
    }
  })
}
