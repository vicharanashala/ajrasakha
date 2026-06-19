import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useAuthStore } from "@/stores/auth-store";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";
import {
  useUserProfile,
  type UserDetail,
} from "@/features/chatbotDashboard/hooks/useUserDetails";
import { FarmerDetailsContent } from "@/components/user/FarmerDetailsContent";
import {
  AlertCircle,
  BarChart3,
  BellIcon,
  ChevronDown,
  Home,
  Loader2,
  MessageSquareText,
  ShieldX,
  UserCheck2,
} from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";
import Spinner from "@/components/atoms/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Textarea } from "@/components/atoms/textarea";
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
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FarmerNameLink } from "@/features/chatbotDashboard/components/FarmerNameLink";
import SarvamTranslateDropdown from "@/components/SarvamTranslateDropdown";
import { isCoordinatorRole } from "@/lib/roles";
import { NotificationModal } from "@/components/NotificationModal";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import { useToast } from "@/shared/components/toast";

export const Route = createFileRoute("/user/$userId")({
  component: RouteComponent,
});

const isLikelyObjectId = (value?: string | null) =>
  Boolean(value && /^[a-f\d]{24}$/i.test(value));

type AssignableUser = {
  _id: string;
  name: string;
  email?: string;
  userRole?: string;
};

type TrendGranularity = "daily" | "weekly" | "monthly";

type DashboardMessageEntry = {
  id: string;
  text: string;
  isCreatedByUser: boolean;
  createdAt?: string;
  messageId?: string;
};

type DashboardQuestion = {
  id: string;
  question: string;
  status?: string;
  crop?: string;
  category?: string;
  source?: string;
  createdAt?: string;
  closedAt?: string | null;
  isDuplicate?: boolean;
  conversationKey?: string;
  messages?: DashboardMessageEntry[];
};

type DashboardConversation = {
  conversationKey: string;
  threadId?: string;
  conversationDate?: string;
  messageCount: number;
  questionGenerated: boolean;
  latestMessage?: string;
  messages?: DashboardMessageEntry[];
};

type FarmerDashboardData = {
  questionMetrics?: Record<string, any>;
  messagingMetrics?: Record<string, any>;
  engagementTrends?: Record<TrendGranularity, {
    questions?: { date: string; count: number }[];
    messages?: { date: string; count: number }[];
  }>;
  recentQuestions?: DashboardQuestion[];
  recentConversations?: DashboardConversation[];
};

type UserNotification = {
  _id: string;
  enitity_id: string;
  message: string;
  title: string;
  is_read: boolean;
  type: string;
  createdAt: string;
  deliveryTimestamp?: string;
  questionText?: string;
  sender?: {
    _id: string;
    name?: string;
    email?: string;
    role?: string;
  } | null;
  recipient?: {
    _id: string;
    name?: string;
    email?: string;
    role?: string;
  } | null;
  direction?: "sent" | "received";
};

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
      }
      navigate({ to: "/home" });
      return;
    }
  }, [user, currentUser, navigate, userProfile, userProfileLoading]);

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
  const [notificationTargetUser, setNotificationTargetUser] =
    useState<AssignableUser | null>(null);

  const sendNotificationMutation = useMutation({
    mutationFn: async (payload: {
      userId: string;
      title: string;
      message: string;
    }) =>
      apiFetch(`${env.apiBaseUrl()}/notifications/user/${payload.userId}/send`, {
        method: "POST",
        body: JSON.stringify({
          title: payload.title,
          message: payload.message,
        }),
      }),
    onSuccess: () => {
      toastSuccess("Notification sent");
      setNotificationTargetUser(null);
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
    if (!notificationTargetUser) return;
    await sendNotificationMutation.mutateAsync({
      userId: notificationTargetUser._id,
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
  const canManageAssignments =
    viewedProfileIsCoordinator &&
    (currentUser?.role === "admin" || currentUserOwnsViewedProfile);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-8 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/home" })}
        >
          <Home className="h-4 w-4 mr-2" />
          Home
        </Button>
        <h1 className="text-base font-semibold">User Dashboard</h1>
        <div className="flex items-center gap-2">
          {currentUserIsCoordinator && (
            <NotificationModal
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-9 w-9"
                  title="Notifications"
                >
                  <BellIcon className="h-5 w-5" />
                  {(currentUser?.notifications ?? 0) > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
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
      <div className="p-6">
        {/* <FarmerDetailsContent user={userProfile} /> */}
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
        <FarmerDashboardAnalytics
          dashboard={userProfile?.farmerDashboard as FarmerDashboardData}
        />
        {canManageAssignments && (
            <>
              <section className="rounded-md border bg-card/60 overflow-hidden my-4">
                <motion.button
                  type="button"
                  onClick={() => setAvailableOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between p-4"
                >
                  <div className="flex flex-col items-start justify-center">
                    <p className="font-semibold">Available Users</p>
                    <p className="text-xs text-muted-foreground">
                      Users that can be assigned to this coordinator
                    </p>
                  </div>

                  <motion.div animate={{ rotate: availableOpen ? 180 : 0 }}>
                    <ChevronDown className="h-4 w-4" />
                  </motion.div>
                </motion.button>

                <AnimatePresence initial={false}>
                  {availableOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={allSelected ? clearSelection : selectAll}
                              disabled={assigning}
                            >
                              {allSelected ? "Clear All" : "Select All"}
                            </Button>

                            <span className="text-sm text-muted-foreground">
                              {selectedUsers.length} selected
                            </span>
                          </div>

                          <Button
                            size="sm"
                            disabled={
                              selectedUsers.length === 0 || assigning == true
                            }
                            onClick={handleAssignSelected}
                          >
                            Assign Selected
                          </Button>
                        </div>

                        {availableUsers.map((u) => (
                          <div
                            key={u._id}
                            className="flex items-center justify-between rounded-md border p-3"
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={selectedUsers.includes(u._id)}
                                onChange={() => toggleUser(u._id)}
                              />

                              <div>
                                <FarmerNameLink userId={u._id} className="font-medium">
                                  {u.name}
                                </FarmerNameLink>
                                {u.userRole ? (
                                  <p className="text-xs text-muted-foreground">
                                    {u.userRole}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAssignUser(u._id)}
                              disabled={assigning}
                            >
                              Assign
                            </Button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              <section className="rounded-md border bg-card/60 overflow-hidden my-4">
                <motion.button
                  type="button"
                  onClick={() => setAssignedOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between p-4"
                >
                  <div className="flex flex-col items-start justify-center">
                    <p className="font-semibold">Assigned Users</p>
                    <p className="text-xs text-muted-foreground">
                      Users currently assigned to this coordinator
                    </p>
                  </div>

                  <motion.div animate={{ rotate: assignedOpen ? 180 : 0 }}>
                    <ChevronDown className="h-4 w-4" />
                  </motion.div>
                </motion.button>

                <AnimatePresence initial={false}>
                  {assignedOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={
                                allAssignedSelected
                                  ? clearAssignedSelection
                                  : selectAllAssigned
                              }
                            >
                              {allAssignedSelected ? "Clear All" : "Select All"}
                            </Button>

                            <span className="text-sm text-muted-foreground">
                              {selectedAssignedUsers.length} selected
                            </span>
                          </div>

                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={
                              selectedAssignedUsers.length === 0 || assigning
                            }
                            onClick={handleUnassignSelected}
                          >
                            Unassign Selected
                          </Button>
                        </div>

                        {assignedUsers.map((u) => (
                          <div
                            key={u._id}
                            className="flex items-center justify-between rounded-md border p-3"
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={selectedAssignedUsers.includes(u._id)}
                                onChange={() => toggleAssignedUser(u._id)}
                              />

                              <div>
                                <span className="font-medium">{u.name}</span>
                                <p className="text-xs text-muted-foreground">
                                  {u.userRole}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => setNotificationTargetUser(u)}
                                title="Send notification"
                                aria-label={`Send notification to ${u.name}`}
                              >
                                <BellIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleUnassignUser(u._id)}
                                disabled={assigning}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </>
          )}
      </div>
      <UserNotificationHistorySheet
        user={notificationHistoryUser}
        open={!!notificationHistoryUser}
        onOpenChange={(open) => !open && setNotificationHistoryUser(null)}
      />
      <CoordinatorNotificationDialog
        user={notificationTargetUser}
        open={!!notificationTargetUser}
        isSending={sendNotificationMutation.isPending}
        defaultTitle={
          currentUser?.role === "admin"
            ? "Message from admin"
            : "Message from coordinator"
        }
        onOpenChange={(open) => !open && setNotificationTargetUser(null)}
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
  const [expandedConversationKey, setExpandedConversationKey] = useState<
    string | null
  >(null);

  const questionMetrics = dashboard?.questionMetrics ?? {};
  const messagingMetrics = dashboard?.messagingMetrics ?? {};
  const selectedTrend = dashboard?.engagementTrends?.[trendGranularity];
  const recentQuestions = dashboard?.recentQuestions ?? [];
  const recentConversations = dashboard?.recentConversations ?? [];

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

      <DashboardSection title="Recent Conversations">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conversation Date</TableHead>
              <TableHead>Thread ID</TableHead>
              <TableHead>Message Count</TableHead>
              <TableHead>Question Generated</TableHead>
              <TableHead>Latest Message</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentConversations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  No recent conversations found.
                </TableCell>
              </TableRow>
            ) : (
              recentConversations.map((conversation) => {
                const expanded =
                  expandedConversationKey === conversation.conversationKey;
                return (
                  <Fragment key={conversation.conversationKey}>
                    <TableRow>
                      <TableCell>{formatDate(conversation.conversationDate)}</TableCell>
                      <TableCell className="max-w-[220px] truncate">
                        {conversation.threadId || "Missing thread ID"}
                      </TableCell>
                      <TableCell>{conversation.messageCount}</TableCell>
                      <TableCell>
                        {conversation.questionGenerated ? (
                          <Badge>Yes</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[260px] max-w-[420px] whitespace-normal">
                        <TranslatableText text={conversation.latestMessage} />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setExpandedConversationKey(
                              expanded ? null : conversation.conversationKey,
                            )
                          }
                        >
                          View Conversation
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow key={`${conversation.conversationKey}-messages`}>
                        <TableCell colSpan={6} className="bg-muted/30">
                          <ConversationMessages
                            messages={conversation.messages ?? []}
                            emptyText="No messages available for this conversation."
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
      {text ? (
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
  user,
  open,
  isSending,
  defaultTitle,
  onOpenChange,
  onSend,
}: {
  user: AssignableUser | null;
  open: boolean;
  isSending: boolean;
  defaultTitle: string;
  onOpenChange: (open: boolean) => void;
  onSend: (payload: { title: string; message: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setMessage("");
    }
  }, [defaultTitle, open, user?._id]);

  const canSend = message.trim().length > 0 && !isSending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send notification</DialogTitle>
          <DialogDescription>
            {user?.name ? `Send a notification to ${user.name}.` : null}
          </DialogDescription>
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
                {notification.questionText && (
                  <p className="mt-2 text-xs text-primary font-medium bg-primary/5 px-2 py-1.5 rounded-md border border-primary/20">
                    {notification.questionText}
                  </p>
                )}
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
