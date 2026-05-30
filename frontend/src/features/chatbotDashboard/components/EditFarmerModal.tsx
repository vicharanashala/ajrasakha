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

type EditableUser = {
  userId: string;
  name: string;
  role?: string;
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
      nearestKVK?: string;
      languagePreference?: string;
      yearsOfExperience?: number;
      landhold?: number;
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

type DemographicDetailsProps = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
};

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
  role: "",
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
  onSave,
}: EditFarmerModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});

  const validateForm = (
    form: FormState,
  ): Partial<Record<keyof FormState, string>> => {
    const errors: Partial<Record<keyof FormState, string>> = {};

    const age = toNumber(form.age);
    const landhold = toNumber(form.landhold);

    if (!form.farmerName.trim()) {
      errors.farmerName = "Farmer Name is required";
    }

    if (!form.age) {
      errors.age = "Age is required";
    } else if (age < 16 || age > 100) {
      errors.age = "Age must be between 16 and 100";
    }

  if (!form.phoneNo.trim()) {
  errors.phoneNo = "Phone Number is required";
} else if (!/^\d{10}$/.test(form.phoneNo)) {
  errors.phoneNo = "Phone Number must be exactly 10 digits";
}

    if (!form.gender.trim()) {
      errors.gender = "Gender is required";
    }

    if (!form.nearestKVK.trim()) {
      errors.nearestKVK = "Nearest KVK is required";
    }

    if (!form.landhold === undefined) {
      errors.landhold = "Total Land Cultivation is required";
    }

    if (!form.primaryCrop.trim()) {
      errors.primaryCrop = "Primary Crop is required";
    }

    if (!form.secondaryCrop.trim()) {
      errors.secondaryCrop = "Secondary Crop is required";
    }

    if (form.awarenessOfKCC === "") {
      errors.awarenessOfKCC = "KCC Awareness is required";
    }

    if (form.usesAgriApps === "") {
      errors.usesAgriApps = "Mobile App Awareness is required";
    }

    if(!form.highestEducatedPerson){
      errors.highestEducatedPerson = "Highest education is required"
    }

    return errors;
  };

  useEffect(() => {
    if (!open || !user) return;
    const fp = user.farmerProfile;
    setErrors({});
    setForm({
      name: user.name ?? "",
      role: user.role ?? "",
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
    const validationErrors = validateForm(form);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    try {
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
          nearestKVK: form.nearestKVK.trim() || undefined,
          languagePreference: form.languagePreference.trim() || undefined,
          yearsOfExperience: toNumber(form.yearsOfExperience),
          landhold: toNumber(form.landhold),
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
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save farmer details.";
      setErrors(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Farmer</DialogTitle>
        </DialogHeader>

        <div>
          <UserInformationSection
            form={form}
            setForm={setForm}
            errors={errors}
          />
          <DemographicDetails form={form} setForm={setForm} errors={errors} setErrors={setErrors}/>
          <AgriculturalBackgroundSection
            form={form}
            setForm={setForm}
            errors={errors}
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
            disabled={isSaving}
            className="cursor-pointer"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type UserInformationSectionProps = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
};

const UserInformationSection = ({
  form,
  setForm,
  errors,
}: UserInformationSectionProps) => {
  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
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
        </div>

        <div>
          <label className="text-sm font-medium">Role</label>

          <select
            value={form.role}
            onChange={(e) => handleChange("role", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >

            <option value="USER">USER</option>

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
  setErrors
}: DemographicDetailsProps) => {
const handleChange = (
  key: keyof FormState,
  value: string,
) => {
  setForm((prev) => ({
    ...prev,
    [key]: value,
  }));

  setErrors((prev) => {
    const updated = { ...prev };

    if (key === "phoneNo") {
      if (!value.trim()) {
        updated.phoneNo = "Phone Number is required";
      } else if (!/^\d{10}$/.test(value)) {
        updated.phoneNo =
          "Phone Number must be exactly 10 digits";
      } else {
        delete updated.phoneNo;
      }
    }

    return updated;
  });
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
            <option value="">Select Gender</option>

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
}: AgriculturalBackgroundSectionProps) => {
  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
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
          {errors.primaryCrop && (
            <p className="mt-1 text-sm text-red-600">{errors.primaryCrop}</p>
          )}
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
  errors
}: SocioEconomicIndicatorsSectionProps) => {
  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
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
          {errors.highestEducatedPerson && (
            <p className="mt-1 text-sm text-red-600">
              {errors.highestEducatedPerson}
            </p>
          )}
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
        </div>
      </div>
    </div>
  );
};
