import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Label } from "@/components/atoms/label";
import { Badge } from "@/components/atoms/badge";
import { Switch } from "@/components/atoms/switch";
import { Input } from "@/components/atoms/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Filter,
  MapPin,
  Download,
  Loader2,
  RotateCcw,
  Check,
  X,
  SlidersHorizontal,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Award,
  KeyRound,
  ClipboardCheck,
  FlaskConical,
  Users,
  CheckCircle2,
  Ban,
  BadgeCheck,
  XCircle,
  Zap,
  GraduationCap,
  CircleSlash,
  FileSpreadsheet,
  Sparkles,
  Shield,
} from "lucide-react";
import { useGetStates } from "@/hooks/api/location/useLocations";
import { cn } from "@/lib/utils";

interface UserFiltersDialogProps {
  isAdmin: boolean;
  filter: string;
  setFilter: (val: string) => void;
  roleFilter: string;
  setRoleFilter: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  verifiedFilter: string;
  setVerifiedFilter: (val: string) => void;
  stfFilter: string;
  setStfFilter: (val: string) => void;
  tmuFilter: string;
  setTmuFilter: (val: string) => void;
  setPage: (val: number) => void;
  activeFiltersCount: number;
  /** Export controls (moved into this dialog). */
  isExporting?: boolean;
  onExport?: (overrides?: {
    filter?: string;
    role?: string;
    isBlocked?: string;
    isVerified?: string;
    isSTF?: string;
    isTMU?: string;
    getAnalytics?: boolean;
  }) => void;
  getAnalytics?: boolean;
  setGetAnalytics?: (val: boolean) => void;
}

const ROLE_OPTIONS = [
  { value: "ALL", label: "All Roles", icon: Users },
  { value: "admin", label: "Admin", icon: ShieldAlert },
  { value: "moderator", label: "Moderator", icon: ShieldCheck },
  { value: "expert", label: "Expert", icon: UserCheck },
  { value: "pae_expert", label: "PAE Expert", icon: Award },
  { value: "gate_keeper", label: "Gate Keeper", icon: KeyRound },
  { value: "auditor", label: "Auditor", icon: ClipboardCheck },
  { value: "tester", label: "Tester", icon: FlaskConical },
] as const;

function StateSelect({
  value,
  onChange,
  states,
  isLoading,
}: {
  value: string;
  onChange: (val: string) => void;
  states: string[];
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleStates = normalizedQuery
    ? states.filter((st) => st.toLowerCase().includes(normalizedQuery))
    : states;

  const isSelected = value !== "ALL" && value !== "";

  return (
    <div className="relative w-full">
      <Select
        value={value === "" ? "ALL" : value}
        onValueChange={(val) => {
          onChange(val);
          setSearchQuery("");
        }}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setSearchQuery("");
          }
        }}
      >
        <SelectTrigger
          className={cn(
            "w-full justify-between h-9 px-3 bg-background font-normal border transition-colors",
            isSelected
              ? "border-primary/60 bg-primary/5 text-foreground font-medium"
              : "text-muted-foreground"
          )}
        >
          <div className="flex items-center gap-2 truncate pr-6">
            <MapPin
              className={cn(
                "h-4 w-4 shrink-0",
                isSelected ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span className="truncate text-xs sm:text-sm">
              {isSelected ? value : "All States"}
            </span>
          </div>
        </SelectTrigger>
        <SelectContent
          className="max-h-64"
          headerSlot={
            <div className="p-1.5 border-b border-border/50 sticky top-0 bg-popover z-10">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="Search state..."
                className="h-8 text-xs bg-background"
                autoFocus
              />
            </div>
          }
        >
          <SelectItem value="ALL">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span>All States</span>
            </div>
          </SelectItem>
          {isLoading ? (
            <div className="py-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Loading states...</span>
            </div>
          ) : visibleStates.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No state found
            </div>
          ) : (
            visibleStates.map((st) => (
              <SelectItem key={st} value={st}>
                {st}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {isSelected && (
        <button
          type="button"
          aria-label="Clear state filter"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange("ALL");
          }}
          className="absolute right-8 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface FilterAttributeCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  value: string;
  onChange: (val: string) => void;
  options: {
    value: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    activeClass?: string;
  }[];
}

function FilterAttributeCard({
  icon: Icon,
  iconColor = "text-primary",
  title,
  subtitle,
  badge,
  value,
  onChange,
  options,
}: FilterAttributeCardProps) {
  const isFiltered = value !== "ALL";

  return (
    <div
      className={cn(
        "flex flex-col justify-between p-3 rounded-xl border transition-all duration-200 gap-2.5",
        isFiltered
          ? "border-primary/40 bg-primary/[0.03] dark:bg-primary/[0.05] shadow-xs"
          : "border-border/70 bg-card/60 hover:border-border"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
              isFiltered
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Icon
              className={cn("h-4 w-4", isFiltered ? "text-primary" : iconColor)}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground tracking-tight">
                {title}
              </span>
              {badge && (
                <Badge className="h-3.5 text-[8px] px-1 py-0 bg-red-500 hover:bg-red-600 border-0 text-white font-medium">
                  {badge}
                </Badge>
              )}
            </div>
            {subtitle && (
              <p className="text-[10px] text-muted-foreground line-clamp-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {isFiltered && (
          <button
            type="button"
            onClick={() => onChange("ALL")}
            className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5 font-medium shrink-0"
            title="Reset this filter"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Segmented Switch Control */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-muted/60 dark:bg-muted/40 rounded-lg border border-border/40">
        {options.map((opt) => {
          const isSelected = value === opt.value;
          const OptIcon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex items-center justify-center gap-1 py-1 px-1.5 rounded-md text-[11px] font-medium transition-all",
                isSelected
                  ? opt.activeClass ||
                      "bg-background text-foreground shadow-xs ring-1 ring-border/60 font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              )}
            >
              {OptIcon && <OptIcon className="h-3 w-3 shrink-0" />}
              <span className="truncate">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const UserFiltersDialog: React.FC<UserFiltersDialogProps> = ({
  isAdmin,
  filter,
  setFilter,
  roleFilter,
  setRoleFilter,
  statusFilter,
  setStatusFilter,
  verifiedFilter,
  setVerifiedFilter,
  stfFilter,
  setStfFilter,
  tmuFilter,
  setTmuFilter,
  setPage,
  activeFiltersCount,
  isExporting,
  onExport,
  getAnalytics,
  setGetAnalytics,
}) => {
  const [open, setOpen] = useState(false);
  // Central API hook for fetching all Indian states
  const { data: statesResponse = [], isLoading: isLoadingStates } = useGetStates();
  const states = useMemo(() => {
    return statesResponse
      .map((s) => s.stateNameEnglish)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [statesResponse]);

  // Draft state
  const [draftFilter, setDraftFilter] = useState(filter === "" ? "ALL" : filter);
  const [draftRole, setDraftRole] = useState(roleFilter);
  const [draftStatus, setDraftStatus] = useState(statusFilter);
  const [draftVerified, setDraftVerified] = useState(verifiedFilter);
  const [draftStf, setDraftStf] = useState(stfFilter);
  const [draftTmu, setDraftTmu] = useState(tmuFilter);

  useEffect(() => {
    if (open) {
      setDraftFilter(filter === "" ? "ALL" : filter);
      setDraftRole(roleFilter);
      setDraftStatus(statusFilter);
      setDraftVerified(verifiedFilter);
      setDraftStf(stfFilter);
      setDraftTmu(tmuFilter);
    }
  }, [open, filter, roleFilter, statusFilter, verifiedFilter, stfFilter, tmuFilter]);

  const draftActiveCount = useMemo(() => {
    let count = 0;
    if (draftFilter !== "ALL" && draftFilter !== "") count++;
    if (draftRole !== "ALL") count++;
    if (draftStatus !== "ALL") count++;
    if (draftVerified !== "ALL") count++;
    if (draftStf !== "ALL") count++;
    if (draftTmu !== "ALL") count++;
    return count;
  }, [draftFilter, draftRole, draftStatus, draftVerified, draftStf, draftTmu]);

  const handleApply = () => {
    setFilter(draftFilter === "ALL" ? "" : draftFilter);
    setRoleFilter(draftRole);
    setStatusFilter(draftStatus);
    setVerifiedFilter(draftVerified);
    setStfFilter(draftStf);
    setTmuFilter(draftTmu);
    setPage(1);
    setOpen(false);
  };

  const handleReset = () => {
    setDraftFilter("ALL");
    setDraftRole("ALL");
    setDraftStatus("ALL");
    setDraftVerified("ALL");
    setDraftStf("ALL");
    setDraftTmu("ALL");
  };

  // Download uses the CURRENT draft filters (so it matches what's shown in the dialog),
  // and also applies them so the table stays in sync. Explicit values avoid stale state.
  const handleDownload = () => {
    handleApply();
    onExport?.({
      filter: draftFilter === "ALL" ? "" : draftFilter,
      role: draftRole,
      isBlocked: draftStatus,
      isVerified: draftVerified,
      isSTF: draftStf,
      isTMU: draftTmu,
      getAnalytics: !!getAnalytics && draftRole === "pae_expert",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <Badge className="absolute -top-2 -right-1 h-4 text-[9px] px-1.5 py-0 bg-red-500 hover:bg-red-600 border-0 z-10 text-white">
            New
          </Badge>
          <Filter className="h-4 w-4 text-primary" />
          Filters
          {activeFiltersCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl md:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  User Filters
                  {draftActiveCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-[11px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20 font-semibold"
                    >
                      {draftActiveCount} active
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Filter and segment users by location, role, verification, and status.
                </DialogDescription>
              </div>
            </div>

            {draftActiveCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-primary gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                Reset all
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 max-h-[calc(90vh-140px)]">
          <div className="space-y-4">
            {/* 1. Location / State Filter (Fetched from Location API) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-xs font-semibold">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  State / Location
                </Label>
                {draftFilter !== "ALL" && draftFilter !== "" && (
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                    {draftFilter}
                  </Badge>
                )}
              </div>
              <StateSelect
                value={draftFilter}
                onChange={setDraftFilter}
                states={states}
                isLoading={isLoadingStates}
              />
            </div>

            {isAdmin && (
              <>
                {/* 2. Role Selector (Pills) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-xs font-semibold">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      User Role
                    </Label>
                    {draftRole !== "ALL" && (
                      <button
                        type="button"
                        onClick={() => setDraftRole("ALL")}
                        className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 font-medium"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {ROLE_OPTIONS.map((role) => {
                      const Icon = role.icon;
                      const isSelected = draftRole === role.value;
                      return (
                        <button
                          key={role.value}
                          type="button"
                          onClick={() => setDraftRole(role.value)}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all text-left",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "bg-background/80 hover:bg-muted/70 text-muted-foreground hover:text-foreground border-border/80"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              isSelected
                                ? "text-primary-foreground"
                                : "text-muted-foreground"
                            )}
                          />
                          <span className="truncate">{role.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Attribute Cards (Status, Verification, STF, TMU) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Account Status */}
                  <FilterAttributeCard
                    icon={UserCheck}
                    iconColor="text-emerald-500"
                    title="Account Status"
                    subtitle="Filter active or blocked accounts"
                    value={draftStatus}
                    onChange={setDraftStatus}
                    options={[
                      { value: "ALL", label: "All" },
                      {
                        value: "false",
                        label: "Active",
                        icon: CheckCircle2,
                        activeClass:
                          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/40 font-semibold",
                      },
                      {
                        value: "true",
                        label: "Blocked",
                        icon: Ban,
                        activeClass:
                          "bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-500/40 font-semibold",
                      },
                    ]}
                  />

                  {/* Verification Status */}
                  <FilterAttributeCard
                    icon={BadgeCheck}
                    iconColor="text-blue-500"
                    title="Verification"
                    subtitle="Identity verification status"
                    badge="New"
                    value={draftVerified}
                    onChange={setDraftVerified}
                    options={[
                      { value: "ALL", label: "All" },
                      {
                        value: "true",
                        label: "Verified",
                        icon: BadgeCheck,
                        activeClass:
                          "bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/40 font-semibold",
                      },
                      {
                        value: "false",
                        label: "Unverified",
                        icon: XCircle,
                        activeClass:
                          "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/40 font-semibold",
                      },
                    ]}
                  />

                  {/* STF Status */}
                  <FilterAttributeCard
                    icon={Zap}
                    iconColor="text-amber-500"
                    title="Special Task Force"
                    subtitle="STF team member status"
                    badge="New"
                    value={draftStf}
                    onChange={setDraftStf}
                    options={[
                      { value: "ALL", label: "All" },
                      {
                        value: "true",
                        label: "STF",
                        icon: Zap,
                        activeClass:
                          "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/40 font-semibold",
                      },
                      {
                        value: "false",
                        label: "Non-STF",
                        icon: CircleSlash,
                        activeClass:
                          "bg-slate-500/15 text-slate-700 dark:text-slate-300 ring-1 ring-slate-500/40 font-semibold",
                      },
                    ]}
                  />

                  {/* Training Users */}
                  <FilterAttributeCard
                    icon={GraduationCap}
                    iconColor="text-purple-500"
                    title="Training Users"
                    subtitle="Users in training phase"
                    badge="New"
                    value={draftTmu}
                    onChange={setDraftTmu}
                    options={[
                      { value: "ALL", label: "All" },
                      {
                        value: "true",
                        label: "Training",
                        icon: GraduationCap,
                        activeClass:
                          "bg-purple-500/15 text-purple-700 dark:text-purple-300 ring-1 ring-purple-500/40 font-semibold",
                      },
                      {
                        value: "false",
                        label: "Not Training",
                        icon: CircleSlash,
                        activeClass:
                          "bg-slate-500/15 text-slate-700 dark:text-slate-300 ring-1 ring-slate-500/40 font-semibold",
                      },
                    ]}
                  />
                </div>

                {/* PAE Analytics Switch (PAE Expert role only) */}
                {draftRole === "pae_expert" && (
                  <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="h-4 w-4" />
                      </div>
                      <div>
                        <Label
                          htmlFor="pae-analytics-switch"
                          className="text-xs font-semibold text-foreground cursor-pointer block"
                        >
                          Include PAE Analytics Sheet
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          Appends a detailed per-PAE metrics worksheet to the exported Excel report.
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="pae-analytics-switch"
                      checked={!!getAnalytics}
                      onCheckedChange={(v) => setGetAnalytics?.(v === true)}
                    />
                  </div>
                )}
              </>
            )}

            {/* Active Filters Summary */}
            {draftActiveCount > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>
                    {draftActiveCount} filter{draftActiveCount > 1 ? "s" : ""} configured
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset all
                </button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 pt-3 border-t border-border/50 bg-card/40 flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <Button variant="outline" size="sm" onClick={handleReset}>
            Reset
          </Button>
          {isAdmin && onExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={isExporting}
              className="gap-1.5"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {isExporting ? "Exporting..." : "Download"}
            </Button>
          )}
          <Button size="sm" onClick={handleApply} className="gap-1.5">
            <Check className="w-3.5 h-3.5" />
            Apply Filters {draftActiveCount > 0 && `(${draftActiveCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
