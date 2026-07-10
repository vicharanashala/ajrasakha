import React, { useCallback, useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/atoms/avatar";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Separator } from "@/components/atoms/separator";
import { useEditUser } from "@/hooks/api/user/useEditUser";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useAuthStore } from "@/stores/auth-store";
import type { IUser } from "@/types";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Edit2,
  ArrowLeft,
  User,
  Save,
  ShieldCheck,
  Settings,
  KeyRound,
  EyeOff,
  Eye,
  Camera,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { updateUserPassword, verifyCurrentPassword } from "@/lib/firebase";
import { calculatePasswordStrength } from "@/components/auth-form";
import { toast } from "sonner";

export const Route = createFileRoute("/profile/")({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: user, isLoading } = useGetCurrentUser({});
  const navigate = useNavigate();
  const { mutateAsync: updateUser, isPending: isUpdating } = useEditUser();

  const handleSubmit = async (data: IUser, showToast: boolean = true) => {
    try {
      await updateUser(data);
      if (showToast) {
        toast.success("Profile updated successfully!");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleBack = () => {
    window.history.back();
  };

  return (
    <main className="min-h-screen bg-background ">
      <div className="mx-auto px-6 py-8 w-[90%] md:max-w-[70%]">
        {/* Header with Back Button */}
        <div className="mb-8 flex items-center gap-4">
          <div
            className="flex items-center gap-2 mb-4 sm:mb-6 group cursor-pointer w-fit"
            onClick={handleBack}
          >
            <div className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:-translate-x-1 transition-transform duration-200" />
            </div>
          </div>
          <div>
            <h1 className="flex items-center text-2xl font-semibold tracking-tight gap-2">
              <Settings className="w-5 h-5 text-muted-foreground shrink-0" />
              <span>Profile Settings</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage your account information and preferences
            </p>
          </div>
        </div>
        {user && !isLoading ? (
          <ProfileForm
            user={user!}
            onSubmit={handleSubmit}
            isUpdating={isUpdating}
          />
        ) : (
          <div className="flex items-center justify-center h-40">
            <svg
              className="animate-spin h-8 w-8 text-primary"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          </div>
        )}
      </div>
    </main>
  );
}

type ProfileFormProps = {
  user: IUser;
  onSubmit?: (data: IUser, showToast?: boolean) => Promise<void> | void;
  isUpdating: boolean;
};

function ProfileForm({ user, onSubmit, isUpdating }: ProfileFormProps) {
  const [formData, setFormData] = useState<IUser>({ ...user });
  const [isEditMode, setIsEditMode] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user.avatar || "");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fullName = [formData.firstName, formData.lastName].filter(Boolean).join(" ");
  const userFromStore = useAuthStore((state) => state.user);

  useEffect(() => {
    setFormData({ ...user });
    setAvatarPreview(user.avatar || "");
  }, [user]);

  const getInitials = () => {
    const name = fullName || user.email || "";
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleChange = (field: keyof IUser, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }
    if (file.size > 70 * 1024) {
      toast.error("Image size must be less than 70KB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setAvatarPreview(base64);
      handleChange("avatar", base64);
      setIsUploadingAvatar(true);
      try {
        await onSubmit?.({ ...formData, avatar: base64 }, false);
        useAuthStore.getState().updateUser({ avatar: base64 });
        toast.success("Profile picture updated!");
      } catch (error) {
        toast.error("Failed to update profile picture");
        setAvatarPreview(userFromStore?.avatar || "");
        if (fileInputRef.current) fileInputRef.current.value = "";
      } finally {
        setIsUploadingAvatar(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    try {
      setIsRemovingAvatar(true);
      const updatedData = { ...formData, avatar: "" };
      setAvatarPreview("");
      setFormData(updatedData);
      await onSubmit?.(updatedData, false);
      useAuthStore.getState().updateUser({ avatar: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Profile picture removed!");
    } catch (error) {
      toast.error("Failed to remove profile picture");
    } finally {
      setIsRemovingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!formData.firstName.trim()) {
      toast.error("First Name is required");
      return;
    }
    await onSubmit?.(formData, true);
    setIsEditMode(false);
  };

  const avatarBg = "bg-green-100 text-green-700";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row items-center md:items-start justify-between rounded-lg border bg-card p-6 gap-6">
        {/* Avatar + Info */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 w-full md:w-auto">
          {/* Avatar */}
          <div
            className={`relative group ${isUploadingAvatar || isRemovingAvatar ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
            onClick={() =>
              !isUploadingAvatar &&
              !isRemovingAvatar &&
              fileInputRef.current?.click()
            }
          >
            <Avatar className={`h-24 w-24 flex-shrink-0 ${avatarBg}`}>
              <AvatarImage src={avatarPreview || ""} alt={fullName} />
              <AvatarFallback className="text-2xl font-semibold">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Camera className="h-6 w-6 text-white" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* User Details */}
          <div className="space-y-2 text-center sm:text-left w-full">
            <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                {fullName}
              </h2>

              {user?.role && (
                <span
                  className={`
                    px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                    flex items-center gap-1
                    ${
                      user.role === "call_agent"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : user.role === "moderator"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          : user.role === "admin"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    }
                  `}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {user.role === "call_agent" ? "Call Agent" : user.role}
                </span>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {formData.email}
            </p>

            <p className="text-xs text-muted-foreground">
              Click on the profile picture to update it
            </p>
            {avatarPreview && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={isUploadingAvatar || isRemovingAvatar}
                className="text-xs text-red-500 hover:text-red-600 underline text-center sm:text-left w-fit disabled:opacity-50 cursor-pointer"
              >
                Remove Avatar
              </button>
            )}
          </div>
        </div>

        {/* Edit Button */}
        <div className="w-full md:w-auto flex justify-center md:justify-start">
          <Button
            type="button"
            variant="default"
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setIsEditMode((prev) => !prev)}
            disabled={isUpdating}
          >
            <Edit2 className="h-4 w-4" />
            {isEditMode ? "Cancel Edit" : "Edit Profile"}
          </Button>
        </div>
      </div>

      {/* Account Info Form Card */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          Personal Information
        </h3>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              placeholder="First Name"
              value={formData.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              disabled={!isEditMode || isUpdating}
              className="h-11 border-2 focus:border-green-400 transition-colors"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              placeholder="Last Name"
              value={formData.lastName || ""}
              onChange={(e) => handleChange("lastName", e.target.value)}
              disabled={!isEditMode || isUpdating}
              className="h-11 border-2 focus:border-green-400 transition-colors"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              value={formData.email}
              disabled
              className="h-11 border-2 bg-muted/50 cursor-not-allowed opacity-80"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="mobile">Mobile Number</Label>
            <Input
              id="mobile"
              placeholder="Enter mobile number"
              value={formData.mobile || ""}
              onChange={(e) => handleChange("mobile", e.target.value)}
              disabled={!isEditMode || isUpdating}
              className="h-11 border-2 focus:border-green-400 transition-colors"
            />
          </div>
        </div>

        {isEditMode && (
          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isUpdating}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {/* Security Settings Card */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          Security Settings
        </h3>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Password</p>
            <p className="text-xs text-muted-foreground">
              Update your account password periodically to keep it secure
            </p>
          </div>
          <ChangePasswordDialog email={formData.email} />
        </div>
      </div>
    </div>
  );
}

function ChangePasswordDialog({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetFields = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setIsSubmitting(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) resetFields();
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Verify current password
      const reauth = await verifyCurrentPassword(email, currentPassword);
      if (!reauth.success) {
        throw new Error("Incorrect current password.");
      }

      // 2. Update to new password
      const updateResult = await updateUserPassword(newPassword);
      if (!updateResult.success) {
        throw new Error("Failed to update password.");
      }

      toast.success("Password changed successfully!");
      handleOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to update password. Make sure current password is correct.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const passwordStrength = calculatePasswordStrength(newPassword);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="cursor-pointer">Change Password</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        <form onSubmit={handlePasswordChange}>
          <div className="grid gap-4 py-4">
            {/* Current Password */}
            <div className="grid gap-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="pr-10 border-2 focus:border-green-400"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((p) => !p)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="grid gap-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="pr-10 border-2 focus:border-green-400"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((p) => !p)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {newPassword && (
                <div className="space-y-2 mt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Strength:</span>
                    <span className="font-bold text-green-500">{passwordStrength.label}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${passwordStrength.color}`}
                      style={{ width: `${passwordStrength.value}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Confirm New Password */}
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="pr-10 border-2 focus:border-green-400"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((p) => !p)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto cursor-pointer"
            >
              {isSubmitting ? "Changing..." : "Update Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
