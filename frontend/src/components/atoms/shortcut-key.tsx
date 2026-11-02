import { cn } from "@/lib/utils";

/** Key cap showing a single-key shortcut on an action card or button. */
export const ShortcutKey = ({ keyLabel, className }: { keyLabel: string; className?: string }) => (
  <kbd
    title={`Keyboard shortcut: ${keyLabel.toUpperCase()}`}
    aria-hidden
    className={cn(
      "inline-flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-md border border-b-2 border-gray-200 bg-gray-50 px-1.5 font-mono text-[11px] font-semibold text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200",
      className,
    )}
  >
    {keyLabel.toUpperCase()}
  </kbd>
);

/** True while a dialog or alert dialog is open, so page shortcuts stay out of its way. */
export const isDialogOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"]');
