import { cn } from "@/lib/utils";
import { Inbox, type LucideIcon } from "lucide-react";

type EmptyStateAction = {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
};

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: EmptyStateAction;
  className?: string;
  compact?: boolean;
};

function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8" : "py-16",
        className
      )}
    >
      <div className="bg-muted/50 p-4 rounded-full mb-4">
        <Icon className={cn("text-muted-foreground", compact ? "w-6 h-6" : "w-8 h-8")} />
      </div>
      <h3 className={cn(
        "font-semibold text-foreground",
        compact ? "text-sm" : "text-lg"
      )}>
        {title}
      </h3>
      {description && (
        <p className={cn(
          "text-muted-foreground mt-1 max-w-sm",
          compact ? "text-xs" : "text-sm"
        )}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95"
        >
          {action.icon && <action.icon className="size-4" />}
          {action.label}
        </button>
      )}
    </div>
  );
}

export { EmptyState };
