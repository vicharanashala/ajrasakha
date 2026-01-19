import { CROPS, STATES } from "@/components/advanced-question-filter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/atoms/avatar";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { Separator } from "@/components/atoms/separator";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { useEditUser } from "@/hooks/api/user/useEditUser";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useAuthStore } from "@/stores/auth-store";
import type { IUser } from "@/types";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  Edit2,
  ArrowLeft,
  User,
  Briefcase,
  MapPin,
  Network,
  Save,
  XCircle,
  ShieldCheck,
  Settings,
  AlertTriangle,
  KeyRound,
  Check,
  EyeOff,
  Eye,
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

export const Route = createFileRoute("/profile/")({
  component: ProfilePage,
});

export default function ProfilePage() {
  const { data: user, isLoading } = useGetCurrentUser({});
  const { mutateAsync: updateUser, isPending: isUpdating } = useEditUser();

  const handleSubmit = async (data: IUser) => {
    try {
      await updateUser(data);
      toast.success("Profile updated!");
    } catch (error) {
      console.error(error);
    }
  };

  const handleBack = () => {
    window.history.back();
  };

  return (
    <main className="min-h-screen bg-background ">
      <div className="mx-auto  px-6 py-8 w-[90%] md:max-w-[70%]">
        {/* Header with Back Button */}
        <div className="mb-8 flex items-center gap-4">
          <div
            className="flex items-center gap-2 mb-4 sm:mb-6 group cursor-pointer w-fit"
            onClick={handleBack}
          >
            <div className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:-translate-x-1 transition-transform duration-200" />
              {/* <span className="text-xs sm:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200">
            Go Back
          </span> */}
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
  onSubmit?: (data: IUser) => Promise<void> | void;
  isUpdating: boolean;
};

const ProfileForm = ({ user, onSubmit, isUpdating }: ProfileFormProps) => {
  const [formData, setFormData] = useState<IUser>({
    ...user,
    preference: {
      state: user?.preference?.state ?? "",
      crop: user?.preference?.crop ?? "",
      domain: user?.preference?.domain ?? "",
    },
  });

  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [passwordErrors, setPasswordErrors] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    general: "",
  });

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const { user: userFromStore } = useAuthStore();

  const handleChange = useCallback((key: keyof IUser | string, value: any) => {
    if (key.startsWith("preference.")) {
      const prefKey = key.split(".")[1];
      setFormData((prev: any) => ({
        ...prev,
        preference: {
          ...prev.preference,
          [prefKey]: value,
        },
      }));
    } else {
      setFormData((prev) => ({ ...prev, [key]: value }));
    }
  }, []);

  const handleSave = async () => {
    try {
      if (
        formData.preference?.domain === "" ||
        formData.preference?.domain === "All"
      ) {
        formData.preference.domain = "all";
      }
      await onSubmit?.(formData);
      setIsEditMode(false);
    } catch (error) {
      console.error("Error while saving form data:", error);
    }
  };

  const avatarColors = [
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  ];

  const getColorForUser = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return avatarColors[Math.abs(hash) % avatarColors.length];
  };

  const fullName = `${formData.firstName} ${formData.lastName}`;
  const avatarBg = getColorForUser(fullName);

  const getInitials = () => {
    return `${formData.firstName?.[0] ?? ""}${
      formData.lastName?.[0] ?? ""
    }`.toUpperCase();
  };

  type PasswordFields = "currentPassword" | "newPassword" | "confirmPassword";

  const handlePasswordChange = (field: PasswordFields, value: string) => {
    setPasswordForm((prev) => ({ ...prev, [field]: value }));

    setPasswordErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleUpdatePassword = async () => {
    const newErrors = {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      general: "",
    };

    // Trim inputs
    const currentPassword = passwordForm.currentPassword.trim();
    const newPassword = passwordForm.newPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    // RegEx for strong password
    // const strongPasswordRegex =
    //   /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^(){}[\]_+=-]).{8,}$/;

    // -------- VALIDATION --------
    if (!currentPassword) {
      newErrors.currentPassword = "Current password is required.";
    }

    if (!newPassword) {
      newErrors.newPassword = "New password is required.";
    } else {
      // if (!strongPasswordRegex.test(newPassword)) {
      //   newErrors.newPassword =
      //     "Password must be at least 8 characters, include uppercase, lowercase, number, and a special character.";
      // }

      if (currentPassword.length < 6) {
        newErrors.newPassword = "Password must be at least 6 characters";
      }

      if (newPassword === currentPassword) {
        newErrors.newPassword =
          "New password cannot be the same as the current password.";
      }
    }

    if (confirmPassword !== newPassword) {
      newErrors.confirmPassword = "Passwords do not match.";
    }

    if (
      newErrors.currentPassword ||
      newErrors.newPassword ||
      newErrors.confirmPassword
    ) {
      setPasswordErrors(newErrors);
      return; // stop here
    }

    setIsChangingPassword(true);
    // -------- REAUTHENTICATION --------
    const reauth = await verifyCurrentPassword(user.email, currentPassword);

    if (!reauth.success) {
      setPasswordErrors((prev) => ({
        ...prev,
        currentPassword: "Incorrect current password.",
      }));
      setIsChangingPassword(false);
      return; //  STOP — do not update password
    }

    // -------- UPDATE PASSWORD --------
    const update = await updateUserPassword(newPassword);

    if (!update.success) {
      setPasswordErrors((prev) => ({
        ...prev,
        general: "Failed to update password. Try again.",
      }));
      setIsChangingPassword(false);
      return;
    }

    // Success
    toast.success("Password updated successfully!");
    setPasswordErrors({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      general: "",
    });
    setIsChangingPassword(false);
    setChangePasswordOpen(false);
  };

  const passwordStrength = calculatePasswordStrength(passwordForm.newPassword);

  return (
    <div className="space-y-8">
      {/* Profile Header */}
      {/* <div className="flex flex-col md:flex-row items-center md:items-start justify-between rounded-lg border bg-card p-6 gap-4 md:gap-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 w-full md:w-auto">
          <Avatar className={`h-24 w-24 flex-shrink-0 ${avatarBg}`}>
            <AvatarImage src={userFromStore?.avatar || ""} alt={fullName} />
            <AvatarFallback className="text-2xl font-semibold">
              {getInitials()}
            </AvatarFallback>
          </Avatar>

          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                {`${formData.firstName} ${formData.lastName}`}
              </h2>
              {user?.role && (
                <span
                  className={`
                    px-2.5 py-0.5 rounded-full text-xs font-medium capitalize flex items-center gap-1
                    ${
                      user.role === "expert"
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
                  {user.role}
                </span>
              )}
            </div>

            <p className="text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-2">
              {formData.email}
            </p>
            <p className="text-xs text-muted-foreground">
              Profile image is managed by your account provider
            </p>
          </div>
        </div>

        <div className="w-full md:w-auto flex justify-center md:justify-start">
          <Button
            type="button"
            variant="default"
            className="flex items-center gap-2"
            onClick={() => setIsEditMode((prev) => !prev)}
          >
            <Edit2 className="h-4 w-4" />
            {isEditMode ? "Cancel Edit" : "Edit Profile"}
          </Button>
        </div>
      </div> */}

      <div className="flex flex-col md:flex-row items-center md:items-start justify-between rounded-lg border bg-card p-6 gap-6">
        {/* Avatar + Info */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 w-full md:w-auto">
          {/* Avatar */}
          <Avatar className={`h-24 w-24 flex-shrink-0 ${avatarBg}`}>
            <AvatarImage src={userFromStore?.avatar || ""} alt={fullName} />
            <AvatarFallback className="text-2xl font-semibold">
              {getInitials()}
            </AvatarFallback>
          </Avatar>

          {/* User Details */}
          <div className="space-y-2 text-center sm:text-left w-full">
            <div className="flex flex-col sm:flex-row items-center sm:items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                {`${formData.firstName} ${formData.lastName}`}
              </h2>

              {user?.role && (
                <span
                  className={`
              px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
              flex items-center gap-1
              ${
                user.role === "expert"
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
                  {user.role}
                </span>
              )}
            </div>

            <p className="text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-2">
              {formData.email}
            </p>

            <p className="text-xs text-muted-foreground text-center sm:text-left">
              Profile image is managed by your account provider
            </p>
          </div>
        </div>

        {/* Edit Button */}
        <div className="w-full md:w-auto flex justify-center md:justify-start">
          <Button
            type="button"
            variant="default"
            className="flex items-center gap-2"
            onClick={() => setIsEditMode((prev) => !prev)}
            disabled={isUpdating}
          >
            <Edit2 className="h-4 w-4" />
            {isEditMode ? "Cancel Edit" : "Edit Profile"}
          </Button>
        </div>
      </div>

      {/* <div className="space-y-6 rounded-lg border bg-card p-6">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" /> Personal
            Information
          </h3>
          <p className="text-sm text-muted-foreground">
            Update your personal details
          </p>
        </div>
        <Separator />

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              disabled={!isEditMode}
              value={formData.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              placeholder="Enter first name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              disabled={!isEditMode}
              value={formData.lastName}
              onChange={(e) => handleChange("lastName", e.target.value)}
              placeholder="Enter last name"
            />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              disabled
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="Enter email"
            />
          </div>

          <div className="flex gap-4 items-end w-full">
            <div className="space-y-2 flex-3">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                disabled
                value="****************"
              />
            </div>

            <Dialog
              open={changePasswordOpen}
              onOpenChange={setChangePasswordOpen}
            >
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2"
                >
                  <KeyRound size={18} />
                  Change Password
                </Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change Password</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Current Password</Label>

                    <div className="relative">
                      <Input
                        type={showCurrentPassword ? "text" : "password"}
                        placeholder="Enter current password"
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          handlePasswordChange(
                            "currentPassword",
                            e.target.value
                          )
                        }
                        className="pr-10"
                      />

                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-3 flex items-center text-gray-500"
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>

                    {passwordErrors.currentPassword && (
                      <p className="text-red-500 text-sm">
                        {passwordErrors.currentPassword}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>New Password</Label>

                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        placeholder="Enter new password"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          handlePasswordChange("newPassword", e.target.value)
                        }
                      />

                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showNewPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>

                    {passwordErrors.newPassword && (
                      <p className="text-red-500 text-sm">
                        {passwordErrors.newPassword}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Confirm Password</Label>

                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          handlePasswordChange(
                            "confirmPassword",
                            e.target.value
                          )
                        }
                      />

                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showConfirmPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>

                    {passwordErrors.confirmPassword && (
                      <p className="text-red-500 text-sm">
                        {passwordErrors.confirmPassword}
                      </p>
                    )}
                  </div>

                  {passwordErrors.general && (
                    <p className="text-red-500 text-sm">
                      {passwordErrors.general}
                    </p>
                  )}
                  {passwordForm.newPassword.length > 0 && (
                    <div className="space-y-3 p-4 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          Password Strength
                        </span>
                        <span
                          className={`text-xs font-bold 
                                      ${
                                        passwordStrength.value <= 25
                                          ? "text-red-500"
                                          : ""
                                      }
                                      ${
                                        passwordStrength.value > 25 &&
                                        passwordStrength.value <= 50
                                          ? "text-yellow-500"
                                          : ""
                                      }
                                      ${
                                        passwordStrength.value > 50 &&
                                        passwordStrength.value <= 75
                                          ? "text-blue-500"
                                          : ""
                                      }
                                      ${
                                        passwordStrength.value > 75
                                          ? "text-green-500"
                                          : ""
                                      }
                                    `}
                        >
                          {passwordStrength.label}
                        </span>
                      </div>

                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ease-out ${passwordStrength.color}`}
                          style={{ width: `${passwordStrength.value}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <Check
                            className={`h-3 w-3 transition-colors duration-300
                                        ${
                                          passwordForm.newPassword.length >= 8
                                            ? "text-green-500"
                                            : "text-gray-400"
                                        }
                                      `}
                          />
                          <span
                            className={
                              passwordForm.newPassword.length >= 8
                                ? "text-green-700 dark:text-green-400"
                                : "text-gray-500"
                            }
                          >
                            8+ characters
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Check
                            className={`h-3 w-3 transition-colors duration-300
                                        ${
                                          /[A-Z]/.test(passwordForm.newPassword)
                                            ? "text-green-500"
                                            : "text-gray-400"
                                        }
                                      `}
                          />
                          <span
                            className={
                              /[A-Z]/.test(passwordForm.newPassword)
                                ? "text-green-700 dark:text-green-400"
                                : "text-gray-500"
                            }
                          >
                            Uppercase
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Check
                            className={`h-3 w-3 transition-colors duration-300
                                        ${
                                          /\d/.test(passwordForm.newPassword)
                                            ? "text-green-500"
                                            : "text-gray-400"
                                        }
                                      `}
                          />
                          <span
                            className={
                              /\d/.test(passwordForm.newPassword)
                                ? "text-green-700 dark:text-green-400"
                                : "text-gray-500"
                            }
                          >
                            Numbers
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Check
                            className={`h-3 w-3 transition-colors duration-300
                                        ${
                                          /[!@#$%^&*(),.?":{}|<>]/.test(
                                            passwordForm.newPassword
                                          )
                                            ? "text-green-500"
                                            : "text-gray-400"
                                        }
                                      `}
                          />
                          <span
                            className={
                              /[!@#$%^&*(),.?":{}|<>]/.test(
                                passwordForm.newPassword
                              )
                                ? "text-green-700 dark:text-green-400"
                                : "text-gray-500"
                            }
                          >
                            Special chars
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" onClick={handleUpdatePassword}>
                    {isChangingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div> */}
      <div className="space-y-6 rounded-lg border bg-card p-6">
        {/* Section Title */}
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Personal Information
          </h3>
          <p className="text-sm text-muted-foreground">
            Update your personal details
          </p>
        </div>

        <Separator />

        {/* First + Last Name */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              disabled={!isEditMode}
              value={formData.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              placeholder="Enter first name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              disabled={!isEditMode}
              value={formData.lastName}
              onChange={(e) => handleChange("lastName", e.target.value)}
              placeholder="Enter last name"
            />
          </div>
        </div>

        {/* Email + Password */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              disabled
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="Enter email"
            />
          </div>

          {/* Password + Change btn */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            {/* Password Field */}
            <div className="space-y-2 flex-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                disabled
                value="****************"
              />
            </div>

            {/* Change Password Button */}
            <Dialog
              open={changePasswordOpen}
              onOpenChange={setChangePasswordOpen}
            >
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto gap-2"
                >
                  <KeyRound size={18} />
                  Change Password
                </Button>
              </DialogTrigger>

              {/* Password Modal */}
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Change Password</DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                  {/* CURRENT PASSWORD */}
                  <div className="space-y-2">
                    <Label>Current Password</Label>

                    <div className="relative">
                      <Input
                        type={showCurrentPassword ? "text" : "password"}
                        placeholder="Enter current password"
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          handlePasswordChange(
                            "currentPassword",
                            e.target.value
                          )
                        }
                        className="pr-10"
                      />

                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-3 flex items-center text-gray-500"
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>

                    {passwordErrors.currentPassword && (
                      <p className="text-red-500 text-sm">
                        {passwordErrors.currentPassword}
                      </p>
                    )}
                  </div>

                  {/* NEW PASSWORD */}
                  <div className="space-y-2">
                    <Label>New Password</Label>

                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        placeholder="Enter new password"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          handlePasswordChange("newPassword", e.target.value)
                        }
                        className="pr-10"
                      />

                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showNewPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>

                    {passwordErrors.newPassword && (
                      <p className="text-red-500 text-sm">
                        {passwordErrors.newPassword}
                      </p>
                    )}
                  </div>

                  {/* CONFIRM PASSWORD */}
                  <div className="space-y-2">
                    <Label>Confirm Password</Label>

                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          handlePasswordChange(
                            "confirmPassword",
                            e.target.value
                          )
                        }
                        className="pr-10"
                      />

                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showConfirmPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>

                    {passwordErrors.confirmPassword && (
                      <p className="text-red-500 text-sm">
                        {passwordErrors.confirmPassword}
                      </p>
                    )}
                  </div>

                  {/* General Error */}
                  {passwordErrors.general && (
                    <p className="text-red-500 text-sm">
                      {passwordErrors.general}
                    </p>
                  )}

                  {/* PASSWORD STRENGTH UI */}
                  {passwordForm.newPassword.length > 0 && (
                    <div className="space-y-3 p-4 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                      {/* Label + Strength */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          Password Strength
                        </span>

                        <span
                          className={`text-xs font-bold ${passwordStrength.color}`}
                        >
                          {passwordStrength.label}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ease-out ${passwordStrength.color}`}
                          style={{ width: `${passwordStrength.value}%` }}
                        />
                      </div>

                      {/* Requirements */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          {
                            check: passwordForm.newPassword.length >= 8,
                            label: "8+ characters",
                          },
                          {
                            check: /[A-Z]/.test(passwordForm.newPassword),
                            label: "Uppercase",
                          },
                          {
                            check: /\d/.test(passwordForm.newPassword),
                            label: "Numbers",
                          },
                          {
                            check: /[!@#$%^&*(),.?":{}|<>]/.test(
                              passwordForm.newPassword
                            ),
                            label: "Special chars",
                          },
                        ].map((req, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Check
                              className={`h-3 w-3 ${
                                req.check ? "text-green-500" : "text-gray-400"
                              }`}
                            />
                            <span
                              className={
                                req.check
                                  ? "text-green-700 dark:text-green-400"
                                  : "text-gray-500"
                              }
                            >
                              {req.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" onClick={handleUpdatePassword}>
                    {isChangingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Preferences */}
      {user.role !== "moderator" && (
        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />{" "}
              Preferences
            </h3>
            <p className="text-sm text-muted-foreground">
              Configure your preferences to receive personalized questions for
              better responses.
            </p>
            {user.role === "admin" && (
              <p className="text-sm text-yellow-600 mt-2 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                Admin cannot set preferences at this moment.
              </p>
            )}
          </div>
          <Separator />

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2 w-full">
              <Label htmlFor="state">State</Label>
              <Select
                value={formData.preference?.state}
                disabled={!isEditMode || user.role == "admin"}
                onValueChange={(val) => handleChange("preference.state", val)}
              >
                <SelectTrigger id="state" className="w-full">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      <MapPin className="h-4 w-4 mr-2 inline" /> {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 w-full">
              <Label htmlFor="crop">Crop Type</Label>
              <Select
                value={formData.preference?.crop}
                disabled={!isEditMode || user.role == "admin"}
                onValueChange={(val) => handleChange("preference.crop", val)}
              >
                <SelectTrigger id="crop" className="w-full">
                  <SelectValue placeholder="Select crop" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Crops</SelectItem>
                  {CROPS.map((crop) => (
                    <SelectItem key={crop} value={crop}>
                      {crop}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="domain">Domain</Label>
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-muted-foreground" />
              <Input
                id="domain"
                disabled // Need to add drop down here
                // disabled={!isEditMode || user.role == "admin"}
                value={
                  formData.preference?.domain == "all"
                    ? "All"
                    : formData.preference?.domain
                }
                onChange={(e) =>
                  handleChange("preference.domain", e.target.value)
                }
                placeholder="Enter domain (e.g., Nutrient Management)"
              />
            </div>
          </div>
        </div>
      )}

      {/* Save/Cancel Section */}
      {isEditMode && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border bg-muted/50 p-4">
          <span className="text-sm text-muted-foreground text-center sm:text-left">
            Make sure to review all changes before saving.
          </span>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={isUpdating}
              onClick={() => setIsEditMode(false)}
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>

            <ConfirmationModal
              title="Save Profile Changes?"
              description="Are you sure you want to save the changes to your profile? Your updates will be applied immediately."
              confirmText="Save"
              cancelText="Cancel"
              onConfirm={async () => {
                await handleSave();
              }}
              trigger={
                <Button
                  type="button"
                  disabled={isUpdating}
                  className="flex items-center gap-2 w-full sm:w-auto"
                >
                  <Save className="h-4 w-4" />
                  {isUpdating ? "Saving..." : "Save Changes"}
                </Button>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};
