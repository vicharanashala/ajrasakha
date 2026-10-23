import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";

/** Every AgriTech Management shortcut, grouped for the help dialog. */
export const AGRITECH_SHORTCUT_GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Actions",
    items: [
      { keys: ["N"], label: "Add a new item (or organization)" },
      { keys: ["I"], label: "Import a sheet" },
      { keys: ["F"], label: "Open filters" },
      { keys: ["A"], label: "Open the audit trail" },
      { keys: ["R"], label: "Refresh the list" },
    ],
  },
  {
    title: "Navigation",
    items: [
      { keys: ["/"], label: "Focus the search box" },
      { keys: ["["], label: "Previous tab" },
      { keys: ["]"], label: "Next tab" },
      { keys: ["1", "–", "9"], label: "Jump to a tab" },
      { keys: ["←"], label: "Previous page" },
      { keys: ["→"], label: "Next page" },
    ],
  },
  {
    title: "General",
    items: [
      { keys: ["Esc"], label: "Close the open panel or form, or clear the search" },
      { keys: ["?"], label: "Show these shortcuts" },
    ],
  },
];

/** Renders one key cap. */
const Kbd = ({ children }: { children: string }) =>
  children === "–" ? (
    <span className="px-0.5 text-xs text-muted-foreground">to</span>
  ) : (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 bg-muted px-1.5 font-mono text-[11px] font-semibold text-foreground">
      {children}
    </kbd>
  );

export const AgriTechShortcutsDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[460px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <Keyboard className="h-4 w-4" aria-hidden />
          Keyboard shortcuts
        </DialogTitle>
        <DialogDescription className="text-xs">
          Shortcuts work when you are not typing in a field.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        {AGRITECH_SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </h3>
            <ul className="divide-y rounded-lg border">
              {group.items.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                  <span>{item.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DialogContent>
  </Dialog>
);
