import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { EditFarmerModal } from "@/features/chatbotDashboard/components/EditFarmerModal";
import { useUpdateUser } from "@/features/chatbotDashboard/hooks/useUpdateUser";
import { useEditUser } from "@/hooks/api/user/useEditUser";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import {
  useUserDetails,
  useUserProfile,
  type UserDetail,
} from "@/features/chatbotDashboard/hooks/useUserDetails";
import { isCoordinatorRole } from "@/lib/roles";
import { useToast } from "@/shared/components/toast";
import { useAuthStore } from "@/stores/auth-store";
import type { IUser } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Edit3,
  Home,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Network,
  Phone,
  Save,
  ShieldCheck,
  UserCheck2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/coordinator/profile")({
  component: CoordinatorProfilePage,
});

type CoordinatorDashboardProfile = {
  userId?: string;
  name?: string;
  email?: string;
  userRole?: string;
  createdAt?: string;
  isVerified?: boolean;
  farmerProfile?: {
    state?: string;
    district?: string;
    blockName?: string;
    villageName?: string;
    phoneNo?: string;
    farmerName?: string;
    age?: number;
    gender?: string;
    languagePreference?: string;
    yearsOfExperience?: number;
    landhold?: number;
    cropsCultivated?: string[];
    primaryCrop?: string;
    secondaryCrop?: string;
    nearestKVK?: string;
    awarenessOfKCC?: boolean;
    usesAgriApps?: boolean;
    highestEducatedPerson?: string;
    numberOfSmartphones?: number;
    platform?: string;
  };
  assigned?: { _id: string; name?: string; userRole?: string }[];
  unAssigned?: { _id: string; name?: string; userRole?: string }[];
  parentCoordinator?: {
    name?: string;
    email?: string;
    userRole?: string;
    farmerProfile?: {
      state?: string;
      district?: string;
      blockName?: string;
      villageName?: string;
      phoneNo?: string;
    };
  } | null;
};

type AccountForm = {
  firstName: string;
  lastName: string;
  mobile: string;
  university: string;
};

const EDUCATION_LEVEL_OPTIONS = [
  "Under Graduate",
  "Graduate",
  "Post Graduate",
];

const ROLE_DETAILS: Record<
  string,
  { label: string; manages: string; scope: string; parent: string }
> = {
  district_coordinator: {
    label: "District Coordinator",
    manages: "Block Coordinators",
    scope: "District",
    parent: "No parent coordinator assigned",
  },
  block_coordinator: {
    label: "Block Coordinator",
    manages: "Village Volunteers",
    scope: "District and block",
    parent: "Assigned District Coordinator",
  },
  village_volunteer: {
    label: "Village Volunteer",
    manages: "Farmers",
    scope: "District, block, and village",
    parent: "Assigned Block Coordinator",
  },
};

function CoordinatorProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { success: toastSuccess } = useToast();
  const { data: currentUser, isLoading: currentUserLoading } =
    useGetCurrentUser({
      enabled: !!user,
    });
  const updateUserMutation = useEditUser();
  const updateFarmerProfileMutation = useUpdateUser();
  const {
    data: dashboardProfile,
    isLoading: dashboardProfileLoading,
  } = useUserProfile(
    currentUser?.email ?? "",
    Boolean(currentUser?.email && isCoordinatorRole(currentUser?.role)),
  );
  const {
    data: listingProfileData,
    isLoading: listingProfileLoading,
  } = useUserDetails(
    undefined,
    undefined,
    1,
    10,
    currentUser?.email ?? "",
    "annam",
    "",
    [],
    [],
    "",
    "",
    "",
    "",
    "all",
    false,
    false,
    "all",
    [],
    "name",
    "asc",
    false,
    "",
    "all",
    Boolean(currentUser?.email && isCoordinatorRole(currentUser?.role)),
  );
  const profile = dashboardProfile as CoordinatorDashboardProfile | undefined;
  const listingProfile = useMemo<UserDetail | null>(() => {
    const users = listingProfileData?.users ?? [];
    const profileUserId = profile?.userId ? String(profile.userId) : "";
    const email = currentUser?.email?.toLowerCase() ?? "";

    return (
      users.find((item) => profileUserId && item.userId === profileUserId) ??
      users.find((item) => item.email?.toLowerCase() === email) ??
      users[0] ??
      null
    );
  }, [currentUser?.email, listingProfileData?.users, profile?.userId]);
  const editModalUser = useMemo<UserDetail | null>(() => {
    const sourceUser =
      profile?.userId
        ? {
            userId: String(profile.userId),
            name: profile.name ?? "",
            email: profile.email ?? "",
            userRole: profile.userRole,
            totalQuestions: 0,
            createdAt: profile.createdAt,
            isVerified: profile.isVerified,
            farmerProfile: profile.farmerProfile,
          }
        : listingProfile;

    if (!sourceUser) return null;

    return {
      ...sourceUser,
      farmerProfile: prepareFarmerProfileForEdit(sourceUser.farmerProfile),
    };
  }, [listingProfile, profile]);
  const roleDetails = ROLE_DETAILS[currentUser?.role ?? ""] ?? {
    label: "Coordinator",
    manages: "Assigned users",
    scope: "Assigned region",
    parent: "Parent Coordinator",
  };
  const [formData, setFormData] = useState<AccountForm>({
    firstName: "",
    lastName: "",
    mobile: "",
    university: "",
  });
  const [isFarmerProfileOpen, setIsFarmerProfileOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }

    if (currentUser && !isCoordinatorRole(currentUser.role)) {
      navigate({ to: "/profile" });
    }
  }, [currentUser, navigate, user]);

  useEffect(() => {
    if (!currentUser) return;

    setFormData({
      firstName: currentUser.firstName ?? "",
      lastName: currentUser.lastName ?? "",
      mobile: currentUser.mobile ?? "",
      university: currentUser.university ?? "",
    });
  }, [currentUser]);

  const region = useMemo(() => {
    const farmerProfile = profile?.farmerProfile;
    return [
      farmerProfile?.state,
      farmerProfile?.district,
      farmerProfile?.blockName,
      farmerProfile?.villageName,
    ].filter(Boolean);
  }, [profile?.farmerProfile]);

  const parentRegion = [
    profile?.parentCoordinator?.farmerProfile?.state,
    profile?.parentCoordinator?.farmerProfile?.district,
    profile?.parentCoordinator?.farmerProfile?.blockName,
    profile?.parentCoordinator?.farmerProfile?.villageName,
  ].filter(Boolean);

  const assignedCount = profile?.assigned?.length ?? 0;
  const availableCount = profile?.unAssigned?.length ?? 0;
  const dashboardUserId = profile?.userId
    ? String(profile.userId)
    : listingProfile?.userId;
  const isLoading =
    currentUserLoading || dashboardProfileLoading || listingProfileLoading;
  const accountStatus = currentUser?.isBlocked
    ? "Blocked"
    : currentUser?.status === "in-active"
      ? "Inactive"
      : "Active";
  const verificationStatus = currentUser?.isVerified ? "Verified" : "Unverified";
  const registrationDate = formatDate(currentUser?.createdAt);

  const handleInputChange = (field: keyof AccountForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser) return;

    const trimmedFirstName = formData.firstName.trim();
    const trimmedLastName = formData.lastName.trim();
    const trimmedMobile = formData.mobile.trim();
    const trimmedOrganization = formData.university.trim();
    const syncPhoneNo = normalizeFarmerPhoneNo(trimmedMobile);
    const fullName = [trimmedFirstName, trimmedLastName]
      .filter(Boolean)
      .join(" ");

    const payload: Partial<IUser> = {
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
    };

    if (trimmedMobile) {
      payload.mobile = trimmedMobile;
    }

    if (trimmedOrganization) {
      payload.university = trimmedOrganization;
    }

    await updateUserMutation.mutateAsync(payload);
    if (profile?.userId) {
      await syncLinkedFarmerProfile(String(profile.userId), {
        name: fullName || undefined,
        farmerProfile: {
          farmerName: fullName || undefined,
          phoneNo: syncPhoneNo,
        },
      });
    }
    await queryClient.invalidateQueries({ queryKey: ["user"] });
    await queryClient.invalidateQueries({
      queryKey: ["user-profile", currentUser.email],
    });
    toastSuccess("Coordinator profile updated");
  };

  const handleSaveFarmerProfile = async (payload: {
    name?: string;
    userRole?: string;
    farmerProfile?: CoordinatorDashboardProfile["farmerProfile"] & Record<string, any>;
  }) => {
    if (!profile?.userId) return;

    await updateFarmerProfileMutation.mutateAsync({
      userId: String(profile.userId),
      source: "annam",
      data: {
        name: payload.name,
        farmerProfile: payload.farmerProfile,
      },
    });
    const farmerName = payload.farmerProfile?.farmerName?.trim();
    const phoneNo = payload.farmerProfile?.phoneNo?.trim();
    const [firstName, ...lastNameParts] = farmerName
      ? farmerName.split(/\s+/)
      : [];

    if (farmerName || phoneNo) {
      await updateUserMutation.mutateAsync({
        ...(farmerName
          ? {
              firstName,
              lastName: lastNameParts.join(" "),
            }
          : {}),
        ...(phoneNo ? { mobile: phoneNo } : {}),
      });
    }
    await queryClient.invalidateQueries({
      queryKey: ["user-profile", currentUser?.email],
    });
    await queryClient.invalidateQueries({ queryKey: ["user"] });
    setIsFarmerProfileOpen(false);
  };

  if (!user || isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </main>
    );
  }

  if (!currentUser || !isCoordinatorRole(currentUser.role)) return null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 sm:px-6">
        <Button variant="outline" size="sm" onClick={() =>
            dashboardUserId
              ? navigate({
                  to: "/user/$userId",
                  params: { userId: dashboardUserId },
                })
              : navigate({ to: "/coordinator" })
          }
        >
          <Home className="mr-2 h-4 w-4" />
          Dashboard
        </Button>
        <h1 className="text-base font-semibold">Coordinator Profile</h1>
        <div className="flex items-center gap-2">
          <ThemeToggleCompact />
          <UserProfileActions />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
        <section className="rounded-md border bg-card/80 p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-[#2a4a3c] bg-[#0f2a21]">
                <ShieldCheck className="h-7 w-7 text-[#009d68]" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {currentUser.firstName} {currentUser.lastName ?? ""}
                  </h2>
                  <Badge className="gap-1 rounded-full border-[#c7c3ff] bg-[#ecebff] text-[#3f3a8a] hover:bg-[#ecebff]">
                    <ShieldCheck className="h-3 w-3" />
                    {roleDetails.label}
                  </Badge>
                  {profile?.isVerified && (
                    <Badge className="gap-1 rounded-full border-[#b9ef8d] bg-[#ecffd8] text-[#245c16] hover:bg-[#ecffd8]">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-4 w-4" />
                    {currentUser.email}
                  </span>
                  {(currentUser.mobile || profile?.farmerProfile?.phoneNo) && (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-4 w-4" />
                      {currentUser.mobile || profile?.farmerProfile?.phoneNo}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricTile
                icon={<Users className="h-5 w-5" />}
                tone="assigned"
                label="Assigned"
                value={assignedCount}
              />
              <MetricTile
                icon={<UserCheck2 className="h-5 w-5" />}
                tone="available"
                label="Available"
                value={availableCount}
              />
              <MetricTile
                icon={<Network className="h-5 w-5" />}
                tone="manages"
                label="Manages"
                value={roleDetails.manages}
              />
            </div>
          </div>
        </section>

        <ProfileSection title="Account Details" icon={UserCheck2}>
            <InfoRow
              label="Full Name"
              value={`${currentUser.firstName} ${currentUser.lastName ?? ""}`.trim()}
            />
            <InfoRow label="Mobile Number" value={currentUser.mobile} />
            <InfoRow label="Email Address" value={currentUser.email} />
            <InfoRow label="Coordinator Role" value={roleDetails.label} />
            <InfoRow label="Account Status" value={accountStatus} />
            <InfoRow label="Verification Status" value={verificationStatus} />
            <InfoRow label="Registration Date" value={registrationDate} />
            <InfoRow
              label="Primary Source"
              value="Review-system user account"
            />
        </ProfileSection>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-md border bg-card/80 p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Account Management</h2>
                <p className="text-sm text-muted-foreground">
                  Keep your coordinator contact details current.
                </p>
              </div>
              <KeyRound className="h-5 w-5 text-muted-foreground" />
            </div>

            <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
              <Field
                id="firstName"
                label="First Name"
                value={formData.firstName}
                onChange={(value) => handleInputChange("firstName", value)}
                required
              />
              <Field
                id="lastName"
                label="Last Name"
                value={formData.lastName}
                onChange={(value) => handleInputChange("lastName", value)}
              />
              <Field
                id="mobile"
                label="Mobile"
                value={formData.mobile}
                onChange={(value) => handleInputChange("mobile", value)}
              />
              <Field
                id="university"
                label="Organization"
                value={formData.university}
                onChange={(value) => handleInputChange("university", value)}
              />
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.history.back()}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button type="submit" disabled={updateUserMutation.isPending}>
                  {updateUserMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </form>
          </section>

          <ProfileSection title="Assigned Region" icon={MapPin}>
            <InfoRow label="Scope" value={roleDetails.scope} />
            <InfoRow label="State" value={profile?.farmerProfile?.state} />
            <InfoRow label="District" value={profile?.farmerProfile?.district} />
            <InfoRow label="Block" value={profile?.farmerProfile?.blockName} />
            <InfoRow label="Village" value={profile?.farmerProfile?.villageName} />
            <InfoRow label="Region" value={region.join(", ") || "Not assigned"} />
            <InfoRow
              label="Dashboard Profile"
              value={profile?.name || currentUser.firstName}
            />
          </ProfileSection>
        </div>

        <section className="rounded-md border bg-card/80 p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="text-base font-semibold uppercase text-muted-foreground">
                  Farmer Profile Information
                </h2>
                <p className="text-sm text-muted-foreground">
                  View and update the linked Annam farmer profile for this coordinator.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFarmerProfileOpen(true)}
              disabled={!profile?.userId}
            >
              <Edit3 className="mr-2 h-4 w-4" />
              Edit Farmer Profile
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoRow label="Farmer Name" value={profile?.farmerProfile?.farmerName} />
            <InfoRow label="Contact Number" value={profile?.farmerProfile?.phoneNo} />
            <InfoRow label="Language" value={profile?.farmerProfile?.languagePreference} />
            <InfoRow label="Gender" value={profile?.farmerProfile?.gender} />
            <InfoRow label="Age" value={toDisplay(profile?.farmerProfile?.age)} />
            <InfoRow label="Location" value={region.join(", ")} />
            <InfoRow label="Primary Crop" value={profile?.farmerProfile?.primaryCrop} />
            <InfoRow label="Secondary Crop" value={profile?.farmerProfile?.secondaryCrop} />
            <InfoRow
              label="Crops Cultivated"
              value={profile?.farmerProfile?.cropsCultivated?.join(", ")}
            />
            <InfoRow
              label="Experience"
              value={
                profile?.farmerProfile?.yearsOfExperience != null
                  ? `${profile.farmerProfile.yearsOfExperience} years`
                  : undefined
              }
            />
            <InfoRow
              label="Landhold"
              value={toDisplay(profile?.farmerProfile?.landhold)}
            />
            <InfoRow label="Nearest KVK" value={profile?.farmerProfile?.nearestKVK} />
            <InfoRow
              label="Awareness of KCC"
              value={formatBoolean(profile?.farmerProfile?.awarenessOfKCC)}
            />
            <InfoRow
              label="Uses Agri Apps"
              value={formatBoolean(profile?.farmerProfile?.usesAgriApps)}
            />
            <InfoRow
              label="Highest Educated Person"
              value={profile?.farmerProfile?.highestEducatedPerson}
            />
            <InfoRow
              label="Smartphones"
              value={toDisplay(profile?.farmerProfile?.numberOfSmartphones)}
            />
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <ProfileSection title="Hierarchy Information" icon={Network}>
            {profile?.parentCoordinator ? (
              <>
                <InfoRow label="Relationship" value={roleDetails.parent} />
                <InfoRow
                  label="Name"
                  value={profile.parentCoordinator.name || "Not Provided"}
                />
                <InfoRow
                  label="Role"
                  value={formatRoleLabel(profile.parentCoordinator.userRole)}
                />
                <InfoRow
                  label="Contact"
                  value={[
                    profile.parentCoordinator.email,
                    profile.parentCoordinator.farmerProfile?.phoneNo,
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                />
                <InfoRow
                  label="Region"
                  value={parentRegion.join(", ") || "Not assigned"}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {roleDetails.parent}
              </p>
            )}
          </ProfileSection>

          <section className="rounded-md border bg-card/80 p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-base font-semibold uppercase text-muted-foreground">
                Coordinator Workflow
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <WorkflowItem
                icon={<UserCheck2 className="h-4 w-4" />}
                label="Manage Assignments"
                value={`${assignedCount} assigned ${roleDetails.manages.toLowerCase()}`}
              />
              <WorkflowItem
                icon={<Network className="h-4 w-4" />}
                label="Available Pool"
                value={`${availableCount} users in scope`}
              />
              <WorkflowItem
                icon={<Mail className="h-4 w-4" />}
                label="Messages"
                value="Use dashboard notifications for assigned users"
              />
              <WorkflowItem
                icon={<MapPin className="h-4 w-4" />}
                label="Region Guard"
                value={roleDetails.scope}
              />
            </div>
          </section>
        </div>
      </div>

      <EditFarmerModal
        open={isFarmerProfileOpen}
        onOpenChange={setIsFarmerProfileOpen}
        user={editModalUser}
        isSaving={updateFarmerProfileMutation.isPending}
        onSave={handleSaveFarmerProfile}
      />
    </main>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border-border/70 bg-background/70"
      />
    </div>
  );
}

function ProfileSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border bg-card/80 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-base font-semibold uppercase text-muted-foreground">
          {title}
        </h2>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {children}
      </div>
    </section>
  );
}

function MetricTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "assigned" | "available" | "manages";
}) {
  const toneClass =
    tone === "assigned"
      ? "text-[#7b6de6]"
      : tone === "available"
        ? "text-[#19a77c]"
        : "text-[#f26a2e]";

  return (
    <div className="flex min-h-[92px] min-w-[150px] flex-col items-center justify-center rounded-md bg-background/80 px-4 py-3 text-center">
      <div className={toneClass}>{icon}</div>
      <p
        className={`mt-2 max-w-[10rem] font-semibold leading-tight ${
          typeof value === "number" ? "text-2xl" : "text-lg"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm font-semibold text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  const hasValue = value !== undefined && value !== null && value !== "";

  return (
    <div className="min-h-[78px] rounded-md border border-border/70 bg-background/70 p-3.5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-semibold leading-snug">
        {hasValue ? value : <span className="text-muted-foreground">Not Provided</span>}
      </p>
    </div>
  );
}

function WorkflowItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-background/70 p-3.5 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="text-[#5b50c8]">{icon}</span>
        {label}
      </div>
      <p className="text-sm text-muted-foreground">{value}</p>
    </div>
  );
}

function formatRoleLabel(role?: string) {
  return role
    ? role
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "Not Provided";
}

function prepareFarmerProfileForEdit(
  farmerProfile?: UserDetail["farmerProfile"],
): UserDetail["farmerProfile"] {
  if (!farmerProfile) return farmerProfile;

  const cropsCultivated = toStringList(farmerProfile.cropsCultivated).map(toTitle);

  return {
    ...farmerProfile,
    state: toTitle(farmerProfile.state),
    district: toTitle(farmerProfile.district),
    blockName: toTitle(farmerProfile.blockName),
    villageName: toTitle(farmerProfile.villageName),
    cropsCultivated,
    primaryCrop: toTitle(farmerProfile.primaryCrop || cropsCultivated[0]),
    secondaryCrop: toTitle(farmerProfile.secondaryCrop || cropsCultivated[1]),
    highestEducatedPerson: matchEducation(farmerProfile.highestEducatedPerson),
  };
}

function toStringList(value?: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return typeof value === "string" ? value.split(",") : [];
}

function toTitle(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  return trimmed
    .split(/\s+/)
    .map((word) =>
      word.length <= 3 && word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

function matchEducation(value?: string | null) {
  const normalizedValue = value?.trim().toLowerCase();
  if (!normalizedValue) return "";

  return (
    EDUCATION_LEVEL_OPTIONS.find(
      (option) => option.toLowerCase() === normalizedValue,
    ) || value?.trim() || ""
  );
}

function formatDate(value?: string | Date) {
  if (!value) return "Not Provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not Provided";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toDisplay(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function formatBoolean(value?: boolean) {
  if (value === undefined) return undefined;
  return value ? "Yes" : "No";
}

async function syncLinkedFarmerProfile(
  userId: string,
  data: {
    name?: string;
    farmerProfile?: {
      farmerName?: string;
      phoneNo?: string;
    };
  },
) {
  await apiFetch(`${env.apiBaseUrl()}/analytics/users/${userId}?source=annam`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

function normalizeFarmerPhoneNo(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  return digits.slice(-10);
}
