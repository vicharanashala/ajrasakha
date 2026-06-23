import { pae_domains as DOMAINS } from "@/components/MetaData";
import { useGetStates } from "@/hooks/api/location/useLocations";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/atoms/avatar";
import { MultiSelect } from "@/components/atoms/MultiSelect";
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
import { useCallback, useState, useRef } from "react";
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
import { toast, useToast } from "@/shared/components/toast";

export const Route = createFileRoute("/profile/")({
  component: ProfilePage,
});

export default function ProfilePage() {
  const { data: user, isLoading } = useGetCurrentUser({});
  const { mutateAsync: updateUser, isPending: isUpdating } = useEditUser();
  const { success: toastSuccess, loading:toastLoading, dismiss: toastDismiss} = useToast();

  const handleSubmit = async (data: IUser, showToast: boolean = true, id?: string) => {
    let currentToastId;
    if (showToast) {
      currentToastId = toastLoading("Saving profile...", {
        desc: "Please wait while we update your details.",
      });
    } else {
      currentToastId = id;
    }
    try {
      await updateUser(data);
      toastDismiss(currentToastId);
      if (showToast) {
        toastSuccess("Profile updated!");
      }
    } catch (error) {
      toastDismiss(currentToastId);
      console.error(error);
      throw error;
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
  onSubmit?: (data: IUser, showToast?: boolean, id?: string) => Promise<void> | void;
  isUpdating: boolean;
};

const OTHER_DOMAIN_VALUE = "other";

const isPresetDomain = (domain?: string | string[]) => {
  if (!domain || Array.isArray(domain)) return false;
  return domain === "all" || DOMAINS.includes(domain);
};

const validateCustomDomain = (value: string) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "Please enter a domain.";
  }

  if (trimmedValue.length < 2) {
    return "Domain must be at least 2 characters.";
  }

  if (trimmedValue.length > 100) {
    return "Domain must be 100 characters or less.";
  }

  if (!/^[A-Za-z0-9\s&(),./-]+$/.test(trimmedValue)) {
    return "Domain contains invalid characters.";
  }

  return "";
};

const validateMobile = (value: string) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "Mobile number is required.";
  }

  if (!/^\+\d{1,4}[\s-]?\d{6,14}$/.test(trimmedValue)) {
    return "Enter a valid mobile number with country code, for example +91 9876543210.";
  }

  return "";
};

const validateUniversity = (value: string) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "University is required.";
  }

  if (trimmedValue.length < 2) {
    return "University must be at least 2 characters.";
  }

  if (trimmedValue.length > 120) {
    return "University must be 120 characters or less.";
  }

  if (!/^[A-Za-z0-9\s&(),./'-]+$/.test(trimmedValue)) {
    return "University contains invalid characters.";
  }

  return "";
};

const ProfileForm = ({ user, onSubmit, isUpdating }: ProfileFormProps) => {
  const { success: toastSuccess, error: toastError, loading:toastLoading} = useToast();
  const [formData, setFormData] = useState<IUser>({
    ...user,
    preference: {
      state: user?.preference?.state ?? "",
      crop: user?.preference?.crop ?? "",
      domain: user?.preference?.domain ?? "all",
    },
  });

  const { data: statesResponse = [] } = useGetStates();
  const stateOptions = statesResponse.map((s) => s.stateNameEnglish);

  const presetDomainSet = new Set(DOMAINS.filter((d) => d !== "Others"));

  const [selectedDomains, setSelectedDomains] = useState<string[]>(() =>
    Array.isArray(user?.preference?.domain)
      ? user.preference.domain.filter((d) => presetDomainSet.has(d))
      : []
  );
  const [customOtherDomains, setCustomOtherDomains] = useState<string[]>(() =>
    Array.isArray(user?.preference?.domain)
      ? user.preference.domain.filter((d) => !presetDomainSet.has(d))
      : []
  );
  const [paeOtherDomain, setPaeOtherDomain] = useState("");
  const [paeOtherDomainError, setPaeOtherDomainError] = useState("");

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
  const stringDomain = typeof user?.preference?.domain === "string" ? user.preference.domain : "";
  const [domainSelection, setDomainSelection] = useState(() =>
    isPresetDomain(stringDomain) ? (stringDomain ?? "") : OTHER_DOMAIN_VALUE,
  );
  const [customDomain, setCustomDomain] = useState(() =>
    isPresetDomain(stringDomain) ? "" : stringDomain,
  );
  const [domainError, setDomainError] = useState("");
  const [profileErrors, setProfileErrors] = useState({
    mobile: "",
    university: "",
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const { user: userFromStore } = useAuthStore();
  const [avatarPreview, setAvatarPreview] = useState<string>(
      userFromStore?.avatar || "",
    );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toastError("Please select a valid image file");
      return;
    }
    if (file.size > 70 * 1024) {
      toastError("Image size must be less than 70KB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setAvatarPreview(base64);
      handleChange("avatar", base64);
      setIsUploadingAvatar(true);
      const toastId = toastLoading("Updating profile Picture...", {
        desc: "Please wait while we update your details.",
      })
      try {
        await onSubmit?.({ ...formData, avatar: base64 }, false,toastId);
        useAuthStore.getState().updateUser({ avatar: base64 });
        toastSuccess("Profile picture updated!");
      } catch (error) {
        toastError("Failed to update profile picture");
        setAvatarPreview(userFromStore?.avatar || "");
        if (fileInputRef.current) fileInputRef.current.value = "";
      } finally {
        setIsUploadingAvatar(false);
      }
    };
    reader.readAsDataURL(file);
  };

 const handleRemoveAvatar = async () => {
  const toastId = toastLoading("Removing profile Picture...", {
        desc: "Please wait while we update your details.",
      })
   try {
     setIsRemovingAvatar(true);
     const updatedData = { ...formData, avatar: "" };
     setAvatarPreview("");
     setFormData(updatedData);
     await onSubmit?.(updatedData, false, toastId);
     useAuthStore.getState().updateUser({ avatar: "" });
     if (fileInputRef.current) fileInputRef.current.value = "";
     toastSuccess("Profile picture removed!");
   } catch (error) {
     toastError("Failed to remove profile picture");
   } finally {
     setIsRemovingAvatar(false);
   }
 };

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
      const mobileError = validateMobile(formData.mobile ?? "");
      const universityError = validateUniversity(formData.university ?? "");

      if (mobileError || universityError) {
        setProfileErrors({
          mobile: mobileError,
          university: universityError,
        });

        toastError(mobileError || universityError);
        return;
      }

      const isOtherDomainSelected = user.role !== "pae_expert" && domainSelection === OTHER_DOMAIN_VALUE;

      if (isOtherDomainSelected) {
        const customDomainError = validateCustomDomain(customDomain);

        if (customDomainError) {
          setDomainError(customDomainError);
          toastError(customDomainError);
          return;
        }
      }

      if (user.role === "pae_expert" && selectedDomains.includes(OTHER_DOMAIN_VALUE)) {
        const err = validateCustomDomain(paeOtherDomain);
        if (err) {
          setPaeOtherDomainError(err);
          toastError(err);
          return;
        }
      }

      const normalizedDomain =
        formData.preference?.domain === "" || formData.preference?.domain === "All"
          ? "all"
          : isOtherDomainSelected
            ? customDomain.trim()
            : (formData.preference?.domain ?? "all");

      const payload: IUser = {
        ...formData,
        mobile: formData.mobile?.trim(),
        university: formData.university?.trim(),
        preference: {
          state: formData.preference?.state ?? "",
          crop: formData.preference?.crop ?? "",
          domain: user.role === "pae_expert"
            ? (() => {
                const resolved = selectedDomains
                  .map((d) => (d === OTHER_DOMAIN_VALUE ? paeOtherDomain.trim() : d))
                  .filter(Boolean);
                const newCustom = paeOtherDomain.trim() && selectedDomains.includes(OTHER_DOMAIN_VALUE)
                  ? [...customOtherDomains, paeOtherDomain.trim()]
                  : customOtherDomains;
                const all = [...resolved.filter((d) => presetDomainSet.has(d)), ...newCustom];
                return all.length > 0 ? all : "all";
              })()
            : normalizedDomain,
        },
      };

      await onSubmit?.(payload);
      setFormData(payload);
      const strDomain = typeof normalizedDomain === "string" ? normalizedDomain : "";
      setDomainSelection(isPresetDomain(strDomain) ? strDomain : OTHER_DOMAIN_VALUE);
      setCustomDomain(isPresetDomain(strDomain) ? "" : strDomain);

      if (user.role === "pae_expert") {
        const savedDomains = Array.isArray(payload.preference?.domain) ? payload.preference.domain as string[] : [];
        setSelectedDomains(savedDomains.filter((d) => presetDomainSet.has(d)));
        setCustomOtherDomains(savedDomains.filter((d) => !presetDomainSet.has(d)));
        setPaeOtherDomain("");
        setPaeOtherDomainError("");
      }

      if (payload.avatar) {
        useAuthStore.getState().updateUser({ avatar: payload.avatar });
      }
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


    // -------- VALIDATION --------
    if (!currentPassword || currentPassword.length < 6) {
      newErrors.currentPassword = "Incorrect current password.";
    }

    if (!newPassword) {
      newErrors.newPassword = "New password is required.";
    } else {

      if (newPassword.length < 6) {
        newErrors.newPassword = "New password must be at least 6 characters.";
      }

      if (newPassword === currentPassword) {
        newErrors.newPassword =
          "New password cannot be the same as the current password.";
      }
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = "Please confirm your new password.";
    } else if (confirmPassword !== newPassword) {
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
    const update = await toast.promise(updateUserPassword(newPassword),{
      loading: "Updating password...",
      success: "Password updated successfully!",
      error: "Failed to update password. Try again!",
    });

    if (!update.success) {
      setPasswordErrors((prev) => ({
        ...prev,
        general: "Failed to update password. Try again.",
      }));
      setIsChangingPassword(false);
      return;
    }

    // Success
    // toastSuccess("Password updated successfully!");
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
  const domainOptions = DOMAINS.filter((domain) => domain !== "Others");

  return (
    <div className="space-y-8">
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
                        : user.role === "tester"
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
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
              Click on the profile picture to update it
            </p>
            {avatarPreview && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={isUploadingAvatar}
                className="text-xs text-red-500 hover:text-red-600 underline text-center sm:text-left w-fit disabled:opacity-50"
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
            className="flex items-center gap-2"
            onClick={() => setIsEditMode((prev) => !prev)}
            disabled={isUpdating}
          >
            <Edit2 className="h-4 w-4" />
            {isEditMode ? "Cancel Edit" : "Edit Profile"}
          </Button>
        </div>
      </div>
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

        {/* Mobile Number + University Name */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile</Label>
            <Input
              id="mobile"
              disabled={!isEditMode}
              value={formData.mobile}
              onChange={(e) => {
                const value = e.target.value;
                handleChange("mobile", value);

                if (profileErrors.mobile) {
                  setProfileErrors((prev) => ({
                    ...prev,
                    mobile: validateMobile(value),
                  }));
                }
              }}
              onBlur={() =>
                setProfileErrors((prev) => ({
                  ...prev,
                  mobile: validateMobile(formData.mobile ?? ""),
                }))
              }
              placeholder="mobile number "
            />
            {profileErrors.mobile && (
              <p className="text-sm text-red-500">{profileErrors.mobile}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="university">University</Label>
            <Input
              id="university"
              disabled={!isEditMode}
              value={formData.university}
              onChange={(e) => {
                const value = e.target.value;
                handleChange("university", value);

                if (profileErrors.university) {
                  setProfileErrors((prev) => ({
                    ...prev,
                    university: validateUniversity(value),
                  }));
                }
              }}
              onBlur={() =>
                setProfileErrors((prev) => ({
                  ...prev,
                  university: validateUniversity(formData.university ?? ""),
                }))
              }
              placeholder="university"
            />
            {profileErrors.university && (
              <p className="text-sm text-red-500">{profileErrors.university}</p>
            )}
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
                            e.target.value,
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
                            e.target.value,
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
                              passwordForm.newPassword,
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
      {user.role !== "moderator" && user.role !== "tester" && (
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
                  {stateOptions.map((state) => (
                    <SelectItem key={state} value={state}>
                      <MapPin className="h-4 w-4 mr-2 inline" /> {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* <div className="space-y-2 w-full">
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
            </div> */}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="domain">Domain{user.role === "pae_expert" ? "s" : ""}</Label>
              {user.role === "pae_expert" && Array.isArray(formData.preference?.domain) && formData.preference.domain.length > 0 && (
                <span className="text-xs font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full border border-border">
                  {formData.preference.domain.length}
                </span>
              )}
            </div>
            {user.role === "pae_expert" ? (
              <div className="space-y-3">
                {isEditMode ? (
                  <>
                    <MultiSelect
                      items={[
                        ...domainOptions.map((d) => ({ value: d, label: d })),
                        { value: OTHER_DOMAIN_VALUE, label: "Others" },
                      ]}
                      selected={selectedDomains}
                      onChange={(next) => {
                        setSelectedDomains(next);
                        if (!next.includes(OTHER_DOMAIN_VALUE)) {
                          setPaeOtherDomain("");
                          setPaeOtherDomainError("");
                        }
                      }}
                      placeholder="Select domains"
                      direction="up"
                    />
                    {selectedDomains.includes(OTHER_DOMAIN_VALUE) && (
                      <div className="space-y-1">
                        <Input
                          placeholder="Others (Please mention)"
                          value={paeOtherDomain}
                          onChange={(e) => {
                            setPaeOtherDomain(e.target.value);
                            if (paeOtherDomainError) setPaeOtherDomainError(validateCustomDomain(e.target.value));
                          }}
                          onBlur={() => setPaeOtherDomainError(validateCustomDomain(paeOtherDomain))}
                        />
                        {paeOtherDomainError && (
                          <p className="text-sm text-red-500">{paeOtherDomainError}</p>
                        )}
                      </div>
                    )}
                    {customOtherDomains.length > 0 && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <button
                            type="button"
                            className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors w-fit"
                          >
                            Others ({customOtherDomains.length})
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-sm">
                          <DialogHeader>
                            <DialogTitle>Others</DialogTitle>
                          </DialogHeader>
                          <div className="overflow-y-auto max-h-64 space-y-2 pr-1">
                            {customOtherDomains.map((d) => (
                              <div
                                key={d}
                                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                              >
                                <span className="flex items-center gap-2">
                                  <Network className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  {d}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setCustomOtherDomains((prev) => prev.filter((x) => x !== d))}
                                  className="text-muted-foreground hover:text-destructive transition-colors text-base leading-none"
                                  aria-label={`Remove ${d}`}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </>
                ) : Array.isArray(formData.preference?.domain) && formData.preference.domain.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(formData.preference.domain as string[]).map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1.5 bg-muted text-foreground text-xs font-medium px-3 py-1.5 rounded-md border border-border"
                      >
                        <Network className="h-3 w-3 shrink-0 text-muted-foreground" />
                        {d}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-sm text-muted-foreground">
                    All Domain
                  </div>
                )}
              </div>
            ) : (
              <>
                <Select
                  value={domainSelection}
                  disabled={!isEditMode || user.role == "admin"}
                  onValueChange={(val) => {
                    setDomainError("");
                    setDomainSelection(val);

                    if (val === OTHER_DOMAIN_VALUE) {
                      handleChange("preference.domain", customDomain);
                      return;
                    }

                    handleChange("preference.domain", val);
                  }}
                >
                  <SelectTrigger id="domain" className="w-full">
                    <SelectValue placeholder="Select domain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Domain</SelectItem>
                    {domainOptions.map((domain) => (
                      <SelectItem key={domain} value={domain}>
                        <Network className="h-4 w-4 mr-2 inline" /> {domain}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER_DOMAIN_VALUE}>
                      <Network className="h-4 w-4 mr-2 inline" /> Other
                    </SelectItem>
                  </SelectContent>
                </Select>
                {domainSelection === OTHER_DOMAIN_VALUE && (
                  <div className="space-y-2">
                    <Input
                      id="custom-domain"
                      disabled={!isEditMode || user.role == "admin"}
                      value={customDomain}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCustomDomain(value);
                        handleChange("preference.domain", value);

                        if (domainError) {
                          setDomainError(validateCustomDomain(value));
                        }
                      }}
                      onBlur={() => {
                        setDomainError(validateCustomDomain(customDomain));
                      }}
                      placeholder="Enter your domain"
                    />
                    {domainError && (
                      <p className="text-sm text-red-500">{domainError}</p>
                    )}
                  </div>
                )}
              </>
            )}
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
                  onClick={(e) => {
                    if (!formData.firstName.trim()) {
                      e.preventDefault();
                      toastError("First name cannot be blank space");
                      return;
                    }

                    const mobileError = validateMobile(formData.mobile ?? "");
                    const universityError = validateUniversity(
                      formData.university ?? "",
                    );

                    if (mobileError || universityError) {
                      e.preventDefault();
                      setProfileErrors({
                        mobile: mobileError,
                        university: universityError,
                      });
                      toastError(mobileError || universityError);
                      return;
                    }

                    if (user.role !== "pae_expert" && domainSelection === OTHER_DOMAIN_VALUE) {
                      const customDomainError = validateCustomDomain(customDomain);

                      if (customDomainError) {
                        e.preventDefault();
                        setDomainError(customDomainError);
                        toastError(customDomainError);
                      }
                    }
                  }}
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
