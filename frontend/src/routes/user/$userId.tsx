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
import { useQueryClient } from "@tanstack/react-query";
import { FarmerNameLink } from "@/features/chatbotDashboard/components/FarmerNameLink";
import SarvamTranslateDropdown from "@/components/SarvamTranslateDropdown";
import { isCoordinatorRole } from "@/lib/roles";

export const Route = createFileRoute("/user/$userId")({
  component: RouteComponent,
});

const isLikelyObjectId = (value?: string | null) =>
  Boolean(value && /^[a-f\d]{24}$/i.test(value));

type AssignableUser = {
  _id: string;
  name: string;
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

function RouteComponent() {
  const queryClient = useQueryClient();
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
      const currentUserId = currentUser?._id || user.uid;
      if (isCoordinatorRole(currentUser?.role) && userId === currentUserId) {
        return;
      }
      navigate({ to: "/home" });
      return;
    }
  }, [user, currentUser, navigate, userId]);

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
        userIds: availableUsers.map((u) => u._id),
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
          onChangePassword={handleChangeViewedUserPassword}
        />
        <FarmerDashboardAnalytics
          dashboard={userProfile?.farmerDashboard as FarmerDashboardData}
        />
        {currentUser?.role === "admin" &&
          [
            "district_coordinator",
            "block_coordinator",
            "village_volunteer",
          ].includes(userProfile?.userRole) && (
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
                                <FarmerNameLink userId={u._id} className="font-medium">
                                  {u.name}
                                </FarmerNameLink>
                                <p className="text-xs text-muted-foreground">
                                  {u.userRole}
                                </p>
                              </div>
                            </div>

                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleUnassignUser(u._id)}
                              disabled={assigning}
                            >
                              Remove
                            </Button>
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
