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
interface Notification {
  id: string;
  title: string;
  description: string;
  date: string;
  isRead: boolean;
  type: "info" | "success" | "warning" | "error";
}

// const mockNotifications: Notification[] = [
//   {
//     id: "1",
//     title: "New question assigned",
//     description: "Your expertise is needed for a new query on AI ethics.",
//     date: "2025-10-24 14:30",
//     isRead: false,
//     type: "info",
//   },
//   {
//     id: "2",
//     title: "Submission reviewed",
//     description: "Your answer has been approved by the moderator.",
//     date: "2025-10-23 09:15",
//     isRead: true,
//     type: "success",
//   },
//   {
//     id: "3",
//     title: "System update",
//     description: "Platform maintenance completed successfully.",
//     date: "2025-10-22 18:45",
//     isRead: false,
//     type: "warning",
//   },
//   {
//     id: "4",
//     title: "Request expired",
//     description: "A pending request in your queue has timed out.",
//     date: "2025-10-21 11:20",
//     isRead: true,
//     type: "error",
//   },
// ];


// function Notification() {
//  const { data: user, isLoading } = useGetCurrentUser();
//   const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
//   const [selectedIds, setSelectedIds] = useState<string[]>([]);

//   const handleMarkAsRead = (id: string) => {
//     setNotifications((prev) =>
//       prev.map((notif) =>
//         notif.id === id ? { ...notif, isRead: true } : notif
//       )
//     );
//     setSelectedIds((prev) => prev.filter((idToRemove) => idToRemove !== id));
//   };

//   const handleDelete = (id: string) => {
//     setNotifications((prev) => prev.filter((notif) => notif.id !== id));
//     setSelectedIds((prev) => prev.filter((idToRemove) => idToRemove !== id));
//   };

//   const handleMarkAllAsRead = () => {
//     setNotifications((prev) =>
//       prev.map((notif) => ({ ...notif, isRead: true }))
//     );
//     setSelectedIds([]);
//   };

//   const handleSelectAll = (checked: boolean) => {
//     if (checked) {
//       setSelectedIds(notifications.map((n) => n.id));
//     } else {
//       setSelectedIds([]);
//     }
//   };

//   const handleBack = () => {
//     window.history.back();
//   };
//   const unreadCount = notifications.filter((n) => !n.isRead).length;

//   if (isLoading) {
//     return (
//       <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
//         <div className="w-full max-w-sm p-6 bg-card rounded-lg shadow-lg flex flex-col items-center justify-center gap-4">
//           <h3 className="text-lg font-semibold text-center">
//             Loading notifications...
//           </h3>
//           <div className="flex items-center justify-center">
//             <svg
//               className="animate-spin h-10 w-10 text-green-500"
//               xmlns="http://www.w3.org/2000/svg"
//               fill="none"
//               viewBox="0 0 24 24"
//             >
//               <circle
//                 className="opacity-25"
//                 cx="12"
//                 cy="12"
//                 r="10"
//                 stroke="currentColor"
//                 strokeWidth="4"
//               />
//               <path
//                 className="opacity-75"
//                 fill="currentColor"
//                 d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
//               />
//             </svg>
//           </div>
//           <p className="text-sm text-muted-foreground text-center">
//             Fetching your notifications...
//           </p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-screen bg-background">
//       {/* Header similar to PlaygroundPage */}
//       <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
//         <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
//           <div className="flex items-center gap-3 shrink-0">
//             <img
//               src="/annam-logo.png"
//               alt="Annam Logo"
//               className="h-10 w-auto md:h-14"
//             />
//           </div>

//           <div className="flex-1 flex justify-center min-w-0">
//             <div className="flex items-center gap-2">
//               <BellIcon className="w-5 h-5 text-muted-foreground" />
//               <h1 className="text-lg font-semibold">Notifications</h1>
//               {unreadCount > 0 && (
//                 <Badge variant="destructive" className="ml-2">
//                   {unreadCount}
//                 </Badge>
//               )}
//             </div>
//           </div>

//           <div className="flex items-center gap-3 shrink-0">
//             <ThemeToggleCompact />
//             <UserProfileActions />
//           </div>
//         </div>
//       </header>
      

//       {/* Main Content */}
//       <div className="container mx-auto h-full py-6">
//        <div className="flex items-center gap-2 mb-6 group cursor-pointer w-fit" onClick={handleBack}>
//   <div className="flex items-center gap-2">
//     <ArrowLeft className="h-5 w-5 text-muted-foreground group-hover:-translate-x-1 transition-transform duration-200" />
//     <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200">
//       Go Back
//     </span>
//   </div>
//   <div className="h-[1px] w-0 bg-primary group-hover:w-full transition-all duration-300"></div>
// </div>

//         <div className="grid h-full items-stretch gap-6">
//           <div className="w-full">
//             {/* Actions Bar */}
//             <div className="flex items-center justify-between mb-6 p-4 bg-card rounded-lg border">
//               <div className="flex items-center gap-4">
//                 <Checkbox
//                   id="select-all"
//                   checked={
//                     selectedIds.length === notifications.length && notifications.length > 0
//                   }
//                   onCheckedChange={handleSelectAll}
//                   className="data-[state=checked]:bg-green-500"
//                 />
//                 <span className="text-sm font-medium text-muted-foreground">
//                   {selectedIds.length} selected
//                 </span>
//               </div>
//               <div className="flex items-center gap-2">
//                 <Button
//                   variant="outline"
//                   size="sm"
//                   onClick={handleMarkAllAsRead}
//                   disabled={unreadCount === 0}
//                   className="flex items-center gap-2"
//                 >
//                   <CheckCircle className="w-4 h-4" />
//                   Mark all as read
//                 </Button>
//               </div>
//             </div>

//             {/* Notifications List */}
//             <ScrollArea className="h-[calc(100vh-200px)] rounded-lg border">
//               <div className="p-4 space-y-4">
//                 {notifications.length === 0 ? (
//                   <div className="text-center py-12">
//                     <BellIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
//                     <h3 className="text-lg font-semibold mb-2">No notifications</h3>
//                     <p className="text-muted-foreground">You're all caught up!</p>
//                   </div>
//                 ) : (
//                   notifications.map((notification) => (
//                     <div
//                       key={notification.id}
//                       className={`flex items-start gap-4 p-4 rounded-lg border transition-all duration-150 ${
//                         !notification.isRead
//                           ? "bg-accent/50 border-accent-foreground/20"
//                           : "bg-card"
//                       } ${selectedIds.includes(notification.id) ? "ring-2 ring-green-500 ring-opacity-30" : ""}`}
//                     >
//                       <Checkbox
//                         checked={selectedIds.includes(notification.id)}
//                         onCheckedChange={(checked) => {
//                           if (checked) {
//                             setSelectedIds((prev) => [...prev, notification.id]);
//                           } else {
//                             setSelectedIds((prev) => prev.filter((id) => id !== notification.id));
//                           }
//                         }}
//                         className="mt-1 flex-shrink-0 data-[state=checked]:bg-green-500"
//                       />

//                       <div className="flex-1 min-w-0">
//                         <div className="flex items-start justify-between">
//                           <div className="flex items-center gap-2 mb-1">
//                             <Badge
//                               variant={
//                                 notification.type === "success"
//                                   ? "default"
//                                   : notification.type === "error"
//                                   ? "destructive"
//                                   : notification.type === "warning"
//                                   ? "secondary"
//                                   : "outline"
//                               }
//                               className="text-xs"
//                             >
//                               {notification.type.toUpperCase()}
//                             </Badge>
//                             <h4 className="font-medium truncate">{notification.title}</h4>
//                           </div>
//                           <div className="flex items-center gap-2 ml-2">
//                             <span className="text-xs text-muted-foreground whitespace-nowrap">
//                               {notification.date}
//                             </span>
//                             {!notification.isRead && (
//                               <div className="w-2 h-2 bg-blue-500 rounded-full" />
//                             )}
//                           </div>
//                         </div>
//                         <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
//                           {notification.description}
//                         </p>
//                       </div>

//                       <DropdownMenu>
//                         <DropdownMenuTrigger asChild>
//                           <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
//                             <MoreVertical className="w-4 h-4" />
//                           </Button>
//                         </DropdownMenuTrigger>
//                         <DropdownMenuContent align="end" className="w-48">
//                           <DropdownMenuItem
//                             onClick={() => handleMarkAsRead(notification.id)}
//                             className="flex items-center gap-2 cursor-pointer"
//                             disabled={notification.isRead}
//                           >
//                             <CheckCircle className="w-4 h-4" />
//                             Mark as read
//                           </DropdownMenuItem>
//                           <DropdownMenuItem
//                             onClick={() => handleDelete(notification.id)}
//                             className="flex items-center gap-2 cursor-pointer text-destructive"
//                           >
//                             <Trash2 className="w-4 h-4" />
//                             Delete
//                           </DropdownMenuItem>
//                         </DropdownMenuContent>
//                       </DropdownMenu>
//                     </div>
//                   ))
//                 )}
//               </div>
//             </ScrollArea>

//             {notifications.length > 0 && <Separator className="my-4" />}
//           </div>
//         </div>
//       </div>
//     </div>
//   );}



 export default function Notification() {
  const { data: user, isLoading } = useGetCurrentUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const {
    data: notificationPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useGetNotifications();
  console.log("Data aaa",notificationPages)
  useEffect(() => {
    if (notificationPages?.pages) {
      const allNotifications = notificationPages.pages.flatMap(page => page.notifications);
      setNotifications(allNotifications);
    }
  }, [notificationPages]);

  const handleMarkAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
    );
    setSelectedIds(prev => prev.filter(i => i !== id));
  };

  const handleDelete = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    setSelectedIds(prev => prev.filter(i => i !== id));
  };

  const handleMarkAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setSelectedIds([]);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(notifications.map(n => n.id));
    else setSelectedIds([]);
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3 shrink-0">
            <img src="/annam-logo.png" alt="Annam Logo" className="h-10 w-auto md:h-14" />
          </div>

          <div className="flex-1 flex justify-center min-w-0">
            <div className="flex items-center gap-2">
              <BellIcon className="w-5 h-5 text-muted-foreground" />
              <h1 className="text-lg font-semibold">Notifications</h1>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-2">{unreadCount}</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggleCompact />
            <UserProfileActions />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto h-full py-6">
        <div className="grid h-full items-stretch gap-6">
          <div className="w-full">
            {/* Actions Bar */}
            <div className="flex items-center justify-between mb-6 p-4 bg-card rounded-lg border">
              <div className="flex items-center gap-4">
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
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  disabled={unreadCount === 0}
                  className="flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Mark all as read
                </Button>
              </div>
            </div>

            {/* Notifications List */}
            <ScrollArea className="h-[calc(100vh-200px)] rounded-lg border">
              <div className="p-4 space-y-4">
                {notifications.length === 0 ? (
                  <div className="text-center py-12">
                    <BellIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No notifications</h3>
                    <p className="text-muted-foreground">You're all caught up!</p>
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`flex items-start gap-4 p-4 rounded-lg border transition-all duration-150 ${
                        !notification.isRead
                          ? "bg-accent/50 border-accent-foreground/20"
                          : "bg-card"
                      } ${selectedIds.includes(notification.id) ? "ring-2 ring-green-500 ring-opacity-30" : ""}`}
                    >
                      <Checkbox
                        checked={selectedIds.includes(notification.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedIds(prev => [...prev, notification.id]);
                          else setSelectedIds(prev => prev.filter(i => i !== notification.id));
                        }}
                        className="mt-1 flex-shrink-0 data-[state=checked]:bg-green-500"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 mb-1">
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
                              className="text-xs"
                            >
                              {notification.type.toUpperCase()}
                            </Badge>
                            <h4 className="font-medium truncate">{notification.title}</h4>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{notification.date}</span>
                            {!notification.isRead && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{notification.description}</p>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => handleMarkAsRead(notification.id)}
                            className="flex items-center gap-2 cursor-pointer"
                            disabled={notification.isRead}
                          >
                            <CheckCircle className="w-4 h-4" />
                            Mark as read
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(notification.id)}
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

                {/* Infinite Scroll Button */}
                {hasNextPage && (
                  <div className="text-center mt-4">
                    <Button
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      variant="outline"
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
};
