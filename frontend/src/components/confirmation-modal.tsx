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
}: ConfirmationModalProps) => {
  const confirmButtonClass = (() => {
    switch (type) {
      case "delete":
        return "bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-600";
      case "edit":
        return "bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600";
      default:
        return "bg-primary hover:bg-primary/90 text-white dark:bg-primary-dark dark:hover:bg-primary-dark/90";
    }
  })();

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
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            className={`flex items-center justify-center px-4 py-2 rounded ${confirmButtonClass}`}
            onClick={onConfirm}
          >
            {isLoading ? `${confirmText}...` : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
