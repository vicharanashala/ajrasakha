
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
} from "./atoms/alert-dialog";
// import { DropdownMenu } from "@radix-ui/react-dropdown-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./atoms/dropdown-menu";
import { Button } from "./atoms/button";
import { ArrowBigDownDashIcon } from "lucide-react";

type ButtonType = "default" | "delete" | "edit";

type ConfirmationModalProps = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  trigger?: React.ReactNode;
  open?: boolean;
  isLoading?: boolean;
  onOpenChange?: (open: boolean) => void;
  type?: ButtonType;

  currentRole?: string;
  selectedRole?: string;
  onRoleChange?: (role: string) => void;
  confirmAction?: string
};

export const ConfirmationModal = ({
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  trigger,
  open,
  onOpenChange,
  isLoading,
  type = "default",
  currentRole,
  selectedRole,
  onRoleChange,
  confirmAction
}: ConfirmationModalProps) => {
  const confirmButtonClass = (() => {
    switch (type) {
      case "delete":
        return "bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-600";
      case "edit":
        return "bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600";
      default:
        return "bg-green-600 hover:bg-green-700 text-white dark:bg-primary-dark dark:hover:bg-primary-dark/90";
    }
  })();

  const roles = [
    { value: "expert", label: "Expert" },
    { value: "moderator", label: "Moderator" },
    { value: "pae_expert", label: "PAE Expert" },
  ];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      ) : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-pretty">{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="text-pretty">
              {description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {confirmAction === "switch-role" && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-sm w-[25%] flex items-center justify-evenly">
              <ArrowBigDownDashIcon size={14} />
              {selectedRole
                ? roles.find((r) => r.value === selectedRole)?.label
                : "Select Role"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup
              value={selectedRole || currentRole}
              onValueChange={onRoleChange}
            >
              {roles.map((role) => (
                <DropdownMenuRadioItem
                  key={role.value}
                  value={role.value}
                  disabled={role.value === currentRole}
                  className={
                    role.value === currentRole
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <span>{role.label}</span>

                    {role.value === currentRole && (
                      <span className="text-xs text-muted-foreground">
                        Current
                      </span>
                    )}
                  </div>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            className={`flex items-center justify-center px-4 py-2 rounded  ${confirmButtonClass}`}
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
          >
            {isLoading ? `${confirmText}...` : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
