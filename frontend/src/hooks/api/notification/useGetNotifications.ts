import { useInfiniteQuery } from "@tanstack/react-query";
import { NotificationService } from "@/hooks/services/notificationService";
const notificationService = new NotificationService()
export const useGetNotifications = (
) => {
  const limit =10
  return useInfiniteQuery({
    queryKey: ["notifications"],
    queryFn: async ({ pageParam=1 }) => {
      return await notificationService.getUserNotifications(
        pageParam,
        limit,
      );
    },
    initialPageParam: 1,
    // getNextPageParam: (lastPage, allPages) => {
    //   if (lastPage && lastPage.length < limit) return undefined;
    //   return allPages.length + 1;
    // },
    getNextPageParam: (lastPage) => {
  if (!lastPage || lastPage.page >= lastPage.totalPages) return undefined;
  return lastPage.page + 1;
},
  });
};
