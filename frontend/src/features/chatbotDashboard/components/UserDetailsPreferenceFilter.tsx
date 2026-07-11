import { useRef, useState } from "react";
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
  Sprout,
  MapPin,
  Calendar,
  UserCheck,
  RefreshCcw,
  UserX,
  MessageSquareOff,
  Info,
  UserCheck2,
  LogIn,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {motion} from "framer-motion";
import {
  BLOCKS,
  CROPS,
  DISTRICTS,
  STATES,
  VILLAGES,
} from "../utils/metaData";

export interface UserDetailsFilters {
  search: string;
  crop: string;
  primaryCrops: string[];
  secondaryCrops: string[];
  roles: string[];
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
  verificationStatus: "all" | "verified" | "unverified";
  loginStatus: "all" | "loggedIn" | "loggedOut";
}

interface UserDetailsPreferenceFilterProps {
  filters: UserDetailsFilters;
  onApply: (filters: UserDetailsFilters) => void;
  /** Fields to hide from the filter dialog */
  hideFields?: Array<
    | "crop"
    | "inactive"
    | "profile"
    | "userType"
    | "roles"
    | "lowFeedback"
    | "loginStatus"
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
  "w-full h-9 px-3 text-sm rounded-lg border border-border/60 bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";

const selectTriggerClass =
  "h-9 w-full min-w-0 text-sm rounded-lg border-border/60 bg-background/60 [&>span]:truncate";

const ROLE_OPTIONS = ["Farmer", "Internal","district_coordinator","block_coordinator","village_volunteer",
];

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
    <div className="space-y-2.5">
      <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center justify-center w-5 h-5 rounded-md bg-primary/10 text-primary">
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
  const cropOptions = CROPS;
  const districtOptions = draft.state ? DISTRICTS[draft.state] ?? [] : [];
  const blockOptions = draft.district ? BLOCKS[draft.district] ?? [] : [];
  const villageOptions = draft.district
    ? (VILLAGES as Record<string, string[]>)[draft.district] ?? []
    : [];
  const farmerRoleSelected = draft.roles.some(
    (role) => role.toUpperCase() === "FARMER",
  );
  const showFarmerProfileFilters = draft.roles.length === 0 || farmerRoleSelected;

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) setDraft(filters);
    setOpen(isOpen);
  };

  const handleApply = () => {
    const shouldShowFarmerProfileFilters =
      draft.roles.length === 0 ||
      draft.roles.some((role) => role.toUpperCase() === "FARMER");
    onApply(
      shouldShowFarmerProfileFilters
        ? draft
        : {...draft, profileCompleted: "all"},
    );
    setOpen(false);
  };

  const handleReset = () => {
    setDraft({
      search: draft.search,
      crop: "",
      primaryCrops: [],
      secondaryCrops: [],
      roles: [],
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
      verificationStatus: "all",
      loginStatus: "all",
    });
  };

  const activeCount =
    (filters.crop ? 1 : 0) +
    (filters.primaryCrops?.length ? 1 : 0) +
    (filters.secondaryCrops?.length ? 1 : 0) +
    (filters.roles?.length ? 1 : 0) +
    (filters.village ? 1 : 0) +
    (filters.block ? 1 : 0) +
    (filters.district ? 1 : 0) +
    (filters.state ? 1 : 0) +
    (filters.startTime ? 1 : 0) +
    (filters.profileCompleted !== "all" ? 1 : 0) +
    (filters.inactiveOnly ? 1 : 0) +
    (filters.lowFeedbackOnly ? 1 : 0) +
    (filters.userType !== "all" ? 1 : 0) +
    (filters.verificationStatus !== "all" ? 1 : 0) +
    (filters.loginStatus !== "all" ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 flex items-center gap-2 border-border/60 hover:border-primary hover:text-primary transition-colors"
        >
          <Filter className="h-4 w-4" />
          Preferences
          {activeCount > 0 && (
            <Badge className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 flex items-center justify-center text-xs bg-primary hover:bg-primary text-primary-foreground">
              {activeCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent
        className="sm:max-w-3xl w-full p-0 gap-0 overflow-hidden z-[10001] bg-card border-border shadow-2xl"
        overlayClassName="z-[10000] bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col"
        >
          {/* Header */}
          <DialogHeader className="relative px-6 pt-5 pb-5 border-b border-border/60 bg-gradient-to-br from-primary/8 via-card to-card">
            {/* Decorative top accent */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.05, duration: 0.2 }}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 text-primary shrink-0"
              >
                <Filter className="h-4.5 w-4.5" />
              </motion.div>
              <div className="min-w-0">
                <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
                  Filter Preferences
                </DialogTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Refine the farmer list with one or more filters
                </p>
              </div>
              {activeCount > 0 && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="ml-auto text-[11px] font-semibold text-primary-foreground bg-primary px-3 py-1 rounded-full"
                >
                  {activeCount} active
                </motion.span>
              )}
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="px-6 py-5 max-h-[65vh] overflow-y-auto bg-background/50">
            <div className="space-y-3">
              {/* User Type */}
              {!hideFields.includes("userType") && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.07 }}
                  className="rounded-xl bg-card ring-1 ring-border/60 p-4"
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
                      <SelectTrigger className={selectTriggerClass}>
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

              {/* Roles */}
              {!hideFields.includes("roles") && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 }}
                  className="rounded-xl bg-card ring-1 ring-border/60 p-4"
                >
                  <FilterSection
                    icon={<UserCheck className="h-3.5 w-3.5" />}
                    label="Roles"
                  >
                    <SearchableMultiSelect
                      label="User roles"
                      placeholder="Search or select roles"
                      options={ROLE_OPTIONS}
                      selected={draft.roles ?? []}
                      onChange={(roles) =>
                        setDraft((d) => ({
                          ...d,
                          roles,
                          profileCompleted:
                            roles.length > 0 &&
                            !roles.some((role) => role.toUpperCase() === "FARMER")
                              ? "all"
                              : d.profileCompleted,
                        }))
                      }
                    />
                  </FilterSection>
                </motion.div>
              )}

              {/* Crop */}
              {!hideFields.includes("crop") && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.09 }}
                  className="rounded-xl bg-card ring-1 ring-border/60 p-4"
                >
                  <FilterSection
                    icon={<Sprout className="h-3.5 w-3.5" />}
                    label="Crop"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <SearchableMultiSelect
                        label="Primary crops"
                        placeholder="Search primary crops"
                        options={cropOptions}
                        selected={draft.primaryCrops ?? []}
                        onChange={(primaryCrops) =>
                          setDraft((d) => ({
                            ...d,
                            primaryCrops,
                            crop: "",
                          }))
                        }
                      />
                      <SearchableMultiSelect
                        label="Secondary crops"
                        placeholder="Search secondary crops"
                        options={cropOptions}
                        selected={draft.secondaryCrops ?? []}
                        onChange={(secondaryCrops) =>
                          setDraft((d) => ({
                            ...d,
                            secondaryCrops,
                            crop: "",
                          }))
                        }
                      />
                    </div>
                  </FilterSection>
                </motion.div>
              )}

              {/* Location */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.11 }}
                className="rounded-xl bg-card ring-1 ring-border/60 p-4"
              >
                <FilterSection
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Location"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 [&>*]:min-w-0">
                    <Select
                      value={draft.state || "all"}
                      onValueChange={(value) =>
                        setDraft((d) => ({
                          ...d,
                          state: value === "all" ? "" : value,
                          district: "",
                          block: "",
                          village: "",
                        }))
                      }
                    >
                      <SelectTrigger className={selectTriggerClass}>
                        <SelectValue placeholder="State" />
                      </SelectTrigger>
                      <SelectContent className="z-[10002]">
                        <SelectItem value="all">All States</SelectItem>
                        {STATES.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={draft.district || "all"}
                      disabled={!draft.state}
                      onValueChange={(value) =>
                        setDraft((d) => ({
                          ...d,
                          district: value === "all" ? "" : value,
                          block: "",
                          village: "",
                        }))
                      }
                    >
                      <SelectTrigger className={selectTriggerClass}>
                        <SelectValue placeholder="District" />
                      </SelectTrigger>
                      <SelectContent className="z-[10002]">
                        <SelectItem value="all">All Districts</SelectItem>
                        {districtOptions.map((district) => (
                          <SelectItem key={district} value={district}>
                            {district}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <SearchableSingleSelect
                      placeholder="Select block"
                      value={draft.block}
                      disabled={!draft.district}
                      options={blockOptions}
                      onChange={(block) =>
                        setDraft((d) => ({
                          ...d,
                          block,
                          village: "",
                        }))
                      }
                    />

                    <SearchableSingleSelect
                      placeholder="Select village"
                      value={draft.village}
                      disabled={!draft.district}
                      options={villageOptions}
                      onChange={(village) =>
                        setDraft((d) => ({ ...d, village }))
                      }
                    />
                  </div>
                </FilterSection>
              </motion.div>

              {/* Date Range */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.13 }}
                className="rounded-xl bg-card ring-1 ring-border/60 p-4"
              >
                <FilterSection
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label="Date Range"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">
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
                      <span className="text-[11px] text-muted-foreground font-medium">
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

              {/* Toggle row */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3"
              >
                {!hideFields.includes("inactive") && (
                  <ToggleCard
                    id="inactive-only"
                    icon={<UserX className="h-3.5 w-3.5" />}
                    iconBg="bg-primary/10"
                    iconColor="text-primary"
                    activeColor="bg-primary"
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
                <div className="rounded-xl bg-card ring-1 ring-border/60 p-3.5">
                  <FilterSection
                    icon={<UserCheck2 className="h-3.5 w-3.5" />}
                    label="Verification"
                  >
                    <Select
                      value={draft.verificationStatus}
                      onValueChange={(value) =>
                        setDraft((d) => ({
                          ...d,
                          verificationStatus: value as
                            | "all"
                            | "verified"
                            | "unverified",
                        }))
                      }
                    >
                      <SelectTrigger className={selectTriggerClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[10002]">
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="verified">Verified</SelectItem>
                        <SelectItem value="unverified">Not Verified</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterSection>
                </div>
                {!hideFields.includes("loginStatus") && (
                  <div className="rounded-xl bg-card ring-1 ring-border/60 p-3.5">
                    <FilterSection
                      icon={<LogIn className="h-3.5 w-3.5" />}
                      label="Login Status"
                    >
                      <Select
                        value={draft.loginStatus}
                        onValueChange={(value) =>
                          setDraft((d) => ({
                            ...d,
                            loginStatus: value as
                              | "all"
                              | "loggedIn"
                              | "loggedOut",
                          }))
                        }
                      >
                        <SelectTrigger className={selectTriggerClass}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[10002]">
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="loggedIn">
                            Currently logged in
                          </SelectItem>
                          <SelectItem value="loggedOut">Not logged in</SelectItem>
                        </SelectContent>
                      </Select>
                    </FilterSection>
                  </div>
                )}
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
              {!hideFields.includes("profile") && showFarmerProfileFilters && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.17 }}
                  className="rounded-xl bg-card ring-1 ring-border/60 p-4"
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
                      <SelectTrigger className={selectTriggerClass}>
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
          <DialogFooter className="px-6 py-3.5 border-t border-border/60 flex justify-between sm:justify-between gap-2 bg-card">
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
                <Button variant="outline" size="sm" className="border-border/60">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={draft.inactiveOnly && !!inactiveDateError}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 shadow-md shadow-primary/20 disabled:opacity-50 disabled:shadow-none"
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

function SearchableSingleSelect({
  value,
  options,
  placeholder,
  disabled = false,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredOptions = options
    .filter((option) => option.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10);

  return (
    <div className="relative min-w-0">
      <input
        type="text"
        placeholder={placeholder}
        value={open ? query : value}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className={cn(inputClass, disabled && "cursor-not-allowed opacity-60")}
      />
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[10003] max-h-[260px] overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-primary/10 transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(option);
                  setQuery("");
                  setOpen(false);
                }}
              >
                {option}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchableMultiSelect({
  label,
  selected,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  selected: string[];
  options: string[];
  placeholder: string;
  onChange: (value: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedSet = new Set(selected);
  const filteredOptions = options
    .filter((option) => option.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10);
  const selectedSummary = selected.join(", ");

  const remove = (option: string) => {
    onChange(selected.filter((item) => item !== option));
  };

  const toggle = (option: string) => {
    if (selectedSet.has(option)) {
      remove(option);
      return;
    }

    onChange([...selected, option]);
  };

  return (
    <div
      className="space-y-2"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder={selected.length > 0 ? "" : placeholder}
          value={query}
          onMouseDown={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          className={cn(inputClass, "pr-10")}
        />
        {selectedSummary && !query && (
          <span className="pointer-events-none absolute inset-y-0 left-3 right-10 flex items-center truncate text-sm text-foreground">
            {selectedSummary}
          </span>
        )}
        <button
          type="button"
          aria-label={open ? "Close crop dropdown" : "Open crop dropdown"}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[10003] max-h-[260px] overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = selectedSet.has(option);

                return (
                  <button
                    key={option}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-primary/10",
                      isSelected && "bg-primary/10 font-medium text-primary",
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      toggle(option);
                      setQuery("");
                      setOpen(true);
                      inputRef.current?.focus();
                    }}
                  >
                    <span className="truncate">{option}</span>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No matches
              </div>
            )}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <span
              key={option}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
            >
              <span className="truncate">{option}</span>
              <button
                type="button"
                aria-label={`Remove ${option}`}
                className="rounded-sm px-0.5 text-primary hover:bg-primary/20 transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => remove(option)}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
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
    <div className="rounded-xl bg-card ring-1 ring-border/60 p-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex items-center justify-center w-5 h-5 rounded-md shrink-0",
            iconBg,
            iconColor,
          )}
        >
          {icon}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
          {label}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help shrink-0 transition-colors" />
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
          checked ? activeColor : "bg-muted-foreground/30",
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
