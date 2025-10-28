import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/notifications/')({
  component: Notification,
})
import { useEffect, useState } from "react";
import { BellIcon, CheckCircle, Trash2, MoreVertical, ArrowLeft } from "lucide-react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { Separator } from "@/components/atoms/separator";
import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { Badge } from '@/components/atoms/badge';
import { ThemeToggleCompact } from '@/components/atoms/ThemeToggle';
import { Checkbox } from '@/components/atoms/checkbox';
import { Button } from '@/components/atoms/button';
import { ScrollArea } from '@/components/atoms/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/atoms/dropdown-menu';
import { useGetNotifications } from '@/hooks/api/notification/useGetNotifications';
import { useDeleteNotification } from '@/hooks/api/notification/useDeleteNotifications';
import { useMarkAsReadNotification } from '@/hooks/api/notification/useUpdateNotification';
import { useMarkAllAsReadNotification } from '@/hooks/api/notification/useMarkAllAsRead';
import toast from 'react-hot-toast'
export interface Notification {
  _id: string;
  enitity_id: string;
  message: string;
  title: string;
  is_read: boolean;
  // type: "info" | "success" | "warning" | "error";
  type: string;
  createdAt: string;
  updatedAt: string;
}

export default function Notification() {
  const { data: user, isLoading } = useGetCurrentUser();
  const { mutateAsync: deleteNotification} = useDeleteNotification()
  const { mutateAsync: markAsRead} = useMarkAsReadNotification()
  const { mutateAsync: markAllAsRead } = useMarkAllAsReadNotification()
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const {
    data: notificationPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useGetNotifications();
  useEffect(() => {
    if (notificationPages?.pages) {
      const allNotifications = notificationPages?.pages.flatMap(page => page?.notifications ?? []) 
      setNotifications(allNotifications);
    }
  }, [notificationPages]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead(id)
      toast.success("Notification marked as read!")
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
      await markAllAsRead()
      toast.success("Notification marked as read!")
    } catch (error) {
      console.log("Error: ", error);

    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(notifications.map(n => n._id));
    else setSelectedIds([]);
  };

  const handleBack = () => {
    window.history.back();
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
        <div className="w-full max-w-sm p-6 bg-card rounded-lg shadow-lg flex flex-col items-center justify-center gap-4">
          <h3 className="text-lg font-semibold text-center">
            Loading notifications...
          </h3>
          <div className="flex items-center justify-center">
            <svg
              className="animate-spin h-10 w-10 text-green-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
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
  <div className="min-h-screen bg-background flex flex-col">
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 shrink-0">
          <img
            src="/annam-logo.png"
            alt="Annam Logo"
            className="h-8 w-auto sm:h-10 md:h-12"
          />
        </div>

        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex items-center gap-2 text-center">
            <BellIcon className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-base sm:text-lg font-semibold truncate">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-1 sm:ml-2 text-xs sm:text-sm">
                {unreadCount}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ThemeToggleCompact />
          <UserProfileActions />
        </div>
      </div>
    </header>

    <div className="container mx-auto flex-1 py-4 sm:py-6 px-3 sm:px-0">
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
        <div className="h-[1px] w-0 bg-primary group-hover:w-full transition-all duration-300"></div>
      </div>

      <div className="flex flex-col h-full gap-4 sm:gap-6">
        <div className="w-full">
          <div className="flex flex-wrap items-center justify-between mb-4 sm:mb-6 p-3 sm:p-4 bg-card rounded-lg border">
            <div className="flex items-center gap-2 sm:gap-4">
              <Checkbox
                id="select-all"
                checked={selectedIds.length === notifications.length && notifications.length > 0}
                onCheckedChange={handleSelectAll}
                className="data-[state=checked]:bg-green-500"
              />
              <span className="text-sm font-medium text-muted-foreground">
                {selectedIds.length} selected
              </span>
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
                      ${!notification.is_read
                        ? "bg-accent/50 border-accent-foreground/20"
                        : "bg-card"}
                      ${selectedIds.includes(notification._id)
                        ? "ring-2 ring-green-500 ring-opacity-30"
                        : ""}`}
                  >
                    <div className="flex items-start sm:items-center gap-2">
                      <Checkbox
                        checked={selectedIds.includes(notification._id)}
                        onCheckedChange={(checked) => {
                          if (checked)
                            setSelectedIds((prev) => [...prev, notification._id]);
                          else
                            setSelectedIds((prev) =>
                              prev.filter((i) => i !== notification._id)
                            );
                        }}
                        className="mt-1 flex-shrink-0 data-[state=checked]:bg-green-500"
                      />
                    </div>

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
                            {new Date(notification.createdAt).toLocaleString()}
                          </span>
                          {!notification.is_read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 sm:line-clamp-2">
                        {notification.message}
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 flex-shrink-0 self-end sm:self-auto"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 sm:w-48">
                        <DropdownMenuItem
                          onClick={(e) =>{
                             e.stopPropagation();
                             handleMarkAsRead(notification._id)
                            }
                            }
                          className="flex items-center gap-2 cursor-pointer"
                          disabled={notification.is_read}
                        >
                          <CheckCircle className="w-4 h-4" />
                          Mark as read
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) =>{
                            e.stopPropagation();
                            handleDelete(notification._id)
                          }
                        }
                          className="flex items-center gap-2 cursor-pointer text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
)
}
