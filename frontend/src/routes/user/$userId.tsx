import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useAuthStore } from "@/stores/auth-store";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  useUserProfile,
  type UserDetail,
} from "@/features/chatbotDashboard/hooks/useUserDetails";
import { FarmerDetailsContent } from "@/components/user/FarmerDetailsContent";
import {
  AlertCircle,
  Home,
  Loader2,
  MessageSquareText,
  Send,
  ShieldX,
  UserCheck2,
} from "lucide-react";
import { Button } from "@/components/atoms/button";
import Spinner from "@/components/atoms/spinner";
import { useVerifyUserAnalytics } from "@/hooks/api/user/useVerifyUserAnalytics";
import { useDeleteUser } from "@/features/chatbotDashboard/hooks/useDeleteUser";
import {
  useAssignUsers,
  useUnassignUsers,
  useUpdateUser,
} from "@/features/chatbotDashboard/hooks/useUpdateUser";
import { useChangeUserPassword } from "@/features/chatbotDashboard/hooks/useChangeUserPassword";
import { EditFarmerModal } from "@/features/chatbotDashboard/components/EditFarmerModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/atoms/alert-dialog";
import { Input } from "@/components/atoms/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isCoordinatorRole } from "@/lib/roles";
import { NotificationModal } from "@/components/NotificationModal";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import { useToast } from "@/shared/components/toast";
import { isEnglishCharacters } from "@/features/questions/utils/checkLanguage";
import { initializeNotifications } from "@/services/pushService";
import {
  CoordinatorDashboardSummary,
  CoordinatorUserManagement,
  ParentCoordinatorSection,
  type AssignableUser,
  type ParentCoordinator,
} from "@/features/chatbotDashboard/components/CoordinatorDashboardSections";
import {
  FarmerDashboardAnalytics,
  type FarmerDashboardData,
} from "@/features/chatbotDashboard/components/FarmerDashboardAnalytics";
import {
  CoordinatorNotificationDialog,
  UserNotificationHistorySheet,
} from "@/features/chatbotDashboard/components/CoordinatorNotificationComponents";

export const Route = createFileRoute("/user/$userId")({
  component: RouteComponent,
});

const isLikelyObjectId = (value?: string | null) =>
  Boolean(value && /^[a-f\d]{24}$/i.test(value));

function RouteComponent() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { data: currentUser } = useGetCurrentUser({
    enabled: !!user,
  });
  const { userId } = Route.useParams();
  const canFetchProfile = isLikelyObjectId(userId);

  const {
    data: userProfile,
    isLoading: userProfileLoading,
    error: userProfileError,
  } = useUserProfile(userId, canFetchProfile);

  useEffect(() => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (currentUser && currentUser?.role !== "admin") {
      if (isCoordinatorRole(currentUser?.role)) {
        if (userProfileLoading) return;

        const currentUserEmail = String(currentUser.email || user.email || "")
          .trim()
          .toLowerCase();
        const viewedUserEmail = String(userProfile?.email || "")
          .trim()
          .toLowerCase();

        if (currentUserEmail && currentUserEmail === viewedUserEmail) {
          return;
        }

        if (userProfile?.userId) return;
      }
      navigate({ to: "/home" });
      return;
    }
  }, [user, currentUser, navigate, userProfile, userProfileLoading]);

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role !== "admin" && !isCoordinatorRole(currentUser.role)) {
      return;
    }

    void initializeNotifications();
  }, [currentUser?._id, currentUser?.role]);

  const verifyUserMutation = useVerifyUserAnalytics();
  const deleteUserMutation = useDeleteUser();
  const updateUserMutation = useUpdateUser();
  const changeUserPasswordMutation = useChangeUserPassword();
  const [userToEdit, setUserToEdit] = useState<UserDetail | null>(null);
  const [userToDelete, setUserToDelete] = useState<{
    userId: string;
    source: string;
    email: string;
  } | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [verificationToConfirm, setVerificationToConfirm] = useState<{
    userId: string;
    source: string;
    name: string;
    email: string;
    isVerified: boolean;
  } | null>(null);
  const [notificationHistoryUser, setNotificationHistoryUser] =
    useState<UserDetail | null>(null);
  const [notificationTargetUsers, setNotificationTargetUsers] =
    useState<AssignableUser[]>([]);

  const sendNotificationMutation = useMutation({
    mutationFn: async (payload: {
      userIds: string[];
      title: string;
      message: string;
    }) =>
      apiFetch<{
        sentCount: number;
        failedCount: number;
        results: {
          targetUserId: string;
          insertedId?: string;
          success: boolean;
          error?: string;
        }[];
      }>(`${env.apiBaseUrl()}/notifications/users/send`, {
        method: "POST",
        body: JSON.stringify({
          userIds: payload.userIds,
          title: payload.title,
          message: payload.message,
        }),
      }),
    onSuccess: (result) => {
      if (result?.failedCount) {
        toastError(
          `${result.sentCount} sent, ${result.failedCount} failed`,
        );
      } else {
        toastSuccess(
          result?.sentCount === 1
            ? "Notification sent"
            : `${result?.sentCount ?? 0} notifications sent`,
        );
      }
      setNotificationTargetUsers([]);
      setSelectedAssignedUsers([]);
    },
    onError: (error) => {
      toastError(
        error instanceof Error ? error.message : "Failed to send notification",
      );
    },
  });

  const handleEditUser = (user: UserDetail) => {
    setUserToEdit(user);
  };

  const handleDeleteUser = (user: UserDetail) => {
    setConfirmEmail("");
    setUserToDelete({
      userId: user.userId,
      source: "annam",
      email: user.email,
    });
  };

  const handleChangeViewedUserPassword = async (payload: {
    newPassword: string;
    keepLoggedIn: boolean;
  }) => {
    if (!userProfile) return;

    await changeUserPasswordMutation.mutateAsync({
      userId: userProfile.userId,
      source: "annam",
      newPassword: payload.newPassword,
      keepLoggedIn: payload.keepLoggedIn,
    });
  };

  const requestVerificationChange = (user: UserDetail, nextStatus: boolean) => {
    setVerificationToConfirm({
      userId: user.userId,
      source: "annam",
      name: user.name,
      email: user.email,
      isVerified: nextStatus,
    });
  };

  const handleConfirmVerificationChange = async () => {
    if (!verificationToConfirm) return;
    await verifyUserMutation.mutateAsync({
      userId: verificationToConfirm.userId,
      source: verificationToConfirm.source,
      isVerified: verificationToConfirm.isVerified,
    });
    setVerificationToConfirm(null);
    await queryClient.invalidateQueries({ queryKey: ["user-profile"] });
  };

  const handleSaveEditedUser = async (payload: {
    name?: string;
    userRole?: string;
    farmerProfile?: {
      farmerName?: string;
      age?: number;
      gender?: string | null;
      villageName?: string | null;
      blockName?: string | null;
      district?: string | null;
      state?: string | null;
      phoneNo?: string;
      nearestKVK?: string;
      languagePreference?: string;
      yearsOfExperience?: number;
      landhold?: number;
      cropsCultivated?: string[];
      primaryCrop?: string;
      secondaryCrop?: string;
      awarenessOfKCC?: boolean;
      usesAgriApps?: boolean;
      highestEducatedPerson?: string | null;
      numberOfSmartphones?: number;
      platform?: string;
      platformHistory?: { os: string; timestamp: string }[];
    };
  }) => {
    if (!userToEdit) return;
    await updateUserMutation.mutateAsync({
      userId: userToEdit.userId,
      source: "annam",
      data: payload,
    });
    setUserToEdit(null);
  };

  const [availableOpen, setAvailableOpen] = useState(true);
  const [assignedOpen, setAssignedOpen] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const assignUsersMutation = useAssignUsers();
  const unassignUsersMutation = useUnassignUsers();
  const [assigning, setAssigning] = useState(false);

  const availableUsers: AssignableUser[] = userProfile?.unAssigned ?? [];

  const allSelected =
    availableUsers.length > 0 && selectedUsers.length === availableUsers.length;

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const selectAll = () => {
    setSelectedUsers(availableUsers.map((u) => u._id));
  };

  const clearSelection = () => {
    setSelectedUsers([]);
  };

  const handleAssignSelected = async () => {
    try {
      setAssigning(true);
      await assignUsersMutation.mutateAsync({
        userId: userProfile.userId,
        userIds: selectedUsers,
      });
      setSelectedUsers([]);
      setAssigning(false);
      await queryClient.invalidateQueries({
        queryKey: ["user-profile"],
      });
    } catch (err) {
      setSelectedUsers([]);
      setAssigning(false);
    }
  };

  const handleAssignUser = async (targetUserId: string) => {
    try {
      setAssigning(true);
      await assignUsersMutation.mutateAsync({
        userId: userProfile.userId,
        userIds: [targetUserId],
      });
      setAssigning(false);
      await queryClient.invalidateQueries({
        queryKey: ["user-profile"],
      });
    } finally {
      setSelectedUsers([]);
      setAssigning(false);
    }
  };

  const [selectedAssignedUsers, setSelectedAssignedUsers] = useState<string[]>(
    [],
  );

  const assignedUsers: AssignableUser[] = userProfile?.assigned ?? [];

  const allAssignedSelected =
    assignedUsers.length > 0 &&
    selectedAssignedUsers.length === assignedUsers.length;

  const toggleAssignedUser = (userId: string) => {
    setSelectedAssignedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const selectAllAssigned = () => {
    setSelectedAssignedUsers(assignedUsers.map((u) => u._id));
  };

  const clearAssignedSelection = () => {
    setSelectedAssignedUsers([]);
  };

  const handleUnassignSelected = async () => {
    try {
      setAssigning(true);
      await unassignUsersMutation.mutateAsync({
        userId: userProfile.userId,
        userIds: selectedAssignedUsers,
      });
      setSelectedAssignedUsers([]);
      await queryClient.invalidateQueries({
        queryKey: ["user-profile"],
      });
    } finally {
      setSelectedAssignedUsers([]);
      setAssigning(false);
    }
  };

  const handleUnassignUser = async (targetUserId: string) => {
    try {
      setAssigning(true);
      await unassignUsersMutation.mutateAsync({
        userId: userProfile.userId,
        userIds: [targetUserId],
      });
      setSelectedAssignedUsers([]);
      await queryClient.invalidateQueries({
        queryKey: ["user-profile"],
      });
    } finally {
      setSelectedAssignedUsers([]);
      setAssigning(false);
    }
  };

  const handleSendAssignedUserNotification = async (payload: {
    title: string;
    message: string;
  }) => {
    if (notificationTargetUsers.length === 0) return;
    await sendNotificationMutation.mutateAsync({
      userIds: notificationTargetUsers.map((user) => user._id),
      title: payload.title,
      message: payload.message,
    });
  };

  if (!user || (canFetchProfile && userProfileLoading)) {
    return (
      <>
        <Spinner />
      </>
    );
  }

  if (!canFetchProfile) {
    return (
      <DashboardMessage
        title="Invalid farmer ID"
        description="Please open this dashboard from a farmer name in the listing."
        onBack={() => navigate({ to: "/home" })}
      />
    );
  }

  if (userProfileError || !userProfile?.userId) {
    return (
      <DashboardMessage
        title="Farmer not found"
        description="This farmer profile could not be loaded. The user may have been removed or the ID is incorrect."
        onBack={() => navigate({ to: "/home" })}
      />
    );
  }

  const coordinatorRoles = [
    "district_coordinator",
    "block_coordinator",
    "village_volunteer",
  ];
  const viewedProfileIsCoordinator = coordinatorRoles.includes(
    userProfile?.userRole ?? "",
  );
  const currentUserIsCoordinator = isCoordinatorRole(currentUser?.role);
  const currentUserEmail = String(currentUser?.email || user?.email || "")
    .trim()
    .toLowerCase();
  const viewedUserEmail = String(userProfile?.email || "")
    .trim()
    .toLowerCase();
  const currentUserOwnsViewedProfile =
    currentUserIsCoordinator &&
    Boolean(currentUserEmail) &&
    currentUserEmail === viewedUserEmail;
  const isCoordinatorReadOnlyView =
    currentUserIsCoordinator &&
    viewedProfileIsCoordinator &&
    !currentUserOwnsViewedProfile;
  const showCoordinatorSummary =
    viewedProfileIsCoordinator && currentUser?.role !== "admin";
  const canManageAssignments =
    viewedProfileIsCoordinator &&
    (currentUser?.role === "admin" || currentUserOwnsViewedProfile);
  const parentCoordinator = userProfile?.parentCoordinator as
    | ParentCoordinator
    | null
    | undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1480px] px-4 py-4 sm:px-6 lg:px-8">
      <header className="mb-8 flex min-h-20 items-center justify-between gap-4 rounded-md border bg-card/80 px-4 py-3 shadow-sm sm:px-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/home" })}
            className="h-11 gap-2 rounded-md px-4 text-base"
        >
          <Home className="h-4 w-4 mr-2" />
          Home
        </Button>
        <h1 className="min-w-0 text-center text-lg font-semibold tracking-tight sm:text-xl">
          {viewedProfileIsCoordinator ? "Coordinator Dashboard" : "User Dashboard"}
        </h1>
        <div className="flex items-center gap-2">
          {currentUserIsCoordinator && (
            <NotificationModal
              copy="messages"
              trigger={
                <Button
                  variant="outline"
                  size="icon"
                  className="relative h-11 w-11 rounded-md"
                  title="Notifications"
                >
                  <MessageSquareText className="h-5 w-5" />
                  {(currentUser?.notifications ?? 0) > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                      {(currentUser?.notifications ?? 0) > 99
                        ? "99+"
                        : currentUser?.notifications}
                    </span>
                  )}
                </Button>
              }
            />
          )}
          <ThemeToggleCompact />
          <UserProfileActions />
        </div>
      </header>
      <main className="space-y-8">
        {showCoordinatorSummary ? (
          <CoordinatorDashboardSummary
            user={userProfile}
            assignedCount={assignedUsers.length}
            availableCount={availableUsers.length}
            isReadOnly={isCoordinatorReadOnlyView}
          />
        ) : (
        <FarmerDetailsContent
          user={userProfile}
          isAdmin={currentUser?.role === "admin"}
          isChangingPassword={changeUserPasswordMutation.isPending}
          isUpdatingVerification={verifyUserMutation.isPending}
          onEdit={handleEditUser}
          onDelete={handleDeleteUser}
          onVerificationChange={(nextStatus) =>
            requestVerificationChange(userProfile, nextStatus)
          }
          onNotificationHistory={
            currentUser?.role === "admin"
              ? (targetUser) => setNotificationHistoryUser(targetUser)
              : undefined
          }
          onChangePassword={handleChangeViewedUserPassword}
        />
        )}
        {parentCoordinator && (
          <ParentCoordinatorSection
            coordinatorRole={userProfile?.userRole}
            parentCoordinator={parentCoordinator}
          />
        )}
        <FarmerDashboardAnalytics
          dashboard={userProfile?.farmerDashboard as FarmerDashboardData}
        />
        {canManageAssignments && (
            <>
              <CoordinatorUserManagement
                availableUsers={availableUsers}
                assignedUsers={assignedUsers}
                availableOpen={availableOpen}
                assignedOpen={assignedOpen}
                selectedUsers={selectedUsers}
                selectedAssignedUsers={selectedAssignedUsers}
                allSelected={allSelected}
                allAssignedSelected={allAssignedSelected}
                assigning={assigning}
                isSending={sendNotificationMutation.isPending}
                onToggleAvailableOpen={() => setAvailableOpen((prev) => !prev)}
                onToggleAssignedOpen={() => setAssignedOpen((prev) => !prev)}
                onToggleUser={toggleUser}
                onToggleAssignedUser={toggleAssignedUser}
                onToggleAll={allSelected ? clearSelection : selectAll}
                onToggleAllAssigned={
                  allAssignedSelected ? clearAssignedSelection : selectAllAssigned
                }
                onAssignSelected={handleAssignSelected}
                onAssignUser={handleAssignUser}
                onMessageSelected={() =>
                  setNotificationTargetUsers(
                    assignedUsers.filter((user) =>
                      selectedAssignedUsers.includes(user._id),
                    ),
                  )
                }
                onUnassignSelected={handleUnassignSelected}
                onMessageUser={(targetUser) =>
                  setNotificationTargetUsers([targetUser])
                }
                onUnassignUser={handleUnassignUser}
              />
              {assignedUsers.length > 0 && (
                <section className="flex flex-col gap-4 rounded-md border bg-card/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#ecebff] text-[#5b50c8]">
                      <Send className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">Bulk message</h2>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        Send a notification to all assigned users at once.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="h-9 gap-2 rounded-md text-sm"
                    disabled={sendNotificationMutation.isPending}
                    onClick={() => setNotificationTargetUsers(assignedUsers)}
                  >
                    <MessageSquareText className="h-4 w-4" />
                    Send to all assigned
                  </Button>
                </section>
              )}
            </>
          )}
        </main>
      </div>
      <UserNotificationHistorySheet
        user={notificationHistoryUser}
        open={!!notificationHistoryUser}
        onOpenChange={(open) => !open && setNotificationHistoryUser(null)}
      />
      <CoordinatorNotificationDialog
        users={notificationTargetUsers}
        open={notificationTargetUsers.length > 0}
        isSending={sendNotificationMutation.isPending}
        defaultTitle={`Message from ${
          [currentUser?.firstName, currentUser?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          currentUser?.email ||
          "sender"
        }`}
        onOpenChange={(open) => !open && setNotificationTargetUsers([])}
        onSend={handleSendAssignedUserNotification}
      />
      <EditFarmerModal
        open={!!userToEdit}
        onOpenChange={(open) => !open && setUserToEdit(null)}
        user={userToEdit}
        isSaving={updateUserMutation.isPending}
        onSave={handleSaveEditedUser}
      />

      <AlertDialog
        open={!!userToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setUserToDelete(null);
            setConfirmEmail("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 p-3 rounded-full bg-destructive/10 w-fit">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-center">
              Delete this farmer?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              This action cannot be undone. To confirm, type{" "}
              <strong className="text-foreground">{userToDelete?.email}</strong>{" "}
              below.
            </AlertDialogDescription>
            <Input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder="Enter email to confirm"
              className="mt-3"
            />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={confirmEmail !== userToDelete?.email}
              onClick={async () => {
                if (userToDelete) {
                  deleteUserMutation.mutate(userToDelete);
                  setUserToDelete(null);
                  setConfirmEmail("");
                  navigate({ to: "/home" });
                }
              }}
            >
              Delete Farmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!verificationToConfirm}
        onOpenChange={(open) => {
          if (!open && !verifyUserMutation.isPending) {
            setVerificationToConfirm(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 p-3 rounded-full bg-primary/10 w-fit">
              {verificationToConfirm?.isVerified ? (
                <UserCheck2 className="h-5 w-5 text-primary" />
              ) : (
                <ShieldX className="h-5 w-5 text-destructive" />
              )}
            </div>
            <AlertDialogTitle className="text-center">
              {verificationToConfirm?.isVerified
                ? "Set user as verified?"
                : "Set user as unverified?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              This will update verification status for{" "}
              <strong className="text-foreground">
                {verificationToConfirm?.name}
              </strong>
              {verificationToConfirm?.email ? (
                <> ({verificationToConfirm.email})</>
              ) : null}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={verifyUserMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={verifyUserMutation.isPending}
              // onClick={handleConfirmVerificationChange}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmVerificationChange();
              }}
            >
              {verifyUserMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : verificationToConfirm?.isVerified ? (
                "Set Verified"
              ) : (
                "Set Unverified"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CoordinatorDashboardSummary({
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
      ? "Block Coordinators"
      : user.userRole === "block_coordinator"
        ? "Village Volunteers"
        : user.userRole === "village_volunteer"
          ? "Farmers"
          : "Assigned Users";

  return (
    <section className="rounded-md border bg-card/60 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{roleLabel || "Coordinator"}</Badge>
            {user.isVerified ? <Badge>Verified</Badge> : <Badge variant="secondary">Unverified</Badge>}
            {isReadOnly ? <Badge variant="secondary">Read-only view</Badge> : null}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Welcome, {user.name || "Coordinator"}
          </h2>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
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
                <Network className="h-4 w-4" />
                {region.join(", ")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          <CoordinatorStatCard label="Assigned" value={assignedCount} icon={<Users className="h-4 w-4" />} />
          <CoordinatorStatCard label="Available" value={availableCount} icon={<UserCheck2 className="h-4 w-4" />} />
          <CoordinatorStatCard label="Manages" value={manages} icon={<Network className="h-4 w-4" />} />
        </div>
      </div>
    </section>
  );
}

function CoordinatorStatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function ParentCoordinatorSection({
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
    <section className="my-4 rounded-md border bg-card/60 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
            <UserCheck2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{heading}</p>
            <p className="truncate text-base font-medium">
              {parentCoordinator.name || "Not Provided"}
            </p>
            {roleLabel && (
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
            )}
          </div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2 md:min-w-[420px]">
          {contactItems.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Contact
              </p>
              <p className="break-words">{contactItems.join(" / ")}</p>
            </div>
          )}
          {regionItems.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Assigned Region
              </p>
              <p className="break-words">{regionItems.join(", ")}</p>
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

function FarmerDashboardAnalytics({
  dashboard,
}: {
  dashboard?: FarmerDashboardData;
}) {
  const [trendGranularity, setTrendGranularity] =
    useState<TrendGranularity>("daily");
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(
    null,
  );

  const questionMetrics = dashboard?.questionMetrics ?? {};
  const messagingMetrics = dashboard?.messagingMetrics ?? {};
  const selectedTrend = dashboard?.engagementTrends?.[trendGranularity];
  const recentQuestions = (dashboard?.recentQuestions ?? []).slice(0, 10);
  const recentConversations = dashboard?.recentConversations ?? [];
  const recentMessages = recentConversations.flatMap((conversation) =>
    (conversation.messages ?? []).map((message) => ({
      ...message,
      conversationKey: conversation.conversationKey,
      conversationDate: conversation.conversationDate,
      threadId: conversation.threadId,
    })),
  ).slice(0, 10);

  const questionMetricCards: [string, any][] = [
    ["Total Questions Asked", questionMetrics.totalQuestionsAsked],
    ["Questions Closed", questionMetrics.questionsClosed],
    ["Questions in Review", questionMetrics.questionsInReview],
    ["Questions Pending", questionMetrics.questionsPending],
    ["Duplicate Questions", questionMetrics.duplicateQuestions],
    ["Non-Duplicate Questions", questionMetrics.nonDuplicateQuestions],
    [
      "Questions Closed Within 2 Hours",
      questionMetrics.questionsClosedWithin2Hours,
    ],
    ["Carry-Forward Questions", questionMetrics.carryForwardQuestions],
    ["Questions Awaiting Review", questionMetrics.questionsAwaitingReview],
  ];
  const messagingMetricCards: [string, any][] = [
    ["Total Messages Sent", messagingMetrics.totalMessagesSent],
    ["User Messages", messagingMetrics.userMessages],
    ["Bot Responses Received", messagingMetrics.botResponsesReceived],
    ["Conversation Threads", messagingMetrics.conversationThreads],
    [
      "Average Messages per Conversation",
      messagingMetrics.averageMessagesPerConversation,
    ],
    ["Longest Conversation", messagingMetrics.longestConversation],
    ["Latest Conversation Date", formatDate(messagingMetrics.latestConversationDate)],
    [
      "Questions Derived from Messages",
      messagingMetrics.questionsDerivedFromMessages,
    ],
  ];

  return (
    <div className="mt-6 space-y-6">
      <DashboardSection
        icon={<BarChart3 className="h-4 w-4 text-primary" />}
        title="Question Metrics"
      >
        <MetricGrid metrics={questionMetricCards} />
      </DashboardSection>

      <DashboardSection
        icon={<MessageSquareText className="h-4 w-4 text-primary" />}
        title="Messaging Metrics"
      >
        <MetricGrid metrics={messagingMetricCards} />
      </DashboardSection>

      <DashboardSection
        icon={<BarChart3 className="h-4 w-4 text-primary" />}
        title="Engagement Trends"
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {(["daily", "weekly", "monthly"] as TrendGranularity[]).map(
            (granularity) => (
              <Button
                key={granularity}
                size="sm"
                variant={
                  trendGranularity === granularity ? "default" : "outline"
                }
                onClick={() => setTrendGranularity(granularity)}
              >
                {toTitleCase(granularity)}
              </Button>
            ),
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <TrendBars
            title={`${toTitleCase(trendGranularity)} Question Activity`}
            data={selectedTrend?.questions ?? []}
          />
          <TrendBars
            title={`${toTitleCase(trendGranularity)} Messaging Trend`}
            data={selectedTrend?.messages ?? []}
          />
        </div>
      </DashboardSection>

      <DashboardSection title="Recent Questions">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Crop</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Created Date</TableHead>
              <TableHead>Closed Date</TableHead>
              <TableHead>Duplicate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentQuestions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                  No recent questions found.
                </TableCell>
              </TableRow>
            ) : (
              recentQuestions.map((question) => {
                const expanded = expandedQuestionId === question.id;
                return (
                  <Fragment key={question.id}>
                    <TableRow>
                      <TableCell className="min-w-[280px] max-w-[420px] whitespace-normal">
                        <button
                          type="button"
                          className="text-left font-medium text-primary hover:underline"
                          onClick={() =>
                            setExpandedQuestionId(expanded ? null : question.id)
                          }
                        >
                          {question.question || "Not provided"}
                        </button>
                        <div className="mt-2">
                          <TranslatableText text={question.question} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{question.status || "N/A"}</Badge>
                      </TableCell>
                      <TableCell>{question.crop || "N/A"}</TableCell>
                      <TableCell>{question.category || "N/A"}</TableCell>
                      <TableCell>{question.source || "N/A"}</TableCell>
                      <TableCell>{formatDate(question.createdAt)}</TableCell>
                      <TableCell>{formatDate(question.closedAt)}</TableCell>
                      <TableCell>
                        {question.isDuplicate ? (
                          <Badge variant="destructive">Yes</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow key={`${question.id}-conversation`}>
                        <TableCell colSpan={8} className="bg-muted/30">
                          <ConversationMessages
                            messages={question.messages ?? []}
                            emptyText="No conversation messages linked to this question."
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </DashboardSection>

      {recentMessages.length > 0 && (
        <DashboardSection title="Recent Messages">
          <div className="space-y-3">
            {recentMessages.map((message) => (
              <div
                key={`${message.conversationKey}-${message.id}`}
                className="rounded-md border bg-background p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={message.isCreatedByUser ? "default" : "secondary"}
                    >
                      {message.isCreatedByUser ? "User" : "Bot"}
                    </Badge>
                    {message.threadId ? (
                      <span className="max-w-[220px] truncate text-xs text-muted-foreground">
                        {message.threadId}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(message.createdAt || message.conversationDate)}
                  </span>
                </div>
                <TranslatableText text={message.text} />
              </div>
            ))}
          </div>
        </DashboardSection>
      )}
    </div>
  );
}

function DashboardSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-md">
      <CardHeader className="border-b pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function MetricGrid({ metrics }: { metrics: [string, any][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {metrics.map(([label, value]) => (
        <div key={label} className="rounded-md border bg-background p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatMetricValue(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function TrendBars({
  title,
  data,
}: {
  title: string;
  data: { date: string; count: number }[];
}) {
  const max = Math.max(...data.map((item) => item.count), 0);

  return (
    <div className="rounded-md border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-medium">{title}</p>
        <Badge variant="secondary">
          Total {data.reduce((sum, item) => sum + item.count, 0)}
        </Badge>
      </div>
      <div className="space-y-2">
        {data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No activity in this view.
          </p>
        ) : (
          data.slice(-12).map((item) => (
            <div
              key={item.date}
              className="grid grid-cols-[110px_1fr_42px] items-center gap-3 text-sm"
            >
              <span className="truncate text-muted-foreground">{item.date}</span>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{
                    width: `${max > 0 ? Math.max((item.count / max) * 100, 4) : 0}%`,
                  }}
                />
              </div>
              <span className="text-right font-medium">{item.count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ConversationMessages({
  messages,
  emptyText,
}: {
  messages: DashboardMessageEntry[];
  emptyText: string;
}) {
  if (messages.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="space-y-3 py-2">
      {messages.map((message) => (
        <div key={message.id} className="rounded-md border bg-background p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Badge variant={message.isCreatedByUser ? "default" : "secondary"}>
              {message.isCreatedByUser ? "User" : "Bot"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDate(message.createdAt)}
            </span>
          </div>
          <TranslatableText text={message.text} />
        </div>
      ))}
    </div>
  );
}

function TranslatableText({ text }: { text?: string }) {
  const [translatedText, setTranslatedText] = useState("");
  const displayText = translatedText || text || "Not provided";

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-sm text-foreground/90">
        {displayText}
      </p>
      {text && text.trim() && !isEnglishCharacters(text) ? (
        <SarvamTranslateDropdown
          query={text}
          onTranslate={(result) => setTranslatedText(result)}
        />
      ) : null}
    </div>
  );
}

function formatMetricValue(value: any) {
  if (value === undefined || value === null || value === "") return "0";
  return String(value);
}

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function CoordinatorNotificationDialog({
  users,
  open,
  isSending,
  defaultTitle,
  onOpenChange,
  onSend,
}: {
  users: AssignableUser[];
  open: boolean;
  isSending: boolean;
  defaultTitle: string;
  onOpenChange: (open: boolean) => void;
  onSend: (payload: { title: string; message: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState("");
  const recipientKey = users.map((user) => user._id).join(",");

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setMessage("");
    }
  }, [defaultTitle, open, recipientKey]);

  const canSend = message.trim().length > 0 && !isSending;
  const recipientText =
    users.length === 1
      ? `Send a notification to ${users[0]?.name}.`
      : `Send a notification to ${users.length} selected users.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Message</DialogTitle>
          <DialogDescription>{recipientText}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="notification-title">
              Title
            </label>
            <Input
              id="notification-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isSending}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="notification-message">
              Message
            </label>
            <Textarea
              id="notification-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={isSending}
              className="min-h-28"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSend}
            onClick={() =>
              void onSend({
                title,
                message,
              })
            }
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserNotificationHistorySheet({
  user,
  open,
  onOpenChange,
}: {
  user: UserDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const targetUserId = user?.userId ? String(user.userId) : "";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["user-notification-history", targetUserId],
    enabled: open && Boolean(targetUserId),
    queryFn: async () =>
      apiFetch<{
        notifications: UserNotification[];
        page: number;
        totalCount: number;
        totalPages: number;
      }>(
        `${env.apiBaseUrl()}/notifications/user/${targetUserId}?page=1&limit=50`,
      ),
  });
  const notifications = data?.notifications ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-6 pr-12">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2">
              <BellIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">
                Activity Logs
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {user?.name || user?.email || "Selected user"}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 bg-muted/10">
          <div className="space-y-4 p-6">
            {isLoading && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading activity logs...
              </div>
            )}

            {isError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load activity logs.
              </div>
            )}

            {!isLoading && !isError && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 rounded-full bg-muted p-4">
                  <BellIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold">No activity logs</h3>
                <p className="text-sm text-muted-foreground">
                  No activity logs found for this user.
                </p>
              </div>
            )}

            {notifications.map((notification) => (
              <div
                key={notification._id}
                className="rounded-xl border bg-card p-4 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">
                      {getNotificationDisplayTitle(notification)}
                    </h4>
                  </div>
                  <Badge variant={notification.is_read ? "outline" : "default"}>
                    {notification.is_read ? "Read" : "Unread"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {notification.message}
                </p>
                <div className="mt-4 grid gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <span>Sender</span>
                    <span className="text-right font-medium text-foreground">
                      {notification.sender?.name || notification.sender?.email || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Sender Role</span>
                    <span className="text-right font-medium text-foreground">
                      {notification.sender?.role || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Recipient</span>
                    <span className="text-right font-medium text-foreground">
                      {notification.recipient?.name ||
                        notification.recipient?.email ||
                        user?.name ||
                        user?.email ||
                        "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Delivered</span>
                    <span className="text-right font-medium text-foreground">
                      {formatDate(
                        notification.deliveryTimestamp || notification.createdAt,
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function getNotificationDisplayTitle(notification: UserNotification) {
  if (notification.direction === "sent") {
    const recipient =
      notification.recipient?.name || notification.recipient?.email;

    return recipient ? `Message sent to ${recipient}` : "Message sent";
  }

  const senderName = notification.sender?.name || notification.sender?.email;

  if (
    senderName &&
    (notification.title === "Message from coordinator" ||
      notification.title === "Message from admin")
  ) {
    return `Message from ${senderName}`;
  }

  if (
    notification.sender?.role === "admin" &&
    notification.title === "Message from coordinator"
  ) {
    return "Message from admin";
  }

  return notification.title || "Notification";
}

function DashboardMessage({
  title,
  description,
  onBack,
}: {
  title: string;
  description: string;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-8 py-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          <Home className="h-4 w-4 mr-2" />
          Home
        </Button>
        <h1 className="text-base font-semibold">User Dashboard</h1>
        <div className="flex items-center gap-2">
          <ThemeToggleCompact />
          <UserProfileActions />
        </div>
      </header>
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-4 rounded-full bg-destructive/10 p-3">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Button className="mt-6" onClick={onBack}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
