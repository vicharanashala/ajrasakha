"use client";

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

export const UserProfileActions = () => {
  const { user, logout, clearUser } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    clearUser();
    navigate({ to: "/auth" });
  };

  return (
    <>
      {/* <DropdownMenu > */}
      {/* <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="p-0">
            <Avatar className="w-9 h-9">
              <Avatar className="w-9 h-9">
                {user?.avatar ? (
                  <AvatarImage
                    src={user.avatar}
                    alt={user.name || "User"}
                    onError={(e) => {
                      e.currentTarget.style.display = "none"; // hide broken image
                    }}
                  />
                ) : (
                  <AvatarFallback>{user?.name?.[0] || "U"}</AvatarFallback>
                )}
              </Avatar>
              <AvatarFallback>{user?.name?.[0] || "U"}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger> */}
      <UserDropdown user={user} onLogout={handleLogout} />
      {/* </DropdownMenu> */}
    </>
  );
};

interface UserData {
  email: string;
  name: string;
  avatar?: string;
}

interface UserDropdownProps {
  user: UserData | null;
  onLogout: () => void;
}

export function UserDropdown({ user, onLogout }: UserDropdownProps) {
  const [imgError, setImgError] = React.useState(false);

  const handleLogout = () => {
    onLogout();
  };
  if (!user) return;
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarImage
              src={user.avatar || "/placeholder.svg"}
              alt={user.name}
            />
            <AvatarFallback className="bg-green-100 text-green-700">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 
        dark:from-green-950 dark:via-emerald-950 dark:to-teal-950 shadow-2xl border-2"
        align="end"
        forceMount
      >
        <div className="flex items-center space-x-3 p-3">
          {user.avatar && !imgError ? (
            <img
              src={user.avatar}
              alt={user.name || "User"}
              className="h-8 w-8 rounded"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="h-8 w-8 flex items-center justify-center rounded bg-gray-300 text-xs font-semibold text-gray-700">
              {getInitials(user.name)}
            </div>
          )}
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-600 focus:text-red-600 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
