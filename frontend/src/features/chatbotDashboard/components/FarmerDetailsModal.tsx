import { type ReactNode, useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  MapPin,
  Pencil,
  Trash2,
  UserCheck2,
  ShieldX,
} from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { type UserDetail } from "../hooks/useUserDetails";
import { motion, AnimatePresence } from "framer-motion";

const EMPTY_VALUE = "Not provided";

const PASSWORD_RULES = [
  {
    label: "At least 8 characters",
    test: (password: string) => password.length >= 8,
  },
  {
    label: "One uppercase letter",
    test: (password: string) => /[A-Z]/.test(password),
  },
  {
    label: "One lowercase letter",
    test: (password: string) => /[a-z]/.test(password),
  },
  {
    label: "One number",
    test: (password: string) => /[0-9]/.test(password),
  },
  {
    label: "One special character",
    test: (password: string) => /[^A-Za-z0-9]/.test(password),
  },
];

function EmptyValue() {
  return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  const hasValue = value !== null && value !== undefined && value !== "";

  return (
    <div className="rounded-md border bg-card/60 p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-foreground break-words">
        {hasValue ? value : <EmptyValue />}
      </dd>
    </div>
  );
}

function BooleanValue({ value }: { value?: boolean }) {
  if (value == null) return <EmptyValue />;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        value
          ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
          : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
      }`}
    >
      {value ? "Yes" : "No"}
    </span>
  );
}

function ListValue({ value }: { value?: string | string[] | null }) {
  const items = Array.isArray(value)
    ? value
    : value
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  if (items.length === 0) return <EmptyValue />;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded bg-muted px-2 py-0.5 text-xs font-medium"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function LatestPlatform({ user }: { user: UserDetail }) {
  const fp = user.farmerProfile;
  const latestPlatform =
    fp?.platformHistory && fp.platformHistory.length > 0
      ? fp.platformHistory[fp.platformHistory.length - 1]
      : null;

  if (latestPlatform) {
    return (
      <span>
        {latestPlatform.os}{" "}
        <span className="text-muted-foreground">
          ({new Date(latestPlatform.timestamp).toLocaleDateString("en-IN")})
        </span>
      </span>
    );
  }

  return fp?.platform ? <span>{fp.platform}</span> : <EmptyValue />;
}

function PlatformHistory({ user }: { user: UserDetail }) {
  const history = user.farmerProfile?.platformHistory ?? [];

  if (history.length === 0) return <EmptyValue />;

  return (
    <div className="space-y-1">
      {history.map((entry, index) => (
        <div key={`${entry.os}-${entry.timestamp}-${index}`}>
          {entry.os}{" "}
          <span className="text-muted-foreground">
            {new Date(entry.timestamp).toLocaleString("en-IN")}
          </span>
        </div>
      ))}
    </div>
  );
}

interface FarmerDetailsModalProps {
  user: UserDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onEdit: (user: UserDetail) => void;
  onDelete: (user: UserDetail) => void;
  isChangingPassword?: boolean;
  onChangePassword?: (payload: {newPassword: string, keepLoggedIn: boolean}) => void | Promise<void>;
  isUpdatingVerification?: boolean;
  onVerificationChange?: (isVerified: boolean) => void | Promise<void>;
}

export function FarmerDetailsModal({
  user,
  open,
  onOpenChange,
  isAdmin,
  onEdit,
  onDelete,
  isChangingPassword = false,
  onChangePassword,
  isUpdatingVerification = false,
  onVerificationChange,
}: FarmerDetailsModalProps) {
  const fp = user?.farmerProfile;
  const isUserVerified = user?.isVerified ?? true;
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>(
    {},
  );
  const [confirmPasswordChangeOpen, setConfirmPasswordChangeOpen] =
    useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);

  useEffect(() => {
    if (!open) {
      setPasswordOpen(false);
    }
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setPasswordErrors({});
    setConfirmPasswordChangeOpen(false);
  }, [open, user?.userId]);

  const validatePasswordFields = () => {
    const nextErrors: Record<string, string> = {};

    if (!newPassword.trim()) {
      nextErrors.newPassword = "Password is required.";
    } else if (newPassword.length < 8) {
      nextErrors.newPassword = "Password must be at least 8 characters.";
    } else if (!/[A-Z]/.test(newPassword)) {
      nextErrors.newPassword =
        "Password must contain at least one uppercase letter.";
    } else if (!/[a-z]/.test(newPassword)) {
      nextErrors.newPassword =
        "Password must contain at least one lowercase letter.";
    } else if (!/[0-9]/.test(newPassword)) {
      nextErrors.newPassword = "Password must contain at least one number.";
    } else if (!/[^A-Za-z0-9]/.test(newPassword)) {
      nextErrors.newPassword =
        "Password must contain at least one special character.";
    }

    if (!confirmPassword.trim()) {
      nextErrors.confirmPassword = "Please confirm your password.";
    } else if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setPasswordErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleChangePasswordClick = () => {
    if (!validatePasswordFields()) return;
    setConfirmPasswordChangeOpen(true);
  };

  const handleConfirmPasswordChange = async () => {
    if (!onChangePassword || !validatePasswordFields()) return;

    try {
      await onChangePassword({newPassword, keepLoggedIn});
      setNewPassword("");
      setConfirmPassword("");
      setPasswordErrors({});
      setConfirmPasswordChangeOpen(false);
      setPasswordOpen(false);
    } catch (error) {
      setPasswordErrors({
        newPassword:
          error instanceof Error
            ? error.message
            : "Failed to change password.",
      });
      setConfirmPasswordChangeOpen(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isChangingPassword) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="!max-w-4xl w-[95vw] max-h-[90vh] p-0 gap-0 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col max-h-[90vh]"
        >
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/60">
            <DialogTitle className="text-lg font-semibold">Farmer Details</DialogTitle>
          </DialogHeader>

        {user && (
          <ScrollArea className="flex-1 px-6 py-5">
            <div className="space-y-5 pr-4">
            <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="flex min-w-0 items-center gap-1.5 text-base font-semibold">
                  <span className="truncate">
                    {user.name || fp?.farmerName || EMPTY_VALUE}
                  </span>
                  {!isUserVerified && (
                    <ShieldX className="h-4 w-4 shrink-0 text-orange-500" />
                  )}
                </h3>
                <p className="break-all text-sm text-muted-foreground">
                  {user.email || EMPTY_VALUE}
                </p>
                <div
                  className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    isUserVerified
                      ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                      : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
                  }`}
                >
                  {isUserVerified ? "Verified" : "Not Verified"}
                </div>
              </div>

              {isAdmin && (
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {onVerificationChange && (
                    <Button
                      size="sm"
                      disabled={isUpdatingVerification}
                      className={isUserVerified 
                        ? "bg-orange-800 hover:bg-orange-900 text-white gap-1.5" 
                        : "bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                      }
                      onClick={() =>
                        onVerificationChange(!isUserVerified)
                      }
                    >
                  {isUserVerified ? (
                    <ShieldX className="h-4 w-4" />
                  ) : (
                    <UserCheck2 className="h-4 w-4" />
                  )}
                      {isUserVerified ? "Set Unverified" : "Set Verified"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(user)}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(user)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
            {isAdmin && onChangePassword && (
              
              <section className="rounded-md border bg-card/60 overflow-hidden">
                <motion.button
                  type="button"
                  onClick={() => setPasswordOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left group rounded-lg transition-colors hover:bg-accent/50"
                  whileTap={{ scale: 0.995 }}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <motion.div
                      whileHover={{ rotate: 15, scale: 1.1 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 15,
                      }}
                    >
                      <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </motion.div>
                    <span>
                      <span className="block text-sm font-semibold">
                        Change Password
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Set a new password for this user.
                      </span>
                    </span>
                  </span>
                  <motion.div
                    animate={{ rotate: passwordOpen ? 180 : 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </motion.div>
                </motion.button>

                <AnimatePresence initial={false}>
                  {passwordOpen && (
                    <motion.div
                      key="password-content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                        opacity: { duration: 0.2, ease: "easeInOut" },
                      }}
                      className="overflow-hidden"
                    >
                      <motion.div
                        initial={{ y: -8 }}
                        animate={{ y: 0 }}
                        exit={{ y: -8 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="border-t p-4"
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <PasswordInput
                            label="New Password"
                            value={newPassword}
                            visible={showNewPassword}
                            error={passwordErrors.newPassword}
                            onChange={(value) => {
                              setNewPassword(value);
                              setPasswordErrors((prev) => ({
                                ...prev,
                                newPassword: "",
                              }));
                            }}
                            onToggleVisible={() =>
                              setShowNewPassword((prev) => !prev)
                            }
                          />
                          <PasswordInput
                            label="Confirm Password"
                            value={confirmPassword}
                            visible={showConfirmPassword}
                            error={passwordErrors.confirmPassword}
                            onChange={(value) => {
                              setConfirmPassword(value);
                              setPasswordErrors((prev) => ({
                                ...prev,
                                confirmPassword: "",
                              }));
                            }}
                            onToggleVisible={() =>
                              setShowConfirmPassword((prev) => !prev)
                            }
                          />
                        </div>

                        <div className="flex items-center gap-2 mt-4">
                          <input
                            id="keepLoggedIn"
                            type="checkbox"
                            checked={keepLoggedIn}
                            onChange={(e) => setKeepLoggedIn(e.target.checked)}
                          />
                          <label htmlFor="keepLoggedIn">
                            Keep user logged in for active sessions
                          </label>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {PASSWORD_RULES.map((rule, i) => {
                            const passed = rule.test(newPassword);
                            return (
                              <motion.div
                                key={rule.label}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.05 * i, duration: 0.2 }}
                                className={`flex items-center gap-2 text-xs transition-colors ${
                                  passed
                                    ? "text-emerald-600"
                                    : "text-muted-foreground"
                                }`}
                              >
                                <motion.span
                                  animate={{ scale: passed ? [1, 1.3, 1] : 1 }}
                                  transition={{ duration: 0.3 }}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </motion.span>
                                {rule.label}
                              </motion.div>
                            );
                          })}
                        </div>

                        <AnimatePresence>
                          {confirmPasswordChangeOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -6, height: 0 }}
                              animate={{ opacity: 1, y: 0, height: "auto" }}
                              exit={{ opacity: 0, y: -6, height: 0 }}
                              transition={{ duration: 0.25, ease: "easeOut" }}
                              className="mt-4 overflow-hidden"
                            >
                              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                                <div className="flex items-start gap-2">
                                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                                      Change this user&apos;s password?
                                    </p>
                                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                                      The new password will replace the existing
                                      password.
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-3 flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={isChangingPassword}
                                    onClick={() =>
                                      setConfirmPasswordChangeOpen(false)
                                    }
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={isChangingPassword}
                                    onClick={() =>
                                      void handleConfirmPasswordChange()
                                    }
                                  >
                                    {isChangingPassword
                                      ? "Changing..."
                                      : "Confirm Change"}
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="mt-4 flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleChangePasswordClick}
                            disabled={
                              isChangingPassword || confirmPasswordChangeOpen
                            }
                            className="h-9 gap-2"
                          >
                            <KeyRound className="h-4 w-4" />
                            Change Password
                          </Button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            )}

            <section>
              <h4 className="mb-2 text-sm font-semibold">Account</h4>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem label="Name" value={user.name} />
                <DetailItem label="Email" value={user.email} />
                <DetailItem label="Role" value={user.userRole || user.role} />
                <DetailItem
                  label="Query asked"
                  value={user.totalQuestions?.toLocaleString()}
                />
                <DetailItem
                  label="Created at"
                  value={
                    user.createdAt
                      ? new Date(user.createdAt).toLocaleString("en-IN")
                      : null
                  }
                />
                <DetailItem
                  label="Latest platform"
                  value={<LatestPlatform user={user} />}
                />
              </dl>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Profile</h4>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem label="Farmer name" value={fp?.farmerName} />
                <DetailItem label="Age" value={fp?.age} />
                <DetailItem label="Gender" value={fp?.gender} />
                <DetailItem label="Phone" value={fp?.phoneNo} />
                <DetailItem label="Language" value={fp?.languagePreference} />
                <DetailItem
                  label="Experience"
                  value={
                    fp?.yearsOfExperience != null
                      ? `${fp.yearsOfExperience} years`
                      : null
                  }
                />
                <DetailItem label="Village" value={fp?.villageName} />
                <DetailItem label="Block" value={fp?.blockName} />
                <DetailItem label="District" value={fp?.district} />
                <DetailItem label="State" value={fp?.state} />
                <DetailItem
                  label="Location"
                  value={
                    fp?.location?.latitude && fp?.location?.longitude ? (
                      <a
                        href={`https://maps.google.com/?q=${fp.location.latitude},${fp.location.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                      >
                        <MapPin className="h-4 w-4" />
                        View map
                      </a>
                    ) : null
                  }
                />
              </dl>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Farm Details</h4>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem
                  label="Crops cultivated"
                  value={<ListValue value={fp?.cropsCultivated} />}
                />
                <DetailItem
                  label="Primary crop"
                  value={<ListValue value={fp?.primaryCrop} />}
                />
                <DetailItem
                  label="Secondary crop"
                  value={<ListValue value={fp?.secondaryCrop} />}
                />
                <DetailItem
                  label="Landhold"
                  value={fp?.landhold != null ? `${fp.landhold} acres` : null}
                />
                <DetailItem
                  label="KCC aware"
                  value={<BooleanValue value={fp?.awarenessOfKCC} />}
                />
                <DetailItem
                  label="Uses agri apps"
                  value={<BooleanValue value={fp?.usesAgriApps} />}
                />
                <DetailItem
                  label="Education"
                  value={fp?.highestEducatedPerson}
                />
                <DetailItem
                  label="Smartphones"
                  value={fp?.numberOfSmartphones}
                />
                <DetailItem label="Nearest KVK" value={fp?.nearestKVK} />
                <DetailItem
                  label="Platform history"
                  value={<PlatformHistory user={user} />}
                />
              </dl>
            </section>
          </div>
          </ScrollArea>
        )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

type PasswordInputProps = {
  label: string;
  value: string;
  visible: boolean;
  error?: string;
  onChange: (value: string) => void;
  onToggleVisible: () => void;
};

function PasswordInput({
  label,
  value,
  visible,
  error,
  onChange,
  onToggleVisible,
}: PasswordInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="********"
          type={visible ? "text" : "password"}
          className={`h-10 pr-10 ${
            error ? "border-red-500 focus-visible:ring-red-500" : ""
          }`}
        />
        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
      {error && <span className="text-xs font-medium text-red-500">{error}</span>}
    </div>
  );
}
