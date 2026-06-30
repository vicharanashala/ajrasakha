import type { ReactNode } from "react";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { FarmerNameLink } from "./FarmerNameLink";
import type { UserDetail } from "../hooks/useUserDetails";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Mail,
  MapPin,
  MessageSquareText,
  Network,
  Phone,
  ShieldX,
  UserCheck2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

export type AssignableUser = {
  _id: string;
  name: string;
  email?: string;
  userRole?: string;
};

export type ParentCoordinator = AssignableUser & {
  farmerProfile?: {
    phoneNo?: string;
    state?: string;
    district?: string;
    blockName?: string;
    villageName?: string;
  };
};

export function CoordinatorDashboardSummary({
  user,
  assignedCount,
  availableCount,
  isReadOnly,
}: {
  user: UserDetail;
  assignedCount: number;
  availableCount: number;
  isReadOnly: boolean;
}) {
  const roleLabel = formatRoleLabel(user.userRole);
  const region = [
    user.farmerProfile?.state,
    user.farmerProfile?.district,
    user.farmerProfile?.blockName,
    user.farmerProfile?.villageName,
  ].filter(Boolean);
  const manages =
    user.userRole === "district_coordinator"
      ? "Block"
      : user.userRole === "block_coordinator"
        ? "Village"
        : user.userRole === "village_volunteer"
          ? "Farmers"
          : "Users";

  return (
    <section className="rounded-md border bg-card/80 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 rounded-full border-[#c7c3ff] bg-[#ecebff] px-3 py-1 text-xs font-semibold text-[#3f3a8a]"
            >
              <ShieldX className="h-3.5 w-3.5" />
              {roleLabel || "Coordinator"}
            </Badge>
            {user.isVerified ? (
              <Badge className="gap-1.5 rounded-full border border-[#b9ef8d] bg-[#ecffd8] px-3 py-1 text-xs font-semibold text-[#245c16] hover:bg-[#ecffd8]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verified
              </Badge>
            ) : (
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-semibold">
                Unverified
              </Badge>
            )}
            {isReadOnly ? <Badge variant="secondary">Read-only view</Badge> : null}
          </div>
          <h4 className="text-1rm xl font-semibold tracking-tight sm:text-2xl">
            {user.name || "Coordinator"}
          </h4>
          <div className="mt-4 grid gap-2 text-sm font-medium text-muted-foreground sm:text-base">
            {user.email ? (
              <span className="inline-flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {user.email}
              </span>
            ) : null}
            {user.farmerProfile?.phoneNo ? (
              <span className="inline-flex items-center gap-2">
                <Phone className="h-4 w-4" />
                {user.farmerProfile.phoneNo}
              </span>
            ) : null}
            {region.length > 0 ? (
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {region.join(" - ")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-[520px]">
          <CoordinatorStatCard
            tone="primary"
            label="Assigned"
            value={assignedCount}
            icon={<Users className="h-5 w-5" />}
          />
          <CoordinatorStatCard
            tone="success"
            label="Available"
            value={availableCount}
            icon={<UserPlus className="h-5 w-5" />}
          />
          <CoordinatorStatCard
            tone="warning"
            label="Manages"
            value={manages}
            icon={<Network className="h-5 w-5" />}
          />
        </div>
      </div>
    </section>
  );
}

function CoordinatorStatCard({
  label,
  value,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: "primary" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-[#20a986]"
      : tone === "warning"
        ? "text-[#f26a2e]"
        : "text-[#8174e8]";

  return (
    <div className="flex min-h-28 flex-col items-center justify-center rounded-md bg-background/80 p-4 text-center shadow-sm">
      <div className={`mb-3 ${toneClass}`}>
        {icon}
      </div>
      <p className="text-2xl font-semibold leading-none">{value}</p>
      <p className="mt-2 text-sm font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

export function CoordinatorUserManagement({
  availableUsers,
  assignedUsers,
  availableOpen,
  assignedOpen,
  selectedUsers,
  selectedAssignedUsers,
  allSelected,
  allAssignedSelected,
  assigning,
  isSending,
  onToggleAvailableOpen,
  onToggleAssignedOpen,
  onToggleUser,
  onToggleAssignedUser,
  onToggleAll,
  onToggleAllAssigned,
  onAssignSelected,
  onAssignUser,
  onMessageSelected,
  onUnassignSelected,
  onMessageUser,
  onUnassignUser,
}: {
  availableUsers: AssignableUser[];
  assignedUsers: AssignableUser[];
  availableOpen: boolean;
  assignedOpen: boolean;
  selectedUsers: string[];
  selectedAssignedUsers: string[];
  allSelected: boolean;
  allAssignedSelected: boolean;
  assigning: boolean;
  isSending: boolean;
  onToggleAvailableOpen: () => void;
  onToggleAssignedOpen: () => void;
  onToggleUser: (userId: string) => void;
  onToggleAssignedUser: (userId: string) => void;
  onToggleAll: () => void;
  onToggleAllAssigned: () => void;
  onAssignSelected: () => void;
  onAssignUser: (targetUserId: string) => void;
  onMessageSelected: () => void;
  onUnassignSelected: () => void;
  onMessageUser: (targetUser: AssignableUser) => void;
  onUnassignUser: (targetUserId: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Manage users</h2>
          <p className="text-xs font-medium text-muted-foreground sm:text-sm">
            Assign and message users in this coordinator hierarchy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className="gap-1.5 rounded-full border-[#c7c3ff] bg-[#ecebff] px-3 py-1 text-xs font-semibold text-[#3f3a8a] sm:text-sm"
          >
            <Users className="h-3.5 w-3.5" />
            {assignedUsers.length} assigned
          </Badge>
          <Badge
            variant="outline"
            className="gap-1.5 rounded-full border-[#a8efd7] bg-[#ddfff4] px-3 py-1 text-xs font-semibold text-[#0f6b5b] sm:text-sm"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {availableUsers.length} available
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <CoordinatorUserPanel
          title="Available users"
          countLabel={`${availableUsers.length} unassigned`}
          open={availableOpen}
          selectedCount={selectedUsers.length}
          allSelected={allSelected}
          primaryActionLabel="Assign selected"
          primaryActionIcon={<Check className="h-4 w-4" />}
          primaryActionDisabled={selectedUsers.length === 0 || assigning}
          toggleAllLabel={allSelected ? "Clear all" : "Select all"}
          onToggleOpen={onToggleAvailableOpen}
          onToggleAll={onToggleAll}
          onPrimaryAction={onAssignSelected}
        >
          {availableUsers.length === 0 ? (
            <CoordinatorEmptyState text="No users available for assignment." />
          ) : (
            availableUsers.map((user) => (
              <CoordinatorUserRow
                key={user._id}
                user={user}
                selected={selectedUsers.includes(user._id)}
                onToggle={() => onToggleUser(user._id)}
                name={
                  <FarmerNameLink userId={user._id} className="font-semibold">
                    {user.name}
                  </FarmerNameLink>
                }
                actions={
                  <Button
                    variant="outline"
                    className="h-9 min-w-24 rounded-md text-sm"
                    onClick={() => onAssignUser(user._id)}
                    disabled={assigning}
                  >
                    Assign
                  </Button>
                }
              />
            ))
          )}
        </CoordinatorUserPanel>

        <CoordinatorUserPanel
          title="Assigned users"
          countLabel={`${assignedUsers.length} active`}
          open={assignedOpen}
          selectedCount={selectedAssignedUsers.length}
          allSelected={allAssignedSelected}
          primaryActionLabel="Unassign selected"
          primaryActionIcon={<UserMinus className="h-4 w-4" />}
          primaryActionDisabled={selectedAssignedUsers.length === 0 || assigning}
          secondaryActionLabel="Message selected"
          secondaryActionIcon={<MessageSquareText className="h-4 w-4" />}
          secondaryActionDisabled={selectedAssignedUsers.length === 0 || isSending}
          toggleAllLabel={allAssignedSelected ? "Clear all" : "Select all"}
          onToggleOpen={onToggleAssignedOpen}
          onToggleAll={onToggleAllAssigned}
          onPrimaryAction={onUnassignSelected}
          onSecondaryAction={onMessageSelected}
        >
          {assignedUsers.length === 0 ? (
            <CoordinatorEmptyState text="No users assigned yet." />
          ) : (
            assignedUsers.map((user) => (
              <CoordinatorUserRow
                key={user._id}
                user={user}
                selected={selectedAssignedUsers.includes(user._id)}
                onToggle={() => onToggleAssignedUser(user._id)}
                name={<span className="font-semibold">{user.name}</span>}
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-11 rounded-md"
                      onClick={() => onMessageUser(user)}
                      title="Send notification"
                      aria-label={`Send notification to ${user.name}`}
                      disabled={isSending}
                    >
                      <MessageSquareText className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 min-w-24 rounded-md border-red-400/80 bg-red-500/10 text-sm text-red-500 hover:border-red-400 hover:bg-red-500/20 hover:text-red-400 dark:border-red-400/70 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25 dark:hover:text-red-200"
                      onClick={() => onUnassignUser(user._id)}
                      disabled={assigning}
                    >
                      Remove
                    </Button>
                  </>
                }
              />
            ))
          )}
        </CoordinatorUserPanel>
      </div>
    </section>
  );
}

function CoordinatorUserPanel({
  title,
  countLabel,
  open,
  selectedCount,
  allSelected,
  primaryActionLabel,
  primaryActionIcon,
  primaryActionDisabled,
  secondaryActionLabel,
  secondaryActionIcon,
  secondaryActionDisabled,
  toggleAllLabel,
  children,
  onToggleOpen,
  onToggleAll,
  onPrimaryAction,
  onSecondaryAction,
}: {
  title: string;
  countLabel: string;
  open: boolean;
  selectedCount: number;
  allSelected: boolean;
  primaryActionLabel: string;
  primaryActionIcon: ReactNode;
  primaryActionDisabled: boolean;
  secondaryActionLabel?: string;
  secondaryActionIcon?: ReactNode;
  secondaryActionDisabled?: boolean;
  toggleAllLabel: string;
  children: ReactNode;
  onToggleOpen: () => void;
  onToggleAll: () => void;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border bg-card/80 shadow-sm">
      <div className="border-b p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="flex min-w-0 items-center gap-3 text-left"
            onClick={onToggleOpen}
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
            <span>
              <span className="block text-lg font-semibold">{title}</span>
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {countLabel}
              </span>
            </span>
          </button>
          <div className="flex flex-wrap gap-2">
            {secondaryActionLabel && onSecondaryAction ? (
              <Button
                variant="outline"
                className="h-9 gap-2 rounded-md text-sm"
                disabled={secondaryActionDisabled}
                onClick={onSecondaryAction}
              >
                {secondaryActionIcon}
                {secondaryActionLabel}
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-9 gap-2 rounded-md text-sm"
              disabled={primaryActionDisabled}
              onClick={onPrimaryAction}
            >
              {primaryActionIcon}
              {primaryActionLabel}
            </Button>
          </div>
        </div>
      </div>

      {open && (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2.5 sm:px-4">
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium"
              onClick={onToggleAll}
            >
              <CoordinatorCheckbox checked={allSelected} />
              {toggleAllLabel}
            </button>
            <span className="text-sm font-medium text-muted-foreground">
              {selectedCount} selected
            </span>
          </div>
          <div className="divide-y">{children}</div>
        </>
      )}
    </div>
  );
}

function CoordinatorUserRow({
  user,
  selected,
  name,
  actions,
  onToggle,
}: {
  user: AssignableUser;
  selected: boolean;
  name: ReactNode;
  actions: ReactNode;
  onToggle: () => void;
}) {
  return (
    <div className="grid gap-3 px-3 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-4">
      <button type="button" className="justify-self-start" onClick={onToggle}>
        <CoordinatorCheckbox checked={selected} />
      </button>
      <div className="flex min-w-0 items-center gap-3">
        <CoordinatorAvatar name={user.name} />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold leading-tight">{name}</div>
          {user.userRole ? (
            <div className="mt-1">
              <CoordinatorRoleBadge role={user.userRole} />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>
    </div>
  );
}

function CoordinatorCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background"
      }`}
      aria-hidden="true"
    >
      {checked ? <Check className="h-3.5 w-3.5" /> : null}
    </span>
  );
}

function CoordinatorAvatar({ name }: { name?: string }) {
  const initials = getInitials(name);
  const tone = getAvatarTone(name);

  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${tone}`}
    >
      {initials}
    </span>
  );
}

function CoordinatorRoleBadge({ role }: { role: string }) {
  const normalized = role.toLowerCase();
  const isVillage = normalized.includes("village");
  const classes = isVillage
    ? "border-[#a8efd7] bg-[#ddfff4] text-[#0f6b5b]"
    : "border-[#ffca65] bg-[#fff5df] text-[#6f3d05]";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${classes}`}
    >
      {formatRoleLabel(role)}
    </span>
  );
}

function CoordinatorEmptyState({ text }: { text: string }) {
  return (
    <div className="px-5 py-10 text-center text-sm font-medium text-muted-foreground">
      {text}
    </div>
  );
}

function getInitials(name?: string) {
  const parts = String(name || "User")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return (parts[0]?.[0] || "U") + (parts[1]?.[0] || "");
}

function getAvatarTone(name?: string) {
  const tones = [
    "bg-[#ecebff] text-[#3f3a8a]",
    "bg-[#ddfff4] text-[#0f6b5b]",
    "bg-[#fff5df] text-[#6f3d05]",
    "bg-rose-100 text-rose-800",
  ];
  const index = String(name || "").length % tones.length;

  return tones[index];
}

export function ParentCoordinatorSection({
  coordinatorRole,
  parentCoordinator,
}: {
  coordinatorRole?: string;
  parentCoordinator: ParentCoordinator;
}) {
  const roleLabel = formatRoleLabel(parentCoordinator.userRole);
  const heading =
    coordinatorRole === "block_coordinator"
      ? "Assigned District Coordinator"
      : coordinatorRole === "village_volunteer"
        ? "Assigned Block Coordinator"
        : "Parent Coordinator";
  const regionItems = [
    parentCoordinator.farmerProfile?.state,
    parentCoordinator.farmerProfile?.district,
    parentCoordinator.farmerProfile?.blockName,
    parentCoordinator.farmerProfile?.villageName,
  ].filter(Boolean);
  const contactItems = [
    parentCoordinator.email,
    parentCoordinator.farmerProfile?.phoneNo,
  ].filter(Boolean);

  return (
    <section className="rounded-md border border-[#c7c3ff] bg-card/80 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-[#ecebff]">
            <UserCheck2 className="h-6 w-6 text-[#5b50c8]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {heading}
            </p>
            <p className="truncate text-2xl font-semibold">
              {parentCoordinator.name || "Not Provided"}
            </p>
            {roleLabel && (
              <p className="text-base font-medium text-muted-foreground">
                {roleLabel}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-5 text-sm sm:grid-cols-2 md:min-w-[520px]">
          {contactItems.length > 0 && (
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Contact
              </p>
              <p className="mt-2 break-words text-lg font-semibold">
                {contactItems.join(" / ")}
              </p>
            </div>
          )}
          {regionItems.length > 0 && (
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Region
              </p>
              <p className="mt-2 break-words text-lg font-semibold">
                {regionItems.join(" - ")}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatRoleLabel(role?: string) {
  return role
    ? role
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "";
}
