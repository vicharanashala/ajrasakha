import { useState } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Label } from "@/components/atoms/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select";
import { Separator } from "@/components/atoms/separator";
import { Badge } from "@/components/atoms/badge";
import {
  Filter,
  Search,
  Sprout,
  MapPin,
  Calendar,
  UserCheck,
  RefreshCcw,
} from "lucide-react";

export interface UserDetailsFilters {
  search: string;
  crop: string;
  village: string;
  startTime: Date | undefined;
  endTime: Date | undefined;
  profileCompleted: "all" | "yes" | "no";
}

interface UserDetailsPreferenceFilterProps {
  filters: UserDetailsFilters;
  onApply: (filters: UserDetailsFilters) => void;
}

function toDateInputValue(d: Date | undefined): string {
  if (!d) return "";
  return d.toISOString().split("T")[0];
}

function fromDateInputValue(s: string): Date | undefined {
  if (!s) return undefined;
  return new Date(s);
}

export function UserDetailsPreferenceFilter({
  filters,
  onApply,
}: UserDetailsPreferenceFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UserDetailsFilters>(filters);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) setDraft(filters);
    setOpen(isOpen);
  };

  const handleApply = () => {
    onApply(draft);
    setOpen(false);
  };

  const handleReset = () => {
    const cleared: UserDetailsFilters = {
      search: "",
      crop: "",
      village: "",
      startTime: undefined,
      endTime: undefined,
      profileCompleted: "all",
    };
    setDraft(cleared);
  };

  const activeCount =
    (filters.search ? 1 : 0) +
    (filters.crop ? 1 : 0) +
    (filters.village ? 1 : 0) +
    (filters.startTime ? 1 : 0) +
    (filters.profileCompleted !== "all" ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 flex items-center gap-2"
        >
          <Filter className="h-4 w-4 text-primary" />
          Preferences
          {activeCount > 0 && (
            <Badge
              variant="destructive"
              className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Filter Preferences
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Refine the user list with one or more filters
          </p>
          <Separator />
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Search */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <Search className="h-4 w-4 text-primary" />
              Name / Email
            </Label>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={draft.search}
              onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#222] text-(--foreground) placeholder:text-(--muted-foreground) outline-none focus:border-[#3AAA5A] transition-colors"
            />
          </div>

          <Separator />

          {/* Crop */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <Sprout className="h-4 w-4 text-primary" />
              Crop
            </Label>
            <input
              type="text"
              placeholder="Filter by crop..."
              value={draft.crop}
              onChange={(e) => setDraft((d) => ({ ...d, crop: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#222] text-(--foreground) placeholder:text-(--muted-foreground) outline-none focus:border-[#3AAA5A] transition-colors"
            />
          </div>

          <Separator />

          {/* Village */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-primary" />
              Village
            </Label>
            <input
              type="text"
              placeholder="Filter by village..."
              value={draft.village}
              onChange={(e) => setDraft((d) => ({ ...d, village: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#222] text-(--foreground) placeholder:text-(--muted-foreground) outline-none focus:border-[#3AAA5A] transition-colors"
            />
          </div>

          <Separator />

          {/* Date Range */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="h-4 w-4 text-primary" />
              Date Range
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">From</span>
                <input
                  type="date"
                  value={toDateInputValue(draft.startTime)}
                  max={toDateInputValue(draft.endTime) || toDateInputValue(new Date())}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, startTime: fromDateInputValue(e.target.value) }))
                  }
                  className="w-full h-9 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#222] text-(--foreground) outline-none focus:border-[#3AAA5A] transition-colors"
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">To</span>
                <input
                  type="date"
                  value={toDateInputValue(draft.endTime)}
                  min={toDateInputValue(draft.startTime)}
                  max={toDateInputValue(new Date())}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, endTime: fromDateInputValue(e.target.value) }))
                  }
                  className="w-full h-9 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#222] text-(--foreground) outline-none focus:border-[#3AAA5A] transition-colors"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Profile Completed */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <UserCheck className="h-4 w-4 text-primary" />
              Farmer Profile Completed
            </Label>
            <Select
              value={draft.profileCompleted}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, profileCompleted: v as "all" | "yes" | "no" }))
              }
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Farmers</SelectItem>
                <SelectItem value="yes">Profile Completed</SelectItem>
                <SelectItem value="no">Profile Not Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button size="sm" onClick={handleApply}>
              Apply Filters
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
