"use client";

import * as React from "react";
import { Dialog, DialogContent } from "@radix-ui/react-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Button } from "./button";
import { Avatar, AvatarImage, AvatarFallback } from "./avatar";
import { useAuthStore } from "@/stores/authStore";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

export const UserProfileActions = () => {
  const [openProfile, setOpenProfile] = React.useState(false);
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="p-0">
            <Avatar className="w-8 h-8">
              <Avatar className="w-8 h-8">
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
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpenProfile(true)}>
            View Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleLogout} className="text-red-600">
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
