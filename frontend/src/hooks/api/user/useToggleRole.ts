// import { useMutation, useQueryClient } from "@tanstack/react-query";
// import { UserService } from "../../services/userService"

// const userService = new UserService();

// export const useToggleRole = () => {
//   const queryClient = useQueryClient();

//   return useMutation({
//     mutationKey: ["toggle_user_role"],

//     mutationFn: async ({
//       userId,
//       currentUserRole,
//       selectedRole
//     }: {
//       userId: string;
//       currentUserRole: string;
//       selectedRole?: string
//     }) => {
//       return userService.toggleUserRole(userId, currentUserRole, selectedRole);
//     },

//     onSuccess: (updatedUser:any) => {
//       queryClient.invalidateQueries({queryKey:['users']})
//       queryClient.invalidateQueries({queryKey:['experts']})
//       toast.success(
//         `Role of user ${updatedUser?.user?.firstName} switched successfully to ${updatedUser?.user?.role}`,
//       );
//     },

//     onError: () => {
//       toast.error("Failed to switch role");
//     },
//   });
// };

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";

const userService = new UserService();

export const useToggleRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["toggle_user_role"],

    mutationFn: async ({
      userId,
      currentUserRole,
      selectedRole,
    }: {
      userId: string;
      currentUserRole: string;
      selectedRole?: string;
    }) => {
      return userService.toggleUserRole(userId, currentUserRole, selectedRole);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin"],
        exact: false,
      });

      await queryClient.invalidateQueries({
        queryKey: ["experts"],
        exact: false,
      });
    },
  });
};
