import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import type { IUser } from "@/types";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/shared/components/toast";

const userService = new UserService();

export const useEditUser = () => {
  const { error: toastError } = useToast();
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
      toastError("Failed to update, try again!");
    },
  });
};



//reduntant code, not in use, can be deleted after confirmation
// export const useBlockUser = (userId:string,action:string) => {
//   const { error: toastError } = useToast();
//   const queryClient =useQueryClient();
//   return useMutation({
//     mutationKey:['block_users'],
//     mutationFn: async (): Promise<void | null> => {
//      return await userService.isBlockUser(userId,action)
//     },
//     onSuccess: () => {
//       queryClient.invalidateQueries({queryKey:['users']})
//     },
//     onError:() => {
//       toastError(`Failed to ${action} Expert`)
//     }
//   })
// }
