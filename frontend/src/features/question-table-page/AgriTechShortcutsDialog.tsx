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
      { keys: ["E"], label: "Exit AgriTech Management" },
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

/** One group of shortcuts as a bordered list. */
const ShortcutGroup = ({ group }: { group: (typeof AGRITECH_SHORTCUT_GROUPS)[number] }) => (
  <section aria-labelledby={`shortcut-group-${group.title}`} className="min-w-0">
    <h3
      id={`shortcut-group-${group.title}`}
      className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
    >
      {group.title}
    </h3>
    <ul className="divide-y rounded-lg border bg-card">
      {group.items.map((item) => (
        <li key={item.label} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm">
          <span className="text-foreground">{item.label}</span>
          <span className="flex shrink-0 items-center gap-1">
            {item.keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </span>
        </li>
      ))}
    </ul>
  </section>
);

export const AgriTechShortcutsDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [actions, navigation, general] = AGRITECH_SHORTCUT_GROUPS;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[820px] max-w-[95vw] max-h-[88vh] overflow-y-auto gap-5">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted" aria-hidden>
            <Keyboard className="h-5 w-5 text-foreground" />
          </span>
          <div className="space-y-0.5">
            <DialogTitle className="text-base">Keyboard shortcuts</DialogTitle>
            <DialogDescription className="text-xs">
              Shortcuts work when you are not typing in a field. Press{" "}
              <Kbd>?</Kbd> any time to open this list.
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Actions and navigation side by side; general shortcuts span the full width. */}
        <div className="grid gap-5 md:grid-cols-2">
          <ShortcutGroup group={actions} />
          <ShortcutGroup group={navigation} />
          <div className="md:col-span-2">
            <ShortcutGroup group={general} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
