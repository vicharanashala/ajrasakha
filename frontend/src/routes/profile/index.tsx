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
import toast from "react-hot-toast";
import {
  Edit2,
  ArrowLeft,
  User,
  Briefcase,
  MapPin,
  Leaf,
  Network,
  Save,
  XCircle,
  ShieldCheck,
  Settings,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/profile/")({
  component: ProfilePage,
});

export default function ProfilePage() {
  const { data: user, isLoading } = useGetCurrentUser();
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
      <div className="mx-auto  px-6 py-8 max-w-[60%]">
        {/* Header with Back Button */}
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
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

  return (
    <div className="space-y-8 w-[70vw]">
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row items-center md:items-start justify-between rounded-lg border bg-card p-6 gap-4 md:gap-6">
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
      </div>

      {/* Personal Info */}
      <div className="space-y-6 rounded-lg border bg-card p-6">
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
        </div>
      </div>

      {/* Preferences */}
      <div className="space-y-6 rounded-lg border bg-card p-6">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" /> Preferences
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
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Select
              value={formData.preference?.state}
              disabled={!isEditMode || user.role == "admin"}
              onValueChange={(val) => handleChange("preference.state", val)}
            >
              <SelectTrigger id="state">
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

          <div className="space-y-2">
            <Label htmlFor="crop">Crop Type</Label>
            <Select
              value={formData.preference?.crop}
              disabled={!isEditMode || user.role == "admin"}
              onValueChange={(val) => handleChange("preference.crop", val)}
            >
              <SelectTrigger id="crop">
                <SelectValue placeholder="Select crop" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Crops</SelectItem>
                {CROPS.map((crop) => (
                  <SelectItem key={crop} value={crop}>
                    {/* <Leaf className="h-4 w-4 mr-2 inline" />  */}
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
              disabled={!isEditMode || user.role == "admin"}
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

      {/* Save/Cancel Section */}
      {isEditMode && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
          <span className="text-sm text-muted-foreground">
            Make sure to review all changes before saving.
          </span>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isUpdating}
              onClick={() => setIsEditMode(false)}
              className="flex items-center gap-2"
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
                  className="flex items-center gap-2"
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
