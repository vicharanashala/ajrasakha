import { useEffect } from "react";
import { X, ArrowBigDownDashIcon } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./atoms/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./atoms/dropdown-menu";
import { Button } from "./atoms/button";

type ButtonType = "default" | "delete" | "edit";

type ConfirmationModalProps = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  secondaryConfirmText?: string;
  onSecondaryConfirm?: () => void | Promise<void>;
  secondaryIsLoading?: boolean;
  trigger?: React.ReactNode;
  open?: boolean;
  isLoading?: boolean;
  onOpenChange?: (open: boolean) => void;
  type?: ButtonType;
  confirmTooltip?: string;
  secondaryConfirmTooltip?: string;
  cancelTooltip?: string;
  currentRole?: string;
  selectedRole?: string;
  onRoleChange?: (role: string) => void;
  confirmAction?: string;
};

export const ConfirmationModal = ({
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  secondaryConfirmText,
  onSecondaryConfirm,
  secondaryIsLoading,
  trigger,
  open,
  onOpenChange,
  isLoading,
  type = "default",
  confirmTooltip,
  secondaryConfirmTooltip,
  cancelTooltip,
  currentRole,
  selectedRole,
  onRoleChange,
  confirmAction,
}: ConfirmationModalProps) => {
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        document.body.style.pointerEvents = "auto";
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = "auto";
    };
  }, []);

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

  const secondaryConfirmButtonClass =
    "bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600";

  const roles = [
    { value: "expert", label: "Expert" },
    { value: "moderator", label: "Moderator" },
    { value: "pae_expert", label: "PAE Expert" },
    { value: "tester", label: "Tester" },
  ];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      ) : null}
      <AlertDialogContent>
        <div className="relative w-full">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogCancel
                  className="absolute -right-2 -top-2 p-2 rounded-full hover:bg-muted border-none bg-transparent transition-colors z-10 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenChange) onOpenChange(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </AlertDialogCancel>
              </TooltipTrigger>
              <TooltipContent side="left">
                {cancelTooltip || cancelText}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <AlertDialogHeader>
            <AlertDialogTitle className="text-pretty">{title}</AlertDialogTitle>
            {description ? (
              <AlertDialogDescription className="text-pretty">
                {description}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>

          {confirmAction === "switch-role" && (
            <div className="mt-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm w-full sm:w-[50%] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ArrowBigDownDashIcon size={14} />
                      {selectedRole
                        ? roles.find((r) => r.value === selectedRole)?.label
                        : "Select Role"}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
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
                            : "cursor-pointer"
                        }
                      >
                        <div className="flex items-center justify-between w-full gap-2">
                          <span>{role.label}</span>
                          {role.value === currentRole && (
                            <span className="text-xs text-muted-foreground italic">
                              Current
                            </span>
                          )}
                        </div>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <AlertDialogFooter className="flex flex-row items-center justify-end gap-3 mt-6">
            {secondaryConfirmText && onSecondaryConfirm && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogAction
                      className={`flex-1 sm:flex-none flex items-center justify-center px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${secondaryConfirmButtonClass}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSecondaryConfirm();
                      }}
                      disabled={secondaryIsLoading || isLoading}
                    >
                      {secondaryIsLoading
                        ? `${secondaryConfirmText}...`
                        : secondaryConfirmText}
                    </AlertDialogAction>
                  </TooltipTrigger>
                  {secondaryConfirmTooltip && (
                    <TooltipContent>{secondaryConfirmTooltip}</TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogAction
                    className={`flex-1 sm:flex-none flex items-center justify-center px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${confirmButtonClass}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfirm();
                    }}
                    disabled={isLoading || secondaryIsLoading}
                  >
                    {isLoading ? `${confirmText}...` : confirmText}
                  </AlertDialogAction>
                </TooltipTrigger>
                {confirmTooltip && (
                  <TooltipContent>{confirmTooltip}</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
