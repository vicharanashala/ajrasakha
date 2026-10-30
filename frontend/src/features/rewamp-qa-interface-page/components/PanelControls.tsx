import React from "react";
import { ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { cn } from "@/lib/utils";

export interface PanelControlsProps {
  isEnlarged?: boolean;
  onToggleEnlarge?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
  enlargeTitle?: string;
  collapseTitle?: string;
}

export const PanelControls: React.FC<PanelControlsProps> = React.memo(({
  isEnlarged = false,
  onToggleEnlarge,
  onToggleCollapse,
  className,
  enlargeTitle,
  collapseTitle,
}) => {
  return (
    <div className={cn("flex items-center gap-1 shrink-0", className)}>
      {/* Enlarge / Minimize Button */}
      {onToggleEnlarge && (
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onToggleEnlarge}
          className={cn(
            "h-7 w-7 rounded-lg transition-colors cursor-pointer",
            isEnlarged
              ? "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title={
            isEnlarged
              ? "Minimize to normal view (Esc)"
              : (enlargeTitle || "Enlarge to full screen")
          }
          aria-label={
            isEnlarged
              ? "Minimize to normal view"
              : (enlargeTitle || "Enlarge to full screen")
          }
        >
          {isEnlarged ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </Button>
      )}

      {/* Collapse Button (shown only when not in full-screen enlarged mode) */}
      {!isEnlarged && onToggleCollapse && (
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onToggleCollapse}
          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title={collapseTitle || "Collapse panel"}
          aria-label={collapseTitle || "Collapse panel"}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
});

PanelControls.displayName = "PanelControls";
