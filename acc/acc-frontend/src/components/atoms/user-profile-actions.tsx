import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Button } from "./button";
import { Avatar, AvatarImage, AvatarFallback } from "./avatar";
import { useAuthStore } from "@/stores/auth-store";
import { LogOut, User } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";

export const UserProfileActions = () => {
  const { user: authUser, logout, clearUser } = useAuthStore();
  const { data: user } = useGetCurrentUser({ enabled: !!authUser });
  const navigate = useNavigate();
  const [imgError, setImgError] = React.useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      clearUser();
      navigate({ to: "/auth" });
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  if (!user) return null;

  const getInitials = (firstName: string, lastName?: string) => {
    const f = firstName.charAt(0);
    const l = lastName ? lastName.charAt(0) : "";
    return (f + l).toUpperCase();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full cursor-pointer p-0 border-none bg-transparent">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={user.avatar || "/placeholder.svg"}
              alt={user.firstName}
            />
            <AvatarFallback className="bg-green-100 text-green-700 font-bold">
              {getInitials(user.firstName, user.lastName)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64 shadow-2xl border-2"
        align="end"
        forceMount
      >
        <div className="flex items-center space-x-3 p-3">
          {user.avatar && !imgError ? (
            <img
              src={user.avatar}
              alt={user.firstName || "User"}
              className="h-8 w-8 rounded"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="h-8 w-8 flex items-center justify-center rounded bg-gray-300 text-xs font-semibold text-gray-700">
              {getInitials(user.firstName, user.lastName)}
            </div>
          )}
          <div className="flex flex-col space-y-1 min-w-0">
            <p className="text-sm font-semibold leading-none truncate">{user.firstName} {user.lastName || ""}</p>
            <p className="text-xs leading-none text-muted-foreground truncate">
              {user.email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onClick={() => navigate({ to: "/profile" })}
          className="cursor-pointer flex items-center p-2 rounded-md transition mb-1 text-foreground"
        >
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="text-red-600 focus:text-red-600 cursor-pointer flex items-center p-2 rounded-md transition"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </AlertDialogTrigger>

          <AlertDialogContent className="sm:max-w-md rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Are you sure you want to log out?
              </AlertDialogTitle>
              <AlertDialogDescription>
                You will need to log in again to access your account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white border-none cursor-pointer"
              >
                Logout
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
