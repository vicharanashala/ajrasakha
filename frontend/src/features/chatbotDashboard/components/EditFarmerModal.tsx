import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
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
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Check, Eye, EyeOff, KeyRound } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import {
  STATES,
  BLOCKS,
  CROPS,
  DISTRICTS,
  INDIAN_LANGUAGES,
  KVKS,
  VILLAGES,
} from "../utils/metaData";

const EDIT_PASSWORD_RULES = [
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

type EditableUser = {
  userId: string;
  name: string;
  userRole?: string;
  farmerProfile?: {
    farmerName?: string;
    age?: number;
    gender?: string;

    state?: string;
    district?: string;
    blockName?: string;
    villageName?: string;

    latitude?: number;
    longitude?: number;

    phoneNo?: string;
    languagePreference?: string;

    yearsOfExperience?: number;
    landhold?: number;

    cropsCultivated?: string[];
    primaryCrop?: string;
    secondaryCrop?: string;

    nearestKVK?: string;

    awarenessOfKCC?: boolean;
    usesAgriApps?: boolean;

    highestEducatedPerson?: string;
    numberOfSmartphones?: number;
  };
};

interface EditFarmerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: EditableUser | null;
  isSaving?: boolean;
  isChangingPassword?: boolean;
  onSave: (payload: {
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
    };
  }) => void | Promise<void>;
  onChangePassword?: (payload: {newPassword: string}) => void | Promise<void>;
}

type DemographicDetailsProps = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
};

type FormState = {
  name: string;
  userRole: string;
  farmerName: string;
  age: string;
  gender: string;
  villageName: string;
  blockName: string;
  district: string;
  state: string;
  phoneNo: string;
  nearestKVK: string;
  languagePreference: string;
  yearsOfExperience: string;
  landhold: string;
  cropsCultivated: string;
  primaryCrop: string;
  secondaryCrop: string;
  awarenessOfKCC: "" | "true" | "false";
  usesAgriApps: "" | "true" | "false";
  highestEducatedPerson: string;
  numberOfSmartphones: string;
  platform: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  userRole: "",
  farmerName: "",
  age: "",
  gender: "",
  villageName: "",
  blockName: "",
  district: "",
  state: "",
  phoneNo: "",
  nearestKVK: "",
  languagePreference: "",
  yearsOfExperience: "",
  landhold: "",
  cropsCultivated: "",
  primaryCrop: "",
  secondaryCrop: "",
  awarenessOfKCC: "",
  usesAgriApps: "",
  highestEducatedPerson: "",
  numberOfSmartphones: "",
  platform: "",
};

const toNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toBoolean = (value: "" | "true" | "false"): boolean | undefined => {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const toStringArray = (value: string): string[] | undefined => {
  const list = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
};

export function EditFarmerModal({
  open,
  onOpenChange,
  user,
  isSaving = false,
  isChangingPassword = false,
  onSave,
  onChangePassword,
}: EditFarmerModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>(
    {},
  );
  const [confirmPasswordChangeOpen, setConfirmPasswordChangeOpen] =
    useState(false);

  const validateField = (
    key: keyof FormState,
    value: string,
  ): string | undefined => {
    switch (key) {
      case "name":
        if (value && !/^[a-zA-Z\s.'-]+$/.test(value)) {
          return "Name can only contain letters";
        }
        break;

      case "farmerName":
        if (value && !/^[a-zA-Z\s.'-]+$/.test(value)) {
          return "Farmer Name can only contain letters";
        }
        break;

      case "age":
        const age = Number(value);
        if (age < 16 || age > 100) {
          return "Age has to be between 16 to 100";
        }
        break;

      case "phoneNo":
        if (value && !/^\d{10}$/.test(value)) {
          return "Phone Number must be exactly 10 digits";
        }
        break;

      case "yearsOfExperience":
        const yearsOfExperience = Number(value);
        if (yearsOfExperience < 0 || yearsOfExperience > 70) {
          return "Experience can be between 0 to 70 years";
        }
        break;

      case "landhold":
        const landhold = Number(value);
        if (landhold < 0) {
          return "Please enter valid value";
        }
        break;

      case "numberOfSmartphones":
        const numberOfSmartphones = Number(value);
        if (numberOfSmartphones < 0) {
          return "Please enter valid value";
        }
      break;
    }
    return undefined
  };

  const hasValidationErrors = Object.values(errors).some(
  (error) => Boolean(error),
);

  useEffect(() => {
    if (!open || !user) return;
    const fp = user.farmerProfile;
    setErrors({});
    setPasswordErrors({});
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setConfirmPasswordChangeOpen(false);
    setForm({
      name: user.name ?? "",
      userRole: user.userRole ?? "",
      farmerName: fp?.farmerName ?? "",
      age: fp?.age != null ? String(fp.age) : "",
      gender: fp?.gender
        ? fp.gender.charAt(0).toUpperCase() + fp.gender.slice(1).toLowerCase()
        : "",
      villageName: fp?.villageName ?? "",
      blockName: fp?.blockName ?? "",
      district: fp?.district ?? "",
      state: fp?.state ?? "",
      phoneNo: fp?.phoneNo ?? "",
      nearestKVK: fp?.nearestKVK ?? "",
      languagePreference: fp?.languagePreference ?? "",
      yearsOfExperience:
        fp?.yearsOfExperience != null ? String(fp.yearsOfExperience) : "",
      landhold: fp?.landhold !== null ? String(fp?.landhold) : "0",
      cropsCultivated: (fp?.cropsCultivated ?? []).join(", "),
      primaryCrop: fp?.primaryCrop ?? "",
      secondaryCrop: fp?.secondaryCrop ?? "",
      awarenessOfKCC:
        fp?.awarenessOfKCC == null ? "" : fp.awarenessOfKCC ? "true" : "false",
      usesAgriApps:
        fp?.usesAgriApps == null ? "" : fp.usesAgriApps ? "true" : "false",
      highestEducatedPerson: fp?.highestEducatedPerson ?? "",
      numberOfSmartphones:
        fp?.numberOfSmartphones != null ? String(fp.numberOfSmartphones) : "",
      platform: fp?.platform ?? "",
    });
  }, [open, user]);

  const handleSave = async () => {
    if (isSaving) return;

    const parsedAge = toNumber(form.age);
    // const validationErrors = validateForm(form);

    // if (Object.keys(validationErrors).length > 0) {
    //   setErrors(validationErrors);
    //   return;
    // }
    setErrors({});
    try {
      await onSave({
        name: form.name.trim() || undefined,
        userRole: form.userRole.trim() || undefined,
        farmerProfile: {
          farmerName: form.farmerName.trim() || undefined,
          age: parsedAge,
          gender:
  form.gender.trim() === ""
    ? null
    : form.gender.trim(),
          villageName: form.villageName.trim() === "" ? null: form.villageName.trim(),
          blockName: form.blockName.trim() === "" ? null: form.blockName.trim(),
          district: form.district.trim() === "" ? null: form.district.trim(),
          state: form.state.trim() === "" ? null: form.state.trim(),
          phoneNo: form.phoneNo.trim() || undefined,
          nearestKVK: form.nearestKVK.trim() || undefined,
          languagePreference: form.languagePreference.trim() || undefined,
          yearsOfExperience: toNumber(form.yearsOfExperience),
          landhold: toNumber(form.landhold),
          cropsCultivated: toStringArray(form.cropsCultivated),
          primaryCrop: form.primaryCrop.trim() || undefined,
          secondaryCrop: form.secondaryCrop.trim() || undefined,
          awarenessOfKCC: toBoolean(form.awarenessOfKCC),
          usesAgriApps: toBoolean(form.usesAgriApps),
          highestEducatedPerson:
  form.highestEducatedPerson.trim() === ""
    ? null
    : form.highestEducatedPerson.trim(),
          numberOfSmartphones: toNumber(form.numberOfSmartphones),
          platform: form.platform.trim() || undefined,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save farmer details.";
      setErrors(message);
    }
  };

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
      await onChangePassword({newPassword});
      setNewPassword("");
      setConfirmPassword("");
      setPasswordErrors({});
      setConfirmPasswordChangeOpen(false);
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

  const handleEditModalOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (confirmPasswordChangeOpen || isChangingPassword)) {
      return;
    }

    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleEditModalOpenChange}>
      <DialogContent className="!max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Farmer</DialogTitle>
        </DialogHeader>

        <div>
          <UserInformationSection
            form={form}
            setForm={setForm}
            errors={errors}
            setErrors={setErrors}
            validateFields={validateField}
          />
          <DemographicDetails
            form={form}
            setForm={setForm}
            errors={errors}
            setErrors={setErrors}
            validateFields={validateField}
          />
          <AgriculturalBackgroundSection
            form={form}
            setForm={setForm}
            errors={errors}
            setErrors={setErrors}
            validateFields={validateField}
          />
          <DigitalAwarenessSection
            form={form}
            setForm={setForm}
            errors={errors}
          />
          <SocioEconomicIndicatorsSection
            form={form}
            setForm={setForm}
            errors={errors}
            setErrors={setErrors}
            validateFields={validateField}
          />
          <PasswordManagementSection
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            showNewPassword={showNewPassword}
            showConfirmPassword={showConfirmPassword}
            errors={passwordErrors}
            isChangingPassword={isChangingPassword}
            onNewPasswordChange={(value) => {
              setNewPassword(value);
              setPasswordErrors((prev) => ({...prev, newPassword: ""}));
            }}
            onConfirmPasswordChange={(value) => {
              setConfirmPassword(value);
              setPasswordErrors((prev) => ({...prev, confirmPassword: ""}));
            }}
            onToggleNewPassword={() => setShowNewPassword((prev) => !prev)}
            onToggleConfirmPassword={() =>
              setShowConfirmPassword((prev) => !prev)
            }
            onSubmit={handleChangePasswordClick}
          />
        </div>

        <DialogFooter className="relative z-10 pointer-events-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || hasValidationErrors}
            className="cursor-pointer"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog
        open={confirmPasswordChangeOpen}
        onOpenChange={setConfirmPasswordChangeOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 p-3 rounded-full bg-amber-100 dark:bg-amber-900/30 w-fit">
              <KeyRound className="h-5 w-5 text-amber-700 dark:text-amber-300" />
            </div>
            <AlertDialogTitle className="text-center">
              Change this user's password?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              The new password will replace the existing password and stored
              refresh sessions will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isChangingPassword}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isChangingPassword}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmPasswordChange();
              }}
            >
              {isChangingPassword ? "Changing..." : "Change Password"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

type PasswordManagementSectionProps = {
  newPassword: string;
  confirmPassword: string;
  showNewPassword: boolean;
  showConfirmPassword: boolean;
  errors: Record<string, string>;
  isChangingPassword: boolean;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onToggleNewPassword: () => void;
  onToggleConfirmPassword: () => void;
  onSubmit: () => void;
};

const PasswordManagementSection = ({
  newPassword,
  confirmPassword,
  showNewPassword,
  showConfirmPassword,
  errors,
  isChangingPassword,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onToggleNewPassword,
  onToggleConfirmPassword,
  onSubmit,
}: PasswordManagementSectionProps) => {
  return (
    <section className="mt-6 rounded-lg border border-slate-200 dark:border-white/[0.08] p-4">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Change Password
        </h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PasswordInput
          label="New Password"
          value={newPassword}
          visible={showNewPassword}
          error={errors.newPassword}
          onChange={onNewPasswordChange}
          onToggleVisible={onToggleNewPassword}
        />
        <PasswordInput
          label="Confirm Password"
          value={confirmPassword}
          visible={showConfirmPassword}
          error={errors.confirmPassword}
          onChange={onConfirmPasswordChange}
          onToggleVisible={onToggleConfirmPassword}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {EDIT_PASSWORD_RULES.map((rule) => {
          const passed = rule.test(newPassword);
          return (
            <div
              key={rule.label}
              className={`flex items-center gap-2 text-xs ${
                passed ? "text-emerald-600" : "text-slate-500"
              }`}
            >
              <Check className="h-3.5 w-3.5" />
              {rule.label}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onSubmit}
          disabled={isChangingPassword}
          className="h-9 gap-2"
        >
          <KeyRound className="h-4 w-4" />
          {isChangingPassword ? "Changing..." : "Change Password"}
        </Button>
      </div>
    </section>
  );
};

type PasswordInputProps = {
  label: string;
  value: string;
  visible: boolean;
  error?: string;
  onChange: (value: string) => void;
  onToggleVisible: () => void;
};

const PasswordInput = ({
  label,
  value,
  visible,
  error,
  onChange,
  onToggleVisible,
}: PasswordInputProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </label>
      <div className="relative">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="********"
          type={visible ? "text" : "password"}
          className={`h-10 rounded-xl px-3 pr-10 text-sm border bg-transparent ${
            error
              ? "border-red-500 focus-visible:ring-red-500"
              : "border-slate-200 dark:border-white/[0.08]"
          }`}
        />
        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <span className="text-xs text-red-500 font-medium pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {error}
        </span>
      )}
    </div>
  );
};

type UserInformationSectionProps = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
};

const UserInformationSection = ({
  form,
  setForm,
  errors,
  setErrors,
  validateFields,
}: UserInformationSectionProps) => {
  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [key]: validateFields(key, value),
    }));
  };
  return (
    <div className="space-y-6 mb-4">
      <div>
        <h3 className="text-lg font-semibold">User Information</h3>

        <div className="h-px bg-border mt-2" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Name</label>

          <Input
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">User Role</label>

          <select
            value={form.userRole}
            onChange={(e) => handleChange("userRole", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >


            <option value="FARMER">FARMER</option>

            <option value="INTERNAL">INTERNAL</option>

            <option value="COORDINATOR">COORDINATOR</option>
          </select>
        </div>
      </div>
    </div>
  );
};

const DemographicDetails = ({
  form,
  setForm,
  errors,
  setErrors,
  validateFields,
}: DemographicDetailsProps) => {
  // const handleChange = (
  //   key: keyof FormState,
  //   value: string,
  // ) => {
  //   setForm((prev) => ({
  //     ...prev,
  //     [key]: value,
  //   }));

  //   setErrors((prev) => {
  //     const updated = { ...prev };

  //     if (key === "phoneNo") {
  //       if (!value.trim()) {
  //         updated.phoneNo = "Phone Number is required";
  //       } else if (!/^\d{10}$/.test(value)) {
  //         updated.phoneNo =
  //           "Phone Number must be exactly 10 digits";
  //       } else {
  //         delete updated.phoneNo;
  //       }
  //     }

  //     return updated;
  //   });
  // };

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [key]: validateFields(key, value),
    }));
  };

  return (
    <div className="space-y-6 mb-4">
      <div>
        <h3 className="text-lg font-semibold">Demographic Details</h3>

        <div className="h-px bg-border mt-2" />
      </div>

      {/* Fields go here */}

      {/* <div>
        <label className="text-sm font-medium">Language</label>

        <select
          value={form.languagePreference}
          onChange={(e) => handleChange("languagePreference", e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Select Language</option>

          {INDIAN_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </select>
      </div> */}

      <div>
        <label className="text-sm font-medium">Farmer Name</label>

        <Input
          value={form.farmerName}
          onChange={(e) => handleChange("farmerName", e.target.value)}
        />
        {errors.farmerName && (
          <p className="mt-1 text-sm text-red-600">{errors.farmerName}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Age</label>

          <Input
            type="number"
            min={16}
            max={100}
            value={form.age}
            onChange={(e) => handleChange("age", e.target.value)}
          />
          {errors.age && (
            <p className="mt-1 text-sm text-red-600">{errors.age}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">Gender</label>

          <select
            value={form.gender}
            onChange={(e) => handleChange("gender", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select option</option>

            <option value="Male">Male</option>

            <option value="Female">Female</option>

            <option value="Other">Other</option>
          </select>
          {errors.gender && (
            <p className="mt-1 text-sm text-red-600">{errors.gender}</p>
          )}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Phone Number</label>

        <Input
          value={form.phoneNo}
          maxLength={10}
          onChange={(e) => handleChange("phoneNo", e.target.value)}
        />
        {errors.phoneNo && (
          <p className="mt-1 text-sm text-red-600">{errors.phoneNo}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">State</label>
          <select
            value={form.state}
            onChange={(e) => {
              const state = e.target.value;

              setForm((prev) => ({
                ...prev,
                state,
                district: "",
                blockName: "",
                villageName: "",
                nearestKVK: "",
              }));
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select State</option>
            {STATES.map((state, index) => {
              return (
                <option key={index} value={state}>
                  {state}
                </option>
              );
            })}
          </select>
          {/* {errors.state && (
            <p className="mt-1 text-sm text-red-600">{errors.state}</p>
          )} */}
        </div>
        <div>
          <label className="text-sm font-medium">District</label>
          <select
            value={form.district}
            disabled={!form.state}
            onChange={(e) => {
              const district = e.target.value;

              setForm((prev) => ({
                ...prev,
                district,
                blockName: "",
                villageName: "",
                nearestKVK: "",
              }));
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select District</option>
            {(DISTRICTS[form.state] || []).map((district) => {
              return <option value={district}>{district}</option>;
            })}
          </select>
          {/* {errors.district && (
            <p className="mt-1 text-sm text-red-600">{errors.district}</p>
          )} */}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Block</label>
        <select
          value={form.blockName}
          disabled={!form.district}
          onChange={(e) => {
            const block = e.target.value;

            setForm((prev) => ({
              ...prev,
              blockName: block,
              villageName: "",
            }));
          }}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Select Block</option>

          {(BLOCKS[form.district] || []).map((block) => (
            <option key={block} value={block}>
              {block}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Village</label>
        <select
          value={form.villageName}
          disabled={!form.blockName}
          onChange={(e) => handleChange("villageName", e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Select Village</option>

          {(VILLAGES[form.blockName] || []).map((village) => (
            <option key={village} value={village}>
              {village}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Nearest KVK</label>
        <select
          value={form.nearestKVK}
          disabled={!form.district}
          onChange={(e) => handleChange("nearestKVK", e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Select KVK</option>

          {(KVKS[form.district] || []).map((kvk) => (
            <option key={kvk} value={kvk}>
              {kvk}
            </option>
          ))}
        </select>
        {errors.nearestKVK && (
          <p className="mt-1 text-sm text-red-600">{errors.nearestKVK}</p>
        )}
      </div>
    </div>
  );
};

type AgriculturalBackgroundSectionProps = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
};

const AgriculturalBackgroundSection = ({
  form,
  setForm,
  errors,
  setErrors,
  validateFields,
}: AgriculturalBackgroundSectionProps) => {
  // const handleChange = (key: keyof FormState, value: string) => {
  //   setForm((prev) => ({
  //     ...prev,
  //     [key]: value,
  //   }));
  // };

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [key]: validateFields(key, value),
    }));
  };

  return (
    <div className="space-y-6 mb-4">
      <div>
        <h3 className="text-lg font-semibold">Agricultural Background</h3>

        <div className="h-px bg-border mt-2" />
      </div>

      {/* Experience + Land */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Years Of Experience</label>

          <Input
            type="number"
            min={0}
            value={form.yearsOfExperience}
            onChange={(e) => handleChange("yearsOfExperience", e.target.value)}
          />
          {errors.yearsOfExperience && (
            <p className="mt-1 text-sm text-red-600">{errors.yearsOfExperience}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">
            Total Land Cultivating (Acres)
          </label>

          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.landhold}
            onChange={(e) => handleChange("landhold", e.target.value)}
          />
          {errors.landhold && (
            <p className="mt-1 text-sm text-red-600">{errors.landhold}</p>
          )}
        </div>
      </div>

      {/* Primary + Secondary Crop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Primary Crop</label>

          <select
            value={form.primaryCrop}
            onChange={(e) => handleChange("primaryCrop", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select Primary Crop</option>

            {CROPS.map((crop) => (
              <option key={crop} value={crop}>
                {crop}
              </option>
            ))}
          </select>
          {/* {errors.primaryCrop && (
            <p className="mt-1 text-sm text-red-600">{errors.primaryCrop}</p>
          )} */}
        </div>

        <div>
          <label className="text-sm font-medium">Secondary Crop</label>

          <select
            value={form.secondaryCrop}
            onChange={(e) => handleChange("secondaryCrop", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select Secondary Crop</option>

            {CROPS.map((crop) => (
              <option key={crop} value={crop}>
                {crop}
              </option>
            ))}
          </select>
          {errors.secondaryCrop && (
            <p className="mt-1 text-sm text-red-600">{errors.secondaryCrop}</p>
          )}
        </div>
      </div>

      {/* Crops Cultivated */}
      {/* <div>
        <label className="text-sm font-medium">Crops Cultivated</label>

        <Input
          value={form.cropsCultivated}
          onChange={(e) => handleChange("cropsCultivated", e.target.value)}
          placeholder="Rice, Wheat, Maize"
        />

        <p className="text-xs text-muted-foreground mt-1">
          Comma separated crop names
        </p>
      </div> */}
    </div>
  );
};

type DigitalAwarenessSectionProps = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
};

const DigitalAwarenessSection = ({
  form,
  setForm,
  errors,
}: DigitalAwarenessSectionProps) => {
  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <div className="space-y-6 mb-4">
      <div>
        <h3 className="text-lg font-semibold">Awareness & Digital Adoption</h3>

        <div className="h-px bg-border mt-2" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* KCC Awareness */}
        <div>
          <label className="text-sm font-medium block mb-2">
            Awareness Of KCC
          </label>

          <select
            value={form.awarenessOfKCC}
            onChange={(e) => handleChange("awarenessOfKCC", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select Option</option>

            <option value="true">Yes</option>

            <option value="false">No</option>
          </select>
          {errors.awarenessOfKCC && (
            <p className="mt-1 text-sm text-red-600">{errors.awarenessOfKCC}</p>
          )}
        </div>

        {/* Uses Agri Apps */}
        <div>
          <label className="text-sm font-medium block mb-2">
            Uses Agricultural Apps
          </label>

          <select
            value={form.usesAgriApps}
            onChange={(e) => handleChange("usesAgriApps", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select Option</option>

            <option value="true">Yes</option>

            <option value="false">No</option>
          </select>
          {errors.usesAgriApps && (
            <p className="mt-1 text-sm text-red-600">{errors.usesAgriApps}</p>
          )}
        </div>
      </div>
    </div>
  );
};

type SocioEconomicIndicatorsSectionProps = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  errors;
};

const SocioEconomicIndicatorsSection = ({
  form,
  setForm,
  errors,
  setErrors,
  validateFields
}: SocioEconomicIndicatorsSectionProps) => {
  // const handleChange = (key: keyof FormState, value: string) => {
  //   setForm((prev) => ({
  //     ...prev,
  //     [key]: value,
  //   }));
  // };

    const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [key]: validateFields(key, value),
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Socio Economic Indicators</h3>

        <div className="h-px bg-border mt-2" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Highest Educated Person */}
        <div>
          <label className="text-sm font-medium">Highest Educated Person</label>

          <select
            value={form.highestEducatedPerson}
            onChange={(e) =>
              handleChange("highestEducatedPerson", e.target.value)
            }
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select Education Level</option>

            <option value="Under Graduate">Under Graduate</option>

            <option value="Graduate">Graduate</option>

            <option value="Post Graduate">Post Graduate</option>
          </select>
        </div>

        {/* Smartphones */}
        <div>
          <label className="text-sm font-medium">Number Of Smartphones</label>

          <Input
            type="number"
            min={0}
            value={form.numberOfSmartphones}
            onChange={(e) =>
              handleChange("numberOfSmartphones", e.target.value)
            }
          />
             {errors.numberOfSmartphones && (
            <p className="mt-1 text-sm text-red-600">{errors.numberOfSmartphones}</p>
          )}
        </div>
      </div>
    </div>
  );
};
