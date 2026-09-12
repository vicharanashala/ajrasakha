import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/atoms/tooltip";

interface ScrollToTopButtonProps {
  /** Optional ref to the scrollable container. If omitted, window scroll is used. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Scroll distance in pixels before the button appears. Defaults to 250. */
  threshold?: number;
  /** Extra class names for the floating container. */
  className?: string;
  /** Callback fired when smooth scroll to top is triggered. */
  onScrollTop?: () => void;
}

export function ScrollToTopButton({
  containerRef,
  threshold = 250,
  className,
  onScrollTop,
}: ScrollToTopButtonProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const handleScroll = useCallback(() => {
    const el = containerRef?.current;
    let scrollTop = 0;
    let scrollHeight = 0;
    let clientHeight = 0;

    if (el) {
      scrollTop = el.scrollTop;
      scrollHeight = el.scrollHeight;
      clientHeight = el.clientHeight;
    } else {
      scrollTop = window.scrollY || document.documentElement.scrollTop;
      scrollHeight = document.documentElement.scrollHeight;
      clientHeight = window.innerHeight;
    }

    const maxScroll = scrollHeight - clientHeight;
    const progress =
      maxScroll > 0 ? Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)) : 0;

    setScrollProgress(progress);
    setIsVisible(scrollTop > threshold || (window.scrollY || 0) > threshold);
  }, [containerRef, threshold]);

  useEffect(() => {
    handleScroll();

    // Scroll events do not bubble, but capture phase on window catches all scrolls in the DOM
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true } as any);
    };
  }, [handleScroll]);

  const scrollToTop = () => {
    if (containerRef?.current) {
      containerRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
    onScrollTop?.();
  };

  // Circular progress dimensions
  const size = 46;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (scrollProgress / 100) * circumference;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 16 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className={cn(
            "fixed bottom-6 right-6 z-40 flex items-center justify-center",
            className,
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={scrollToTop}
                aria-label="Scroll back to top"
                className={cn(
                  "group relative flex items-center justify-center",
                  "h-[46px] w-[46px] rounded-full",
                  "bg-background/90 dark:bg-card/90 backdrop-blur-md",
                  "border border-border/80 hover:border-primary/50",
                  "shadow-lg hover:shadow-xl hover:shadow-primary/10",
                  "text-muted-foreground hover:text-foreground",
                  "transition-all duration-200 ease-out",
                  "hover:scale-105 active:scale-95",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  "cursor-pointer select-none",
                )}
              >
                {/* SVG Progress Ring */}
                <svg
                  className="absolute inset-0 -rotate-90 pointer-events-none"
                  width={size}
                  height={size}
                >
                  {/* Track */}
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    className="stroke-muted/40"
                    strokeWidth={strokeWidth}
                    fill="none"
                  />
                  {/* Progress indicator */}
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    className="stroke-primary transition-[stroke-dashoffset] duration-100 ease-out"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>

                {/* Arrow Icon */}
                <ArrowUp className="h-5 w-5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:text-primary" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>
              <p className="font-medium text-xs">Back to top</p>
            </TooltipContent>
          </Tooltip>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
