import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Eye, EyeOff } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/atoms/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/atoms/tabs";

const WEB_APP_ROLES = [
  { label: "Farmer", value: "FARMER" },
  { label: "Coordinator", value: "COORDINATOR" },
  { label: "Internal", value: "INTERNAL" },
] as const;

const REVIEW_SYSTEM_ROLES = [
  { label: "District Coordinator", value: "district_coordinator" },
  { label: "Block Coordinator", value: "block_coordinator" },
  { label: "Village Coordinator", value: "village_coordinator" },
] as const;

type ModalMode = "web_app" | "review_system";
type WebAppRole = (typeof WEB_APP_ROLES)[number]["value"];
type ReviewSystemRole = (typeof REVIEW_SYSTEM_ROLES)[number]["value"];
type UserRole = WebAppRole | ReviewSystemRole;

interface AddFarmerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSaving?: boolean;
  onSave: (payload: {
    email: string;
    name: string;
    password: string;
    userRole?: string;
    role?: ReviewSystemRole;
    isVerified?: boolean;
    target: ModalMode;
  }) => void | Promise<void>;
}

export function AddFarmerModal({
  open,
  onOpenChange,
  isSaving = false,
  onSave,
}: AddFarmerModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState<UserRole>("FARMER");
  const [mode, setMode] = useState<ModalMode>("web_app");
  const [isVerified, setIsVerified] = useState(true);
  const roleOptions = mode === "web_app" ? WEB_APP_ROLES : REVIEW_SYSTEM_ROLES;
  const selectedRoleLabel =
    roleOptions.find((userRole) => userRole.value === role)?.label ??
    (mode === "web_app" ? "Farmer" : "Coordinator");
  const addButtonLabel =
    mode === "review_system" ? "Add Cordinator" : `Add ${selectedRoleLabel}`;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setMode("web_app");
      setRole("FARMER");
      setIsVerified(true);
      setErrors({});
    }
  }, [open]);

  const handleModeChange = (nextMode: ModalMode) => {
    setMode(nextMode);
    setRole(nextMode === "web_app" ? "FARMER" : "district_coordinator");
    setIsVerified(true);
    setErrors((prev) => ({ ...prev, role: "" }));
  };

const validate = () => {
  const newErrors: Record<string, string> = {};

  // Name
  if (!name.trim()) {
    newErrors.name = "Name is required.";
  }

  // Email
  if (!email.trim()) {
    newErrors.email = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    newErrors.email = "Please enter a valid email address.";
  }

  if (!role) {
    newErrors.role = "User role is required";
  }

  // Password
  if (!password.trim()) {
    newErrors.password = "Password is required.";
  } else if (password.length < 8) {
    newErrors.password =
      "Password must be at least 8 characters.";
  } else if (!/[A-Z]/.test(password)) {
    newErrors.password =
      "Password must contain at least one uppercase letter.";
  } else if (!/[a-z]/.test(password)) {
    newErrors.password =
      "Password must contain at least one lowercase letter.";
  } else if (!/[0-9]/.test(password)) {
    newErrors.password =
      "Password must contain at least one number.";
  }

  // Confirm Password
  if (!confirmPassword.trim()) {
    newErrors.confirmPassword =
      "Please confirm your password.";
  } else if (password !== confirmPassword) {
    newErrors.confirmPassword =
      "Passwords do not match.";
  }

  setErrors(newErrors);

  return Object.keys(newErrors).length === 0;
};

  const handleSave = async () => {
    if (!validate()) return;
    await onSave({
      name: name.trim(),
      email: email.trim(),
      password,
      userRole: mode === "web_app" ? role : undefined,
      role: mode === "review_system" ? (role as ReviewSystemRole) : undefined,
      isVerified,
      target: mode,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[92vw] max-w-[420px] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl sm:max-w-[420px] dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
        <DialogHeader className="shrink-0 px-5 pb-3 pt-5">
          <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Add User
          </DialogTitle>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Create a new user profile. The credentials will be registered.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-2">
          <Tabs value={mode} onValueChange={(value) => handleModeChange(value as ModalMode)}>
            <TabsList className="grid h-9 w-full grid-cols-2">
              <TabsTrigger value="web_app">Web App</TabsTrigger>
              <TabsTrigger value="review_system">Review System</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Full Name <span className="text-red-500">*</span>
            </label>
            <Input
              name="new-farmer-name"
              autoComplete="off"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) {
                  setErrors((prev) => ({ ...prev, name: "" }));
                }
              }}
              placeholder="e.g. Abiram K"
              className={`h-10 rounded-xl px-3 text-sm border bg-transparent ${
                errors.name
                  ? "border-red-500 focus-visible:ring-red-500"
                  : "border-slate-200 dark:border-white/[0.08]"
              }`}
            />
            {errors.name && (
              <span className="text-xs text-red-500 font-medium pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {errors.name}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Email Address <span className="text-red-500">*</span>
            </label>
            <Input
              name="new-farmer-email"
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) {
                  setErrors((prev) => ({ ...prev, email: "" }));
                }
              }}
              placeholder="e.g. abiramk@gmail.com"
              type="email"
              className={`h-10 rounded-xl px-3 text-sm border bg-transparent ${
                errors.email
                  ? "border-red-500 focus-visible:ring-red-500"
                  : "border-slate-200 dark:border-white/[0.08]"
              }`}
            />
            {errors.email && (
              <span className="text-xs text-red-500 font-medium pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {errors.email}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              User Role <span className="text-red-500">*</span>
            </label>

            <RadioGroup
              value={role}
              onValueChange={(value) => setRole(value as UserRole)}
              className={
                mode === "review_system"
                  ? "grid grid-cols-1 gap-2"
                  : "grid grid-cols-1 gap-2 sm:grid-cols-2"
              }
            >
              {roleOptions.map((item) => (
                <label
                  key={item.value}
                  className={`flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all ${
                    role === item.value
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <RadioGroupItem value={item.value} className="shrink-0" />
                  <span className="min-w-0 text-sm font-medium leading-tight">
                    {item.label}
                  </span>
                </label>
              ))}
            </RadioGroup>

            {errors.role && (
              <span className="text-xs text-red-500 font-medium pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {errors.role}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Verification Status
            </label>

            <RadioGroup
              value={isVerified ? "verified" : "unverified"}
              onValueChange={(value) => setIsVerified(value === "verified")}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
                  isVerified
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <RadioGroupItem value="verified" />
                <span className="text-sm font-medium">Verified</span>
              </label>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
                  !isVerified
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <RadioGroupItem value="unverified" />
                <span className="text-sm font-medium">Not Verified</span>
              </label>
            </RadioGroup>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Password <span className="text-red-500">*</span>
            </label>

            <div className="relative">
              <Input
                name="new-farmer-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);

                  if (errors.password) {
                    setErrors((prev) => ({
                      ...prev,
                      password: "",
                    }));
                  }
                }}
                placeholder="********"
                type={showPassword ? "text" : "password"}
                className={`h-10 rounded-xl px-3 pr-10 text-sm border bg-transparent ${
                  errors.password
                    ? "border-red-500 focus-visible:ring-red-500"
                    : "border-slate-200 dark:border-white/[0.08]"
                }`}
              />

              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {errors.password && (
              <span className="text-xs text-red-500 font-medium pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {errors.password}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Confirm Password <span className="text-red-500">*</span>
            </label>

            <div className="relative">
              <Input
                name="new-farmer-confirm-password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);

                  if (errors.confirmPassword) {
                    setErrors((prev) => ({
                      ...prev,
                      confirmPassword: "",
                    }));
                  }
                }}
                placeholder="********"
                type={showConfirmPassword ? "text" : "password"}
                className={`h-10 rounded-xl px-3 pr-10 text-sm border bg-transparent ${
                  errors.confirmPassword
                    ? "border-red-500 focus-visible:ring-red-500"
                    : "border-slate-200 dark:border-white/[0.08]"
                }`}
              />

              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {errors.confirmPassword && (
              <span className="text-xs text-red-500 font-medium pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {errors.confirmPassword}
              </span>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 flex justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-white/[0.05]">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="h-9 px-4 rounded-xl text-sm"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="h-9 px-5 rounded-xl text-sm bg-primary hover:bg-primary/95 text-white"
          >
            {isSaving ? "Adding..." : addButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
