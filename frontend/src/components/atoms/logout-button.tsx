import { LogOut } from "lucide-react";
import { Button } from "./button";

export const LogoutButton = ({ onLogout }: { onLogout: () => void }) => {
  return (
    <Button
      variant="outline"
      className="flex items-center space-x-2"
      onClick={onLogout}
    >
      <LogOut className="h-4 w-4" />
      <span>Logout</span>
    </Button>
  );
};
