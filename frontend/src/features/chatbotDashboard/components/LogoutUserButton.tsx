import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { toast } from "@/shared/components/toast";
import { useLogoutUser } from "../hooks/useFeedbackUsers";

interface LogoutUserButtonProps {
  userId: string;
  name?: string;
  email?: string;
  onLoggedOut?: () => void;
}

// Renders the admin "Logout User" action with its confirmation dialog and
// terminates the viewed user's active sessions once confirmed.
export function LogoutUserButton({
  userId,
  name,
  email,
  onLoggedOut,
}: LogoutUserButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mutateAsync: logoutUser, isPending } = useLogoutUser();

  const handleLogoutUser = async () => {
    try {
      const result = await logoutUser({
        userId,
        username: name || "",
        email: email || "",
      });

      if (result?.value) {
        toast.success(result.message || "User logged out successfully");
        onLoggedOut?.();
      }
    } catch {
      toast.error("Failed to log out user.");
    }
  };

  return (
    <>
      <Button
        size="sm"
        disabled={isPending}
        className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
        onClick={() => setConfirmOpen(true)}
      >
        <LogOut className="h-4 w-4" />
        Logout User
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-red-600" />
              Logout User?
            </DialogTitle>

            <DialogDescription>
              Are you sure you want to log out{" "}
              <span className="font-semibold text-foreground">
                {name || email || "this user"}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            This will terminate the user's active session. They will need to log
            in again to access the application.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                setConfirmOpen(false);
                void handleLogoutUser();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Confirm Logout
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
