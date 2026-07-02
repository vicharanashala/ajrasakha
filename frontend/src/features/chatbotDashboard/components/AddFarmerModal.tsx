import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Eye, EyeOff, RefreshCw, Info } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/atoms/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/atoms/tabs";

const WEB_APP_ROLES = [
  { label: "Farmer", value: "FARMER" },
  { label: "District Coordinator", value: "district_coordinator" },
  { label: "Block Coordinator", value: "block_coordinator" },
  { label: "Village Volunteer", value: "village_volunteer" },
  { label: "Internal", value: "INTERNAL" },
] as const;

const REVIEW_SYSTEM_ROLES = [
  { label: "District", value: "district_coordinator" },
  { label: "Block", value: "block_coordinator" },
  { label: "Village Volunteer", value: "village_volunteer" },
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
    mode === "review_system"
      ? `Add ${selectedRoleLabel}`
      : `Add ${selectedRoleLabel}`;

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

  const handleReset = () => {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setMode("web_app");
    setRole("FARMER");
    setIsVerified(true);
    setErrors({});
    setShowPassword(false);
    setShowConfirmPassword(false);
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
      newErrors.password = "Password must be at least 8 characters.";
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password =
        "Password must contain at least one uppercase letter.";
    } else if (!/[a-z]/.test(password)) {
      newErrors.password =
        "Password must contain at least one lowercase letter.";
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = "Password must contain at least one number.";
    }

    // Confirm Password
    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = "Please confirm your password.";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match.";
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

  // Animation variants for staggered form fields
  const formFieldVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.05,
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    }),
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 10 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: 10,
      transition: {
        duration: 0.2,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
  };

  return (
    <AnimatePresence mode="wait">
      {open && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />
          <DialogContent className="flex h-[90vh] w-[85vw] max-w-[600px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl dark:border-[#2a2a2a] dark:bg-[#1a1a1a] sm:max-w-[600px]">
            <motion.div
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={modalVariants}
              className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
            >
              <DialogHeader className="shrink-0 px-5 pb-3 pt-5">
                <div className="flex flex-row items-center justify-between pr-8">
                  <div>
                    <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {addButtonLabel}
                    </DialogTitle>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Create a new{" "}
                      {mode === "review_system" ? "coordinator" : "user"} profile.
                      The credentials will be registered.
                    </p>
                  </div>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.1, rotate: 180 }}
                    whileTap={{ scale: 0.9, rotate: 180 }}
                    transition={{ duration: 0.3 }}
                    onClick={handleReset}
                    className="absolute right-12 top-3 flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-300"
                    title="Reset form"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </motion.button>
                </div>
              </DialogHeader>

              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-2"
                >
                  {/* <motion.div
                    custom={0}
                    variants={formFieldVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <Tabs
                      value={mode}
                      onValueChange={(value) =>
                        handleModeChange(value as ModalMode)
                      }
                    >
                      <TabsList className="grid h-9 w-full grid-cols-1">
                        <TabsTrigger value="web_app">
                          Web Application
                        </TabsTrigger>
                        <TabsTrigger value="review_system">
                          Review System
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </motion.div> */}

                  <motion.div
                    custom={1}
                    variants={formFieldVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-col gap-1.5"
                  >
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
                    <AnimatePresence mode="wait">
                      {errors.name && (
                        <motion.span
                          initial={{ opacity: 0, y: -10, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: "auto" }}
                          exit={{ opacity: 0, y: -10, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs text-red-500 font-medium pl-1 overflow-hidden"
                        >
                          {errors.name}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <motion.div
                    custom={2}
                    variants={formFieldVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-col gap-1.5"
                  >
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
                    <AnimatePresence mode="wait">
                      {errors.email && (
                        <motion.span
                          initial={{ opacity: 0, y: -10, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: "auto" }}
                          exit={{ opacity: 0, y: -10, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs text-red-500 font-medium pl-1 overflow-hidden"
                        >
                          {errors.email}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <motion.div
                    custom={3}
                    variants={formFieldVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-col gap-1.5"
                  >
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {mode === "review_system" ? "Coordinator" : "User Role"}{" "}
                      <span className="text-red-500">*</span>
                    </label>

                    <RadioGroup
                      value={role}
                      onValueChange={(value) => setRole(value as UserRole)}
                      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                    >
                      {roleOptions.map((item) => (
                        <motion.label
                          key={item.value}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all ${
                            role === item.value
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50 hover:bg-primary/5"
                          }`}
                        >
                          <RadioGroupItem
                            value={item.value}
                            className="shrink-0"
                          />
                          <span className="min-w-0 text-sm font-medium leading-tight">
                            {item.label}
                          </span>
                        </motion.label>
                      ))}
                    </RadioGroup>

                    <AnimatePresence mode="wait">
                      {errors.role && (
                        <motion.span
                          initial={{ opacity: 0, y: -10, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: "auto" }}
                          exit={{ opacity: 0, y: -10, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs text-red-500 font-medium pl-1 overflow-hidden"
                        >
                          {errors.role}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <motion.div
                    custom={4}
                    variants={formFieldVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-col gap-1.5"
                  >
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Verification Status
                    </label>

                    <RadioGroup
                      value={isVerified ? "verified" : "unverified"}
                      onValueChange={(value) =>
                        setIsVerified(value === "verified")
                      }
                      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                    >
                      {[
                        { value: "verified", label: "Verified" },
                        { value: "unverified", label: "Not Verified" },
                      ].map((option) => (
                        <motion.label
                          key={option.value}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
                            (option.value === "verified") === isVerified
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50 hover:bg-primary/5"
                          }`}
                        >
                          <RadioGroupItem value={option.value} />
                          <span className="text-sm font-medium">
                            {option.label}
                          </span>
                        </motion.label>
                      ))}
                    </RadioGroup>
                  </motion.div>

                  <motion.div
                    custom={5}
                    variants={formFieldVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-col gap-1.5"
                  >
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

                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </motion.button>
                    </div>

                    <AnimatePresence mode="wait">
                      {errors.password && (
                        <motion.span
                          initial={{ opacity: 0, y: -10, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: "auto" }}
                          exit={{ opacity: 0, y: -10, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs text-red-500 font-medium pl-1 overflow-hidden"
                        >
                          {errors.password}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <motion.div
                    custom={6}
                    variants={formFieldVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-col gap-1.5"
                  >
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

                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </motion.button>
                    </div>

                    <AnimatePresence mode="wait">
                      {errors.confirmPassword && (
                        <motion.span
                          initial={{ opacity: 0, y: -10, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: "auto" }}
                          exit={{ opacity: 0, y: -10, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs text-red-500 font-medium pl-1 overflow-hidden"
                        >
                          {errors.confirmPassword}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence>
                {["district_coordinator", "block_coordinator"].includes(role) && mode === "web_app" && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="overflow-hidden px-5 pb-1"
                  >
                    <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-[13px] leading-relaxed text-blue-800 dark:border-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
                      <span>
                        District Coordinator and Block Coordinator accounts will be automatically created in both the Review System and Web Application.
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                custom={7}
                variants={formFieldVariants}
                initial="hidden"
                animate="visible"
              >
                <DialogFooter className="shrink-0 flex justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-white/[0.05]">
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      disabled={isSaving}
                      className="h-9 px-4 rounded-xl text-sm"
                    >
                      Cancel
                    </Button>
                  </motion.div>
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="h-9 px-5 rounded-xl text-sm bg-primary hover:bg-primary/95 text-white"
                    >
                      {isSaving ? (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          Adding...
                        </motion.span>
                      ) : (
                        addButtonLabel
                      )}
                    </Button>
                  </motion.div>
                </DialogFooter>
              </motion.div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
