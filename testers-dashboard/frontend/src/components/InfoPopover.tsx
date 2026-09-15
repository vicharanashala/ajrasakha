import { useEffect, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

// Click-to-toggle rather than hover, since hover doesn't work well with this
// many cards or on touch devices. stopPropagation on the icon click matters
// because some cards (Release Health, Weakest Modules) are themselves
// click-to-expand - without it, opening the info popover would also toggle
// the whole card.
export function InfoPopover({
  title,
  children,
  align = "center",
}: {
  title: string;
  children: ReactNode;
  // Use "start"/"end" for cards near a viewport edge - centering there can
  // clip the popover off-screen.
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="h-3.5 w-3.5 rounded-full text-muted-foreground/60 hover:text-muted-foreground flex items-center justify-center"
        aria-label={`How is ${title} calculated`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-5 z-20 w-52 max-w-[calc(100vw-2rem)] rounded-md border bg-popover text-popover-foreground shadow-md p-3 text-xs space-y-1.5 ${
            align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
          }`}
        >
          <div className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
          {children}
        </div>
      )}
    </div>
  );
}
