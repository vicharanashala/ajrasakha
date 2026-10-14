// @ts-nocheck
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminGetAllUsers } from "@/hooks/api/Admin/useAdminGetAllUsers";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/atoms/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/atoms/popover";
import {
  getUserManagementList,
  addUserManagementEntry,
  removeUserManagementEntry,
} from "../../api";

// One list: a search-to-add picker (backed by the main agriai.users search, same endpoint
// user-table.tsx uses) plus the current entries with a remove button each. Two of these render
// side by side below for "edit" and "upload" — a user can be in both lists independently.
function ManagementList({ title, description, list }: { title: string; description: string; list: "edit" | "upload" }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState(null);
  const queryClient = useQueryClient();

  async function refetch() {
    try {
      const data = await getUserManagementList(list);
      setEntries(data || []);
    } catch (err) {
      toast.error(err.message || `Failed to load ${title}`);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const { data: searchResult, isLoading: searching } = useAdminGetAllUsers(
    1,
    200,
    debouncedSearch,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    { enabled: open },
  );
  const existingIds = new Set(entries.map((e) => e.user_id));
  const matches = (searchResult?.users || []).filter((u) => !existingIds.has(u._id));

  async function handleAdd(user) {
    setAddingId(user._id);
    try {
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
      await addUserManagementEntry(list, { user_id: user._id, name, email: user.email });
      setSearch("");
      setDebouncedSearch("");
      setOpen(false);
      await refetch();
    } catch (err) {
      toast.error(err.message || "Failed to add");
    } finally {
      setAddingId(null);
    }
  }

  async function handleRemove(entry) {
    setRemovingId(entry.user_id);
    try {
      await removeUserManagementEntry(list, entry.user_id);
      setEntries((prev) => prev.filter((e) => e.user_id !== entry.user_id));
      // Force the add-search to drop any cached result that still reflects the old membership,
      // instead of relying on it going stale on its own (UM-010).
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    } catch (err) {
      toast.error(err.message || "Failed to remove");
    } finally {
      setRemovingId(null);
      setConfirmingRemoveId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 min-w-0">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div>
            <Command shouldFilter={false} className="border border-border rounded-md overflow-visible">
              <CommandInput
                placeholder="Search by name or email to add…"
                value={search}
                onValueChange={(v) => {
                  setSearch(v);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
              />
            </Command>
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="p-0 w-[var(--radix-popover-trigger-width)]"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList className="max-h-56">
              {searching && <CommandEmpty>Searching…</CommandEmpty>}
              {!searching && matches.length === 0 && (
                <CommandEmpty>No matching users</CommandEmpty>
              )}
              <CommandGroup>
                {matches.map((u) => (
                  <CommandItem
                    key={u._id}
                    value={u._id}
                    disabled={addingId === u._id}
                    onSelect={() => handleAdd(u)}
                    className="justify-between gap-2"
                  >
                    <span className="truncate">
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}
                      <span className="text-muted-foreground"> · {u.email}</span>
                    </span>
                    <UserPlus size={13} className="flex-shrink-0 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="flex flex-col gap-1 mt-1">
        {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {!loading && entries.length === 0 && (
          <div className="text-xs text-muted-foreground">Nobody in this list yet.</div>
        )}
        {entries.map((e) => (
          <div
            key={e.user_id}
            className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/10 px-2.5 py-1.5"
          >
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{e.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{e.email}</div>
            </div>
            {confirmingRemoveId === e.user_id ? (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  disabled={removingId === e.user_id}
                  onClick={() => handleRemove(e)}
                  className="px-2 py-0.5 rounded bg-destructive text-destructive-foreground text-[10px] font-medium hover:bg-destructive/90 disabled:opacity-50 cursor-pointer"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemoveId(null)}
                  className="px-2 py-0.5 rounded border border-border text-[10px] text-muted-foreground hover:bg-accent cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRemoveId(e.user_id)}
                className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Admin-only tab (gated in DataProcessingDashboard.tsx by is_admin from GET /dashboard/me) — two
// independent lists backing can_edit/can_approve_uploads for everyone else, grouped under a "POP"
// heading since User Management may grow sections for other parts of the app later.
export default function UserManagementPanel() {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">POP</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ManagementList
          title="POP Editors"
          description="Can edit documents/placements, add placements, merge, and run find-duplicates (in addition to admins)."
          list="edit"
        />
        <ManagementList
          title="POP Upload Approvers"
          description="Can approve an expert's upload before it reaches an admin."
          list="upload"
        />
      </div>
    </div>
  );
}
