import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { STATES, DISTRICTS } from "@/components/MetaData"

type EditableUser = {
  userId: string;
  name: string;
  role?: string;
  farmerProfile?: {
    farmerName?: string;
    age?: number;
    gender?: string;
    villageName?: string;
    blockName?: string;
    district?: string;
    state?: string;
    phoneNo?: string;
    languagePreference?: string;
    yearsOfExperience?: number;
    cropsCultivated?: string[];
    primaryCrop?: string;
    secondaryCrop?: string;
    awarenessOfKCC?: boolean;
    usesAgriApps?: boolean;
    highestEducatedPerson?: string;
    numberOfSmartphones?: number;
    platform?: string;
  };
};

interface EditFarmerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: EditableUser | null;
  isSaving?: boolean;
  onSave: (payload: {
    name?: string;
    role?: string;
    farmerProfile?: {
      farmerName?: string;
      age?: number;
      gender?: string;
      villageName?: string;
      blockName?: string;
      district?: string;
      state?: string;
      phoneNo?: string;
      languagePreference?: string;
      yearsOfExperience?: number;
      cropsCultivated?: string[];
      primaryCrop?: string;
      secondaryCrop?: string;
      awarenessOfKCC?: boolean;
      usesAgriApps?: boolean;
      highestEducatedPerson?: string;
      numberOfSmartphones?: number;
      platform?: string;
    };
  }) => void | Promise<void>;
}

type FormState = {
  name: string;
  role: string;
  farmerName: string;
  age: string;
  gender: string;
  villageName: string;
  blockName: string;
  district: string;
  state: string;
  phoneNo: string;
  languagePreference: string;
  yearsOfExperience: string;
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
  role: "",
  farmerName: "",
  age: "",
  gender: "",
  villageName: "",
  blockName: "",
  district: "",
  state: "",
  phoneNo: "",
  languagePreference: "",
  yearsOfExperience: "",
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

const toBoolean = (
  value: "" | "true" | "false",
): boolean | undefined => {
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
  onSave,
}: EditFarmerModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!open || !user) return;
    const fp = user.farmerProfile;
    setError("");
    setForm({
      name: user.name ?? "",
      role: user.role ?? "",
      farmerName: fp?.farmerName ?? "",
      age: fp?.age != null ? String(fp.age) : "",
      gender: fp?.gender ?? "",
      villageName: fp?.villageName ?? "",
      blockName: fp?.blockName ?? "",
      district: fp?.district ?? "",
      state: fp?.state ?? "",
      phoneNo: fp?.phoneNo ?? "",
      languagePreference: fp?.languagePreference ?? "",
      yearsOfExperience:
        fp?.yearsOfExperience != null ? String(fp.yearsOfExperience) : "",
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

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const parsedAge = toNumber(form.age);
    if (parsedAge != null && parsedAge <= 16) {
      setError("Age must be greater than 16.");
      return;
    }

    setError("");
    await onSave({
      name: form.name.trim() || undefined,
      role: form.role.trim() || undefined,
      farmerProfile: {
        farmerName: form.farmerName.trim() || undefined,
        age: parsedAge,
        gender: form.gender.trim() || undefined,
        villageName: form.villageName.trim() || undefined,
        blockName: form.blockName.trim() || undefined,
        district: form.district.trim() || undefined,
        state: form.state.trim() || undefined,
        phoneNo: form.phoneNo.trim() || undefined,
        languagePreference: form.languagePreference.trim() || undefined,
        yearsOfExperience: toNumber(form.yearsOfExperience),
        cropsCultivated: toStringArray(form.cropsCultivated),
        primaryCrop: form.primaryCrop.trim() || undefined,
        secondaryCrop: form.secondaryCrop.trim() || undefined,
        awarenessOfKCC: toBoolean(form.awarenessOfKCC),
        usesAgriApps: toBoolean(form.usesAgriApps),
        highestEducatedPerson: form.highestEducatedPerson.trim() || undefined,
        numberOfSmartphones: toNumber(form.numberOfSmartphones),
        platform: form.platform.trim() || undefined,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Farmer</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Name"
          />
          <select
            value={form.role}
            onChange={(e) => handleChange("role", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select Role</option>
            <option value="FARMER">FARMER</option>
            <option value="INTERNAL">INTERNAL</option>
            <option value="COORDINATOR">COORDINATOR</option>
          </select>
          <Input
            value={form.farmerName}
            onChange={(e) => handleChange("farmerName", e.target.value)}
            placeholder="Farmer Name"
          />
          <Input
            value={form.age}
            onChange={(e) => handleChange("age", e.target.value)}
            placeholder="Age"
            type="number"
          />
          <select
            value={form.gender}
            onChange={(e) => handleChange("gender", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select Gender</option>
            <option value="MALE">MALE</option>
            <option value="FEMALE">FEMALE</option>
            <option value="OTHER">OTHER</option>
          </select>
          <Input
            value={form.villageName}
            onChange={(e) => handleChange("villageName", e.target.value)}
            placeholder="Village"
            disabled
          />
          <Input
            value={form.blockName}
            onChange={(e) => handleChange("blockName", e.target.value)}
            placeholder="Block"
            disabled
          />
          <select
            value={form.state}
            onChange={(e) => {
              const newState = e.target.value;
              setForm((prev) => ({
                ...prev,
                state: newState,
                district: DISTRICTS[newState]?.includes(prev.district)
                  ? prev.district
                  : "",
              }));
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select State</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
           <select
              value={form.district}
              onChange={(e) => handleChange("district", e.target.value)}
              disabled={!form.state}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
            >
              <option value="">Select District</option>
              {(DISTRICTS[form.state] || []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          <Input
            value={form.phoneNo}
            onChange={(e) => handleChange("phoneNo", e.target.value)}
            placeholder="Phone"
          />
          <Input
            value={form.languagePreference}
            onChange={(e) => handleChange("languagePreference", e.target.value)}
            placeholder="Language Preference"
          />
          <Input
            value={form.yearsOfExperience}
            onChange={(e) => handleChange("yearsOfExperience", e.target.value)}
            placeholder="Years Of Experience"
            type="number"
          />
          <Input
            value={form.numberOfSmartphones}
            onChange={(e) => handleChange("numberOfSmartphones", e.target.value)}
            placeholder="Number Of Smartphones"
            type="number"
          />
          <Input
            value={form.primaryCrop}
            onChange={(e) => handleChange("primaryCrop", e.target.value)}
            placeholder="Primary Crop"
          />
          <Input
            value={form.secondaryCrop}
            onChange={(e) => handleChange("secondaryCrop", e.target.value)}
            placeholder="Secondary Crop"
          />
          <Input
            value={form.platform}
            onChange={(e) => handleChange("platform", e.target.value)}
            placeholder="Platform"
          />
          <select
            value={form.highestEducatedPerson}
            onChange={(e) => handleChange("highestEducatedPerson", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select Highest Education</option>
            <option value="UNDER GRADUATE">UNDER GRADUATE</option>
            <option value="GRADUATE">GRADUATE</option>
            <option value="POST GRADUATE">POST GRADUATE</option>
          </select>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="space-y-3">
          <Input
            value={form.cropsCultivated}
            onChange={(e) => handleChange("cropsCultivated", e.target.value)}
            placeholder="Crops Cultivated (comma-separated)"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={form.awarenessOfKCC}
              onChange={(e) =>
                handleChange(
                  "awarenessOfKCC",
                  e.target.value as "" | "true" | "false",
                )
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">KCC Awareness</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>

            <select
              value={form.usesAgriApps}
              onChange={(e) =>
                handleChange(
                  "usesAgriApps",
                  e.target.value as "" | "true" | "false",
                )
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Uses Agri Apps</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
