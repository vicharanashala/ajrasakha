import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { isCoordinatorRole } from "@/lib/roles";
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
  ChevronDown,
  Home,
  Loader2,
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
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/user/$userId")({
  component: RouteComponent,
});

function RouteComponent() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { data: currentUser, isLoading } = useGetCurrentUser({
    enabled: !!user,
  });
  const { userId } = Route.useParams();

  const {
    data: userProfile,
    isFetching: userProfileFetching,
    isLoading: userProfileLoading,
  } = useUserProfile(userId);

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

  const availableUsers = userProfile?.unAssigned ?? [];

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

  const assignedUsers = userProfile?.assigned ?? [];

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

  if (!user || userProfileLoading) {
    return (
      <>
        <Spinner />
      </>
    );
  }

  if (!userProfile) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
        <h1 className="text-2xl font-bold">User Not Found</h1>
        <p className="mt-2 text-muted-foreground">The requested user profile could not be found or failed to load.</p>
        <Button className="mt-6" onClick={() => navigate({ to: "/home" })}>
          Return to Home
        </Button>
      </div>
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
                                <p className="font-medium">{u.name}</p>
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
                                <p className="font-medium">{u.name}</p>
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
