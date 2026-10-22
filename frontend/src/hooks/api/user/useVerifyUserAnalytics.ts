import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";

const userService = new UserService();

type VerifyUserAnalyticsInput = {
  userId: string;
  source: string;
  isVerified?: boolean;
};

/** Shape of a single row returned by the user-details endpoint. Only the
 *  fields touched by verification are typed here so we can safely mutate the
 *  cache without losing the rest of the payload. */
interface UserDetailsRow {
  userId?: string;
  isVerified?: boolean;
}

interface UserDetailsResponse {
  users?: UserDetailsRow[];
  [key: string]: unknown;
}

// export const useVerifyUserAnalytics = () => {
//   const queryClient = useQueryClient();
//   return useMutation<
//     unknown,
//     unknown,
//     VerifyUserAnalyticsInput,
//     { previousEntries: Array<[readonly unknown[], unknown]> }
//   >({
//     mutationKey: ["verify_user_analytics"],
//     mutationFn: async ({
//       userId,
//       source,
//       isVerified = true,
//     }) => {
//       return await userService.verifyUserInAnalytics(userId, source, isVerified);
//     },
//     // Optimistic update: immediately reflect the new verification status in
//     // every cached user-details response. Without this, the verify/unverify
//     // button can appear stale until the post-mutation refetch completes (or
//     // until the page is manually refreshed) because the table is rendered
//     // from React Query cache data.
//     onMutate: async ({ userId, isVerified = true }) => {
//       await queryClient.cancelQueries({ queryKey: ["user-details"] });

//       const previousEntries = queryClient.getQueriesData({
//         queryKey: ["user-details"],
//       });

//       queryClient.setQueriesData<UserDetailsResponse | undefined>(
//         { queryKey: ["user-details"], exact: false },
//         (old) => {
//           if (!old || !Array.isArray(old.users)) return old;
//           return {
//             ...old,
//             users: old.users.map((u) =>
//               u && u.userId === userId ? { ...u, isVerified } : u,
//             ),
//           };
//         },
//       );

//       return { previousEntries };
//     },
//     onError: (_error, _variables, context) => {
//       // Roll back the optimistic update if the mutation failed so the UI
//       // doesn't show a state the DB never accepted.
//       if (context?.previousEntries) {
//         for (const [queryKey, data] of context.previousEntries) {
//           queryClient.setQueryData(queryKey, data);
//         }
//       }
//     },
//     // Invalidate on both success AND settle so the React Query cache stays in
//     // sync with the backend DB even when the request fails after the DB update
//     // has committed (e.g. the verify-email send fails). Otherwise the UI stays
//     // stale until a manual page refresh.
//     onSettled: () => {
//       queryClient.invalidateQueries({
//         queryKey: ["user-details"],
//         exact: false,
//         refetchType: "all",
//       });
//     },
//   });
// };

export const useVerifyUserAnalytics = () => {
  const queryClient = useQueryClient();

  return useMutation<
    unknown,
    unknown,
    VerifyUserAnalyticsInput,
    { previousEntries: Array<[readonly unknown[], unknown]> }
  >({
    mutationKey: ["verify_user_analytics"],

    mutationFn: async ({
      userId,
      source,
      isVerified = true,
    }) => {
      return await userService.verifyUserInAnalytics(
        userId,
        source,
        isVerified,
      );
    },

    onMutate: async ({ userId, isVerified = true }) => {
      await queryClient.cancelQueries({
        queryKey: ["user-details"],
      });

      const previousEntries = queryClient.getQueriesData({
        queryKey: ["user-details"],
      });

      queryClient.setQueriesData<UserDetailsResponse | undefined>(
        {
          queryKey: ["user-details"],
          exact: false,
        },
        (old) => {
          if (!old || !Array.isArray(old.users)) {
            return old;
          }

          return {
            ...old,
            users: old.users.map((u) =>
              u && u.userId === userId
                ? { ...u, isVerified }
                : u,
            ),
          };
        },
      );

      return { previousEntries };
    },

    onError: (_error, _variables, context) => {
      if (context?.previousEntries) {
        for (const [queryKey, data] of context.previousEntries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
  });
};
