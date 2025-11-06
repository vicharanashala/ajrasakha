import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/notifications/")({
  component: Notification,
});
import { useEffect, useState } from "react";
import { BellIcon, CheckCircle, ArrowLeft, XCircle, Clock } from "lucide-react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { Separator } from "@/components/atoms/separator";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { useGetNotifications } from "@/hooks/api/notification/useGetNotifications";
import { useDeleteNotification } from "@/hooks/api/notification/useDeleteNotifications";
import { useMarkAsReadNotification } from "@/hooks/api/notification/useUpdateNotification";
import { useMarkAllAsReadNotification } from "@/hooks/api/notification/useMarkAllAsRead";
import { toast } from "sonner";
import { formatDate } from "@/utils/formatDate";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { QuestionDetails } from "@/components/question-details";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";
import { useAutoDeletePreference } from "@/hooks/api/user/useAutoDeleteNotifications";
export interface Notification {
  _id: string;
  enitity_id: string;
  message: string;
  title: string;
  is_read: boolean;
  // type: "info" | "success" | "warning" | "error" | "Flag_Response";
  type: string;
  createdAt: string;
  updatedAt: string;
}

export default function Notification() {
  const { data: user, isLoading } = useGetCurrentUser();
  const {
    mutateAsync: deleteNotification,
    isPending: isDeletingNotifications,
  } = useDeleteNotification();
  const { mutateAsync: markAsRead } = useMarkAsReadNotification();
  const { mutateAsync: markAllAsRead } = useMarkAllAsReadNotification();
  const {mutateAsync:autoDeletePreference} = useAutoDeletePreference()
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletePreference, setDeletePreference] = useState("never");
  // const [selectedQuestionId, setSelectedQuestionId] = useState("");

  // const {
  //   data: questionDetails,
  //   refetch: refechSelectedQuestion,
  //   isLoading: isLoadingSelectedQuestion,
  // } = useGetQuestionFullDataById(selectedQuestionId);

  const {
    data: notificationPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useGetNotifications();

  useEffect(() => {
    if (notificationPages?.pages) {
      const allNotifications = notificationPages?.pages.flatMap(
        (page) => page?.notifications ?? []
      );
      setNotifications(allNotifications);
    }
  }, [notificationPages]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead(id);
      // const selectedNotification = notifications.find(
      //   (notification) => notification._id === id
      // );

      // if (selectedNotification?.type === "Flag_Response") {
      //   setSelectedQuestionId(selectedNotification.enitity_id);
      // }
      // toast.success("Notification marked as read!")
    } catch (error) {
      console.log("Error: ", error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId);
    } catch (error) {
      console.log("Error: ", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      toast.success("Notification marked as read!");
    } catch (error) {
      console.log("Error: ", error);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(notifications.map((n) => n._id));
    else setSelectedIds([]);
  };

  const handleBack = () => {
    window.history.back();
  };
  const handlePreferenceChange =async (value: string) => {
    setDeletePreference(value);
    try {
      await autoDeletePreference(value)
      toast.success('Preference Updated')
    } catch (error) {
      toast.error('Error updating Preference')
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (isLoading || isDeletingNotifications) {
    // if (isLoading || isLoadingSelectedQuestion) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm mx-auto  ">
        <div className="w-full max-w-sm p-6 bg-card rounded-lg shadow-lg flex flex-col items-center justify-center gap-4">
          <h3 className="text-lg font-semibold text-center">
            Loading {isLoading && "notifications"}...
          </h3>
          <div className="flex items-center justify-center">
            <svg
              className="animate-spin h-10 w-10 text-green-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Fetching your notifications...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col ">
      <div className="container mx-auto flex-1 py-4 sm:py-6 px-3 sm:px-0 px-6 py-8 max-w-[60%]">
        <div
          className="flex items-center gap-2 mb-4 sm:mb-6 group cursor-pointer w-fit"
          onClick={handleBack}
        >
          <div className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:-translate-x-1 transition-transform duration-200" />
            <span className="text-xs sm:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200">
              Go Back
            </span>
          </div>
        </div>

        <div className="flex flex-col h-full gap-4 sm:gap-6">
          <div className="w-full">
            <div className="flex flex-wrap items-center justify-between mb-4 sm:mb-6 p-3 sm:p-4 bg-card rounded-lg border">
              <div className="flex items-center gap-2 sm:gap-4">
                <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground hidden sm:inline">
                  Auto-delete after:
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[200px]">
              Notifications older than this duration will be automatically deleted.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Select onValueChange={handlePreferenceChange} value={deletePreference}>
          <SelectTrigger className="w-[130px] sm:w-[150px]">
            <SelectValue placeholder="Select duration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3d">3 days</SelectItem>
            <SelectItem value="1w">1 week</SelectItem>
            <SelectItem value="2w">2 weeks</SelectItem>
            <SelectItem value="1m">1 month</SelectItem>
            <SelectItem value="never">Never</SelectItem>
          </SelectContent>
        </Select>
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  disabled={unreadCount === 0}
                  className="flex items-center gap-2 text-xs sm:text-sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  Mark all as read
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[calc(100vh-240px)] sm:h-[calc(100vh-200px)] rounded-lg border">
              <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                {notifications.length === 0 ? (
                  <div className="text-center py-10 sm:py-12">
                    <BellIcon className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-3 sm:mb-4" />
                    <h3 className="text-base sm:text-lg font-semibold mb-1 sm:mb-2">
                      No notifications
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      You're all caught up!
                    </p>
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      onClick={() => handleMarkAsRead(notification._id)}
                      key={notification._id}
                      className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border transition-all duration-150
                      ${
                        !notification.is_read
                          ? "bg-accent/50 border-accent-foreground/20"
                          : "bg-card"
                      }
                      ${
                        selectedIds.includes(notification._id)
                          ? "ring-2 ring-green-500 ring-opacity-30"
                          : ""
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-2"></div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-2 mb-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                notification.type === "success"
                                  ? "default"
                                  : notification.type === "error"
                                  ? "destructive"
                                  : notification.type === "warning"
                                  ? "secondary"
                                  : "outline"
                              }
                              className="text-[10px] sm:text-xs"
                            >
                              {notification.type.toUpperCase()}
                            </Badge>
                            <h4 className="font-medium truncate text-sm sm:text-base">
                              {notification.title || "New Task!!"}
                            </h4>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-2">
                            <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                              {formatDate(new Date(notification.createdAt))}
                            </span>
                            {!notification.is_read && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full" />
                            )}

                            <XCircle
                              className="w-4 h-4 flex items-center gap-2 cursor-pointer text-red-500 hover:text-red-700 transition-colors duration-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(notification._id);
                              }}
                            />
                          </div>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 sm:line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                    </div>
                  ))
                )}

                {hasNextPage && (
                  <div className="text-center mt-4">
                    <Button
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      variant="outline"
                      size="sm"
                      className="text-xs sm:text-sm"
                    >
                      {isFetchingNextPage ? "Loading..." : "Load More"}
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>

            {notifications.length > 0 && <Separator className="my-4" />}
          </div>
        </div>
      </div>
    </div>
  );
}
