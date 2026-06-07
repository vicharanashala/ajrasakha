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
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/atoms/tooltip";
import {
  Filter,
  Search,
  Sprout,
  MapPin,
  Calendar,
  UserCheck,
  RefreshCcw,
  UserX,
  MessageSquareOff,
  Info,
  UserCheck2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {motion} from "framer-motion";

export interface UserDetailsFilters {
  search: string;
  crop: string;
  village: string;
  block: string;
  district: string;
  state: string;
  startTime: Date | undefined;
  endTime: Date | undefined;
  profileCompleted: "all" | "yes" | "no";
  inactiveOnly: boolean;
  lowFeedbackOnly: boolean;
  userType: "all" | "internal" | "external";
  isVerified: boolean;
}

interface UserDetailsPreferenceFilterProps {
  filters: UserDetailsFilters;
  onApply: (filters: UserDetailsFilters) => void;
  /** Fields to hide from the filter dialog */
  hideFields?: Array<
    "crop" | "inactive" | "profile" | "userType" | "lowFeedback"
  >;
}

function toDateInputValue(d: Date | undefined): string {
  if (!d) return "";
  // Format using local time components to stay consistent with fromDateInputValue.
  // d.toISOString() converts to UTC first, which can shift the date by a day for IST users.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(s: string): Date | undefined {
  if (!s) return undefined;
  // Parse as local midnight, NOT UTC.
  // new Date("YYYY-MM-DD") treats the string as UTC which causes a timezone
  // offset mismatch vs setHours(0,0,0,0) used elsewhere in the app.
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function defaultInactiveStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  d.setHours(0, 0, 0, 0); // midnight local — must match handleInactiveUsersClick
  return d;
}

function defaultInactiveEnd(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0); // midnight today — useUserDetails adds +24h internally
  return d;
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

function getInactiveDateError(
  from: Date | undefined,
  to: Date | undefined,
): string {
  if (!from || !to) return "A date range is required for inactive users filter";
  const diffDays = Math.round(
    (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 3) return "Range must be at least 3 days";
  if (diffDays > 30) return "Range cannot exceed 30 days";
  return "";
}

export function UserDetailsPreferenceFilter({
  filters,
  onApply,
  hideFields = [],
}: UserDetailsPreferenceFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UserDetailsFilters>(filters);

  const inactiveDateError = draft.inactiveOnly
    ? getInactiveDateError(draft.startTime, draft.endTime)
    : "";

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
      search: draft.search,
      crop: "",
      village: "",
      block: "",
      district: "",
      state: "",
      startTime: undefined,
      endTime: undefined,
      profileCompleted: "all",
      inactiveOnly: false,
      lowFeedbackOnly: false,
      userType: "all",
      isVerified: true,
    });
  };

  const activeCount =
    (filters.crop ? 1 : 0) +
    (filters.village ? 1 : 0) +
    (filters.block ? 1 : 0) +
    (filters.district ? 1 : 0) +
    (filters.state ? 1 : 0) +
    (filters.startTime ? 1 : 0) +
    (filters.profileCompleted !== "all" ? 1 : 0) +
    (filters.inactiveOnly ? 1 : 0) +
    (filters.lowFeedbackOnly ? 1 : 0) +
    (filters.userType !== "all" ? 1 : 0);

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
            <Badge className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 flex items-center justify-center text-xs bg-[#3AAA5A] hover:bg-[#3AAA5A] text-white">
              {activeCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent
        className="sm:max-w-3xl w-full p-0 gap-0 overflow-hidden z-[10001] bg-white dark:bg-[#0f0f0f] border-gray-200 dark:border-gray-800 shadow-2xl"
        overlayClassName="z-[10000] bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col"
        >
          {/* Header — filled gradient strip */}
          <DialogHeader className="relative px-6 pt-5 pb-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-br from-[#3AAA5A]/10 via-white to-white dark:from-[#3AAA5A]/10 dark:via-[#141414] dark:to-[#0f0f0f]">
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.05, duration: 0.2 }}
                className="flex items-center justify-center w-11 h-11 rounded-xl bg-[#3AAA5A] text-white shadow-lg shadow-[#3AAA5A]/30 shrink-0"
              >
                <Filter className="h-5 w-5" />
              </motion.div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold tracking-tight">
                  Filter Preferences
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Refine the farmer list with one or more filters
                </p>
              </div>
              {activeCount > 0 && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="ml-auto text-xs font-semibold text-white bg-[#3AAA5A] px-3 py-1.5 rounded-full shadow-sm"
                >
                  {activeCount} active
                </motion.span>
              )}
            </div>
          </DialogHeader>

          {/* Body — filled panels, no wasted space */}
          <div className="px-6 py-5 max-h-[65vh] overflow-y-auto bg-gray-50/60 dark:bg-[#0d0d0d]">
            <div className="grid grid-cols-2 gap-3">
              {/* Row 1: User Type + Crop */}
              {!hideFields.includes("userType") && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.07 }}
                  className="col-span-1 rounded-xl bg-white dark:bg-[#161616] border border-gray-200/70 dark:border-gray-800 p-3.5"
                >
                  <FilterSection
                    icon={<UserCheck className="h-3.5 w-3.5" />}
                    label="User Type"
                  >
                    <Select
                      value={draft.userType}
                      onValueChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          userType: v as "all" | "internal" | "external",
                        }))
                      }
                    >
                      <SelectTrigger className="h-10 text-sm rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e1e1e]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[10002]">
                        <SelectItem value="all">All Users</SelectItem>
                        <SelectItem value="external">External Users</SelectItem>
                        <SelectItem value="internal">Internal Users</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterSection>
                </motion.div>
              )}

              {!hideFields.includes("crop") && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.09 }}
                  className="col-span-1 rounded-xl bg-white dark:bg-[#161616] border border-gray-200/70 dark:border-gray-800 p-3.5"
                >
                  <FilterSection
                    icon={<Sprout className="h-3.5 w-3.5" />}
                    label="Crop"
                  >
                    <input
                      type="text"
                      placeholder="e.g. rice, wheat..."
                      value={draft.crop}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, crop: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </FilterSection>
                </motion.div>
              )}

              {/* Location — full width filled panel */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.11 }}
                className="col-span-2 rounded-xl bg-white dark:bg-[#161616] border border-gray-200/70 dark:border-gray-800 p-3.5"
              >
                <FilterSection
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Location"
                >
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      ["Village", "village"],
                      ["Block", "block"],
                      ["District", "district"],
                      ["State", "state"],
                    ].map(([ph, key]) => (
                      <input
                        key={key}
                        type="text"
                        placeholder={ph}
                        value={(draft as any)[key]}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [key]: e.target.value }))
                        }
                        className={inputClass}
                      />
                    ))}
                  </div>
                </FilterSection>
              </motion.div>

              {/* Date Range */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.13 }}
                className="col-span-2 rounded-xl bg-white dark:bg-[#161616] border border-gray-200/70 dark:border-gray-800 p-3.5"
              >
                <FilterSection
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label="Date Range"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        From
                      </span>
                      <input
                        type="date"
                        value={toDateInputValue(draft.startTime)}
                        max={
                          toDateInputValue(draft.endTime) ||
                          toDateInputValue(new Date())
                        }
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            startTime: fromDateInputValue(e.target.value),
                          }))
                        }
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        To
                      </span>
                      <input
                        type="date"
                        value={toDateInputValue(draft.endTime)}
                        min={toDateInputValue(draft.startTime)}
                        max={toDateInputValue(new Date())}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            endTime: fromDateInputValue(e.target.value),
                          }))
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  {draft.inactiveOnly && inactiveDateError && (
                    <p className="text-xs text-destructive mt-2">
                      {inactiveDateError}
                    </p>
                  )}
                  {draft.inactiveOnly && !inactiveDateError && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Range: 3–30 days
                    </p>
                  )}
                </FilterSection>
              </motion.div>

              {/* Toggle row — filled, 3-up */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="col-span-2 grid grid-cols-3 gap-3"
              >
                {!hideFields.includes("inactive") && (
                  <ToggleCard
                    id="inactive-only"
                    icon={<UserX className="h-3.5 w-3.5" />}
                    iconBg="bg-[#3AAA5A]/10"
                    iconColor="text-[#3AAA5A]"
                    activeColor="bg-[#3AAA5A]"
                    label="Inactive Users"
                    tooltip="Shows users who have not asked any questions in the selected date range"
                    checked={draft.inactiveOnly}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        inactiveOnly: e.target.checked,
                        startTime:
                          e.target.checked && !d.startTime
                            ? defaultInactiveStart()
                            : d.startTime,
                        endTime:
                          e.target.checked && !d.endTime
                            ? defaultInactiveEnd()
                            : d.endTime,
                      }))
                    }
                  />
                )}
                <ToggleCard
                  id="un-verified-users-only"
                  icon={<UserCheck2 className="h-3.5 w-3.5" />}
                  iconBg="bg-violet-500/10"
                  iconColor="text-violet-500"
                  activeColor="bg-violet-500"
                  label="Unverified Users"
                  tooltip="Shows users waiting for admin verification"
                  checked={!draft.isVerified}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, isVerified: !e.target.checked }))
                  }
                />
                {!hideFields.includes("lowFeedback") && (
                  <ToggleCard
                    id="low-feedback-only"
                    icon={<MessageSquareOff className="h-3.5 w-3.5" />}
                    iconBg="bg-orange-500/10"
                    iconColor="text-orange-500"
                    activeColor="bg-orange-500"
                    label="Low Feedback"
                    tooltip="Shows users who have never given any feedback (no thumbs up/down on any response)"
                    checked={draft.lowFeedbackOnly}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        lowFeedbackOnly: e.target.checked,
                      }))
                    }
                  />
                )}
              </motion.div>

              {/* Profile Completed */}
              {!hideFields.includes("profile") && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.17 }}
                  className="col-span-2 rounded-xl bg-white dark:bg-[#161616] border border-gray-200/70 dark:border-gray-800 p-3.5"
                >
                  <FilterSection
                    icon={<UserCheck className="h-3.5 w-3.5" />}
                    label="Farmer Profile"
                  >
                    <Select
                      value={draft.profileCompleted}
                      onValueChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          profileCompleted: v as "all" | "yes" | "no",
                        }))
                      }
                    >
                      <SelectTrigger className="h-10 text-sm rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e1e1e]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[10002]">
                        <SelectItem value="all">All Farmers</SelectItem>
                        <SelectItem value="yes">Profile Completed</SelectItem>
                        <SelectItem value="no">
                          Profile Not Completed
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterSection>
                </motion.div>
              )}
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-between sm:justify-between gap-2 bg-white dark:bg-[#0f0f0f]">
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
                disabled={draft.inactiveOnly && !!inactiveDateError}
                className="bg-[#3AAA5A] hover:bg-[#2e9449] text-white px-6 shadow-md shadow-[#3AAA5A]/25 disabled:opacity-50 disabled:shadow-none"
              >
                Apply Filters
              </Button>
            </div>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

function ToggleCard({
  id,
  icon,
  iconBg,
  iconColor,
  activeColor,
  label,
  tooltip,
  checked,
  onChange,
}: {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  activeColor: string;
  label: string;
  tooltip: string;
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#161616] p-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded-md shrink-0",
            iconBg,
            iconColor,
          )}
        >
          {icon}
        </span>
        <span className="text-sm font-semibold text-foreground leading-tight">
          {label}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 cursor-help shrink-0" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <label
        htmlFor={id}
        className={cn(
          "relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200",
          checked ? activeColor : "bg-gray-300 dark:bg-gray-600",
        )}
      >
        <input
          type="checkbox"
          id={id}
          className="sr-only"
          checked={checked}
          onChange={onChange}
        />
        <span
          className={cn(
            "pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-[20px]" : "translate-x-[2px]",
          )}
        />
      </label>
    </div>
  );
}