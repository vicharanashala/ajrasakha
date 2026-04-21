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

const inputClass =
  "w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1e1e1e] text-(--foreground) placeholder:text-(--muted-foreground) outline-none focus:ring-2 focus:ring-[#3AAA5A]/30 focus:border-[#3AAA5A] transition-all";

function FilterSection({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#161616] p-4 space-y-2">
      <Label className="flex items-center gap-2 text-sm font-semibold text-(--foreground)">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[#3AAA5A]/10 text-[#3AAA5A]">
          {icon}
        </span>
        {label}
      </Label>
      {children}
    </div>
  );
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
    setDraft({
      search: "",
      crop: "",
      village: "",
      startTime: undefined,
      endTime: undefined,
      profileCompleted: "all",
    });
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
          className="h-9 flex items-center gap-2 border-gray-200 dark:border-gray-700 hover:border-[#3AAA5A] hover:text-[#3AAA5A] transition-colors"
        >
          <Filter className="h-4 w-4" />
          Preferences
          {activeCount > 0 && (
            <Badge className="ml-0.5 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-[#3AAA5A] hover:bg-[#3AAA5A] text-white">
              {activeCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg w-full p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#3AAA5A]/10">
              <Filter className="h-4 w-4 text-[#3AAA5A]" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Filter Preferences
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Refine the farmer list with one or more filters
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Search */}
          <FilterSection icon={<Search className="h-3.5 w-3.5" />} label="Name / Email">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={draft.search}
              onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
              className={inputClass}
            />
          </FilterSection>

          {/* Crop + Village side by side */}
          <div className="grid grid-cols-2 gap-3">
            <FilterSection icon={<Sprout className="h-3.5 w-3.5" />} label="Crop">
              <input
                type="text"
                placeholder="e.g. rice, wheat..."
                value={draft.crop}
                onChange={(e) => setDraft((d) => ({ ...d, crop: e.target.value }))}
                className={inputClass}
              />
            </FilterSection>

            <FilterSection icon={<MapPin className="h-3.5 w-3.5" />} label="Village">
              <input
                type="text"
                placeholder="e.g. Poonjar..."
                value={draft.village}
                onChange={(e) => setDraft((d) => ({ ...d, village: e.target.value }))}
                className={inputClass}
              />
            </FilterSection>
          </div>

          {/* Date Range */}
          <FilterSection icon={<Calendar className="h-3.5 w-3.5" />} label="Date Range">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">From</span>
                <input
                  type="date"
                  value={toDateInputValue(draft.startTime)}
                  max={toDateInputValue(draft.endTime) || toDateInputValue(new Date())}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, startTime: fromDateInputValue(e.target.value) }))
                  }
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">To</span>
                <input
                  type="date"
                  value={toDateInputValue(draft.endTime)}
                  min={toDateInputValue(draft.startTime)}
                  max={toDateInputValue(new Date())}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, endTime: fromDateInputValue(e.target.value) }))
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </FilterSection>

          {/* Profile Completed */}
          <FilterSection icon={<UserCheck className="h-3.5 w-3.5" />} label="Farmer Profile">
            <Select
              value={draft.profileCompleted}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, profileCompleted: v as "all" | "yes" | "no" }))
              }
            >
              <SelectTrigger className="h-10 text-sm rounded-lg border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Farmers</SelectItem>
                <SelectItem value="yes">Profile Completed</SelectItem>
                <SelectItem value="no">Profile Not Completed</SelectItem>
              </SelectContent>
            </Select>
          </FilterSection>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-between sm:justify-between gap-2 bg-gray-50/50 dark:bg-[#161616]">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset all
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleApply}
              className="bg-[#3AAA5A] hover:bg-[#2e9449] text-white px-5"
            >
              Apply Filters
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
