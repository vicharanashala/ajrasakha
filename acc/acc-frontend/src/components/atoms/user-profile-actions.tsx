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
import { LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";

export const UserProfileActions = () => {
  const { user: authUser, logout, clearUser } = useAuthStore();
  const { data: user } = useGetCurrentUser({ enabled: !!authUser });
  const navigate = useNavigate();

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
            <AvatarFallback className="bg-emerald-500 text-white font-bold">
              {getInitials(user.firstName, user.lastName)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 shadow-2xl border border-slate-800 bg-slate-900 text-white p-2 rounded-xl"
        align="end"
        forceMount
      >
        <div className="flex items-center space-x-3 p-3">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={user.avatar || "/placeholder.svg"}
              alt={user.firstName}
            />
            <AvatarFallback className="bg-emerald-500 text-white font-bold">
              {getInitials(user.firstName, user.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col space-y-1 min-w-0">
            <p className="text-sm font-semibold leading-none truncate">{user.firstName} {user.lastName || ""}</p>
            <p className="text-xs leading-none text-slate-400 truncate">
              {user.email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator className="bg-slate-800 my-1" />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-400 focus:text-red-300 focus:bg-red-950/20 cursor-pointer flex items-center p-2 rounded-md hover:bg-slate-800 transition"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
