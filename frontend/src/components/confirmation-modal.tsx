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

  const secondaryConfirmButtonClass = "bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600";

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
        <AlertDialogFooter className="flex flex-wrap gap-2 sm:gap-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogCancel onClick={(e) => e.stopPropagation()}>{cancelText}</AlertDialogCancel>
              </TooltipTrigger>
              {cancelTooltip && <TooltipContent>{cancelTooltip}</TooltipContent>}
            </Tooltip>
          </TooltipProvider>

          {secondaryConfirmText && onSecondaryConfirm && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogAction
                    className={`flex items-center justify-center px-4 py-2 rounded ${secondaryConfirmButtonClass}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSecondaryConfirm();
                    }}
                    disabled={secondaryIsLoading || isLoading}
                  >
                    {secondaryIsLoading ? `${secondaryConfirmText}...` : secondaryConfirmText}
                  </AlertDialogAction>
                </TooltipTrigger>
                {secondaryConfirmTooltip && <TooltipContent>{secondaryConfirmTooltip}</TooltipContent>}
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogAction
                  className={`flex items-center justify-center px-4 py-2 rounded  ${confirmButtonClass}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirm()
                  }}
                  disabled={isLoading || secondaryIsLoading}
                >
                  {isLoading ? `${confirmText}...` : confirmText}
                </AlertDialogAction>
              </TooltipTrigger>
              {confirmTooltip && <TooltipContent>{confirmTooltip}</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

