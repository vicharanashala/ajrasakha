import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, Loader2 } from "lucide-react";

export interface FeedbackModalAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: React.ReactNode;
  variant?: "success" | "error" | "warning" | "info" | "custom";
  bg?: string;
  textColor?: string;
  titleColor?: string;
  descriptionColor?: string;
  icon?: React.ReactNode;
  animatedImage?: string; // URL to an animated image/gif/asset
  className?: string; // custom styling overrides
  backdropClassName?: string; // Backdrop customization
  animationPreset?: "zoom" | "fade" | "slide-up" | "bounce"; // Animation presets
  autoCloseMs?: number; // Auto-close support
  primaryAction?: FeedbackModalAction;
  secondaryAction?: FeedbackModalAction;
  showCloseButton?: boolean;
}

export function FeedbackModal({
  isOpen,
  onClose,
  title,
  description,
  variant = "info",
  bg,
  textColor,
  titleColor,
  descriptionColor,
  icon,
  animatedImage,
  className,
  backdropClassName,
  animationPreset = "zoom",
  autoCloseMs,
  primaryAction,
  secondaryAction,
  showCloseButton = true,
}: FeedbackModalProps) {
  // Auto-close effect
  React.useEffect(() => {
    if (isOpen && autoCloseMs && autoCloseMs > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseMs);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoCloseMs, onClose]);

  // Pointer events cleanup
  React.useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        document.body.style.pointerEvents = "auto";
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Variant styling configurations
  const variantStyles = {
    success: {
      defaultBg: "bg-background dark:bg-[#1a1a1a] border-green-500/20 shadow-green-500/10",
      iconContainerBg: "bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-500 ring-green-500/20",
      defaultTitleColor: "text-foreground dark:text-white",
      defaultIcon: <CheckCircle2 className="w-8 h-8" />,
      glowClass: "from-green-500/10 via-transparent to-transparent",
    },
    error: {
      defaultBg: "bg-background dark:bg-[#1a1a1a] border-destructive/20 shadow-destructive/10",
      iconContainerBg: "bg-destructive/10 text-destructive ring-destructive/20",
      defaultTitleColor: "text-foreground dark:text-white",
      defaultIcon: <AlertCircle className="w-8 h-8" />,
      glowClass: "from-destructive/10 via-transparent to-transparent",
    },
    warning: {
      defaultBg: "bg-background dark:bg-[#1a1a1a] border-amber-500/20 shadow-amber-500/10",
      iconContainerBg: "bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 ring-amber-500/20",
      defaultTitleColor: "text-foreground dark:text-white",
      defaultIcon: <AlertTriangle className="w-8 h-8" />,
      glowClass: "from-amber-500/10 via-transparent to-transparent",
    },
    info: {
      defaultBg: "bg-background dark:bg-[#1a1a1a] border-primary/20 shadow-primary/10",
      iconContainerBg: "bg-primary/10 text-primary ring-primary/20",
      defaultTitleColor: "text-foreground dark:text-white",
      defaultIcon: <Info className="w-8 h-8" />,
      glowClass: "from-primary/10 via-transparent to-transparent",
    },
    custom: {
      defaultBg: bg || "bg-background dark:bg-[#1a1a1a]",
      iconContainerBg: "bg-muted text-muted-foreground ring-border",
      defaultTitleColor: "text-foreground dark:text-white",
      defaultIcon: <Info className="w-8 h-8" />,
      glowClass: "from-muted/10 via-transparent to-transparent",
    },
  }[variant];

  // Resolve animation classes
  const animationClasses = {
    zoom: "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
    fade: "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "slide-up": "data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4",
    bounce: "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
  }[animationPreset];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={showCloseButton}
        overlayClassName={cn("backdrop-blur-xs transition-all duration-300", backdropClassName)}
        className={cn(
          "sm:max-w-md p-6 overflow-hidden rounded-2xl shadow-2xl border transition-all duration-300",
          variantStyles.defaultBg,
          animationClasses,
          bg,
          className
        )}
      >
        {/* Subtle background glow effect */}
        <div className={cn("absolute inset-0 bg-gradient-to-b opacity-50 pointer-events-none", variantStyles.glowClass)} />

        <div className="relative flex flex-col items-center gap-4 pt-2 pb-1 z-10">
          {/* Animated Image or Icon */}
          {animatedImage ? (
            <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-inner border border-border/50 bg-muted/20 flex items-center justify-center animate-in fade-in-50 duration-500">
              <img
                src={animatedImage}
                alt={title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center shadow-lg ring-8 animate-in zoom-in-50 duration-500",
              variantStyles.iconContainerBg
            )}>
              {icon || variantStyles.defaultIcon}
            </div>
          )}

          {/* Title & Description */}
          <DialogHeader className="space-y-2 w-full">
            <DialogTitle
              className={cn(
                "text-xl font-bold tracking-tight text-center leading-snug",
                variantStyles.defaultTitleColor,
                titleColor,
                textColor
              )}
            >
              {title}
            </DialogTitle>
            <DialogDescription
              className={cn(
                "text-sm text-center leading-relaxed max-w-sm mx-auto",
                descriptionColor || textColor || "text-muted-foreground"
              )}
            >
              {description}
            </DialogDescription>
          </DialogHeader>

          {/* Optional Action Buttons */}
          {(primaryAction || secondaryAction) && (
            <DialogFooter className="flex flex-col sm:flex-row gap-2 justify-center w-full pt-4 border-t border-border/40 mt-2">
              {secondaryAction && (
                <Button
                  type="button"
                  variant={secondaryAction.variant || "outline"}
                  onClick={secondaryAction.onClick}
                  disabled={secondaryAction.disabled}
                  className={cn("w-full sm:w-auto px-6 h-10 rounded-xl font-medium transition-all", secondaryAction.className)}
                >
                  {secondaryAction.label}
                </Button>
              )}
              {primaryAction && (
                <Button
                  type="button"
                  variant={primaryAction.variant || "default"}
                  onClick={primaryAction.onClick}
                  disabled={primaryAction.disabled || primaryAction.isLoading}
                  className={cn("w-full sm:w-auto px-6 h-10 rounded-xl font-medium transition-all shadow-md hover:shadow-lg", primaryAction.className)}
                >
                  {primaryAction.isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {primaryAction.label}
                </Button>
              )}
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
