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
import { CoordinatorDuplicateQuestionHeatMap } from "@/features/chatbotDashboard/components/CoordinatorDuplicateQuestionHeatMap";

export const Route = createFileRoute("/user/$userId")({
  component: RouteComponent,
});

const isLikelyObjectId = (value?: string | null) =>
  Boolean(value && /^[a-f\d]{24}$/i.test(value));

const normalizeRoleValue = (role?: string | null) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

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

  const viewedProfileIsCoordinator = [
    userProfile?.userRole,
    userProfile?.role,
  ].some((role) => isCoordinatorRole(normalizeRoleValue(role)));
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
          afterEngagementTrends={
            viewedProfileIsCoordinator ? (
              <CoordinatorDuplicateQuestionHeatMap
                coordinatorId={String(userProfile?.userId || userId)}
              />
            ) : undefined
          }
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
