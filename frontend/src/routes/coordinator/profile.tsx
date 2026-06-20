import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { useEditUser } from "@/hooks/api/user/useEditUser";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useUserProfile } from "@/features/chatbotDashboard/hooks/useUserDetails";
import { isCoordinatorRole } from "@/lib/roles";
import { useToast } from "@/shared/components/toast";
import { useAuthStore } from "@/stores/auth-store";
import type { IUser } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
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
  const {
    data: dashboardProfile,
    isLoading: dashboardProfileLoading,
  } = useUserProfile(
    currentUser?.email ?? "",
    Boolean(currentUser?.email && isCoordinatorRole(currentUser?.role)),
  );
  const profile = dashboardProfile as CoordinatorDashboardProfile | undefined;
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
  const isLoading = currentUserLoading || dashboardProfileLoading;

  const handleInputChange = (field: keyof AccountForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser) return;

    const payload: Partial<IUser> = {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
    };

    if (formData.mobile.trim()) {
      payload.mobile = formData.mobile.trim();
    }

    if (formData.university.trim()) {
      payload.university = formData.university.trim();
    }

    await updateUserMutation.mutateAsync(payload);
    await queryClient.invalidateQueries({ queryKey: ["user"] });
    toastSuccess("Coordinator profile updated");
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
      <header className="flex items-center justify-between border-b border-border px-6 py-2">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/coordinator" })}>
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
        <section className="rounded-md border bg-card p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-background">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold">
                    {currentUser.firstName} {currentUser.lastName ?? ""}
                  </h2>
                  <Badge variant="outline">{roleDetails.label}</Badge>
                  {profile?.isVerified && (
                    <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
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
              <MetricTile label="Assigned" value={assignedCount} />
              <MetricTile label="Available" value={availableCount} />
              <MetricTile label="Manages" value={roleDetails.manages} />
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-md border bg-card p-5">
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

          <section className="rounded-md border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Assigned Region</h2>
            </div>
            <InfoRow label="Scope" value={roleDetails.scope} />
            <InfoRow label="Region" value={region.join(", ") || "Not assigned"} />
            <InfoRow
              label="Dashboard Profile"
              value={profile?.name || currentUser.firstName}
            />
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-md border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Hierarchy</h2>
            </div>
            {profile?.parentCoordinator ? (
              <div className="space-y-3">
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
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {roleDetails.parent}
              </p>
            )}
          </section>

          <section className="rounded-md border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Coordinator Workflow</h2>
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
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 rounded-md border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm">{value || "Not Provided"}</p>
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
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {icon}
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
