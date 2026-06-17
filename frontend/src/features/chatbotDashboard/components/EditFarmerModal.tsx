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
import{  CROPS,
  INDIAN_LANGUAGES,
  KVKS,
} from "../utils/metaData";
import { 
  useGetStates, 
  useGetDistricts, 
  useGetBlocks, 
  useGetVillages 
} from "@/hooks/api/location/useLocations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";

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
  onSave,
}: EditFarmerModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});

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

          <Select
            value={form.userRole || undefined}
            onValueChange={(val) => handleChange("userRole", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select User Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FARMER">FARMER</SelectItem>
              <SelectItem value="INTERNAL">INTERNAL</SelectItem>
              <SelectItem value="district_coordinator">district_coordinator</SelectItem>
              <SelectItem value="block_coordinator">block_coordinator</SelectItem>
              <SelectItem value="village_volunteer">village_volunteer</SelectItem>
            </SelectContent>
          </Select>
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
  const { data: states = [] } = useGetStates();
  const selectedStateCode = states.find((s) => s.stateNameEnglish === form.state)?.stateCode;

  const { data: districts = [] } = useGetDistricts(selectedStateCode);
  const selectedDistrictCode = districts.find((d) => d.districtNameEnglish === form.district)?.districtCode;

  const { data: blocks = [] } = useGetBlocks(selectedDistrictCode);
  const selectedBlockCode = blocks.find((b) => b.blockNameEnglish === form.blockName)?.blockCode;

  const { data: villages = [] } = useGetVillages(selectedBlockCode);

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

          <Select
            value={form.gender || undefined}
            onValueChange={(val) => handleChange("gender", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select option" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
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
          <Select
            value={form.state || undefined}
            onValueChange={(state) => {
              setForm((prev) => ({
                ...prev,
                state,
                district: "",
                blockName: "",
                villageName: "",
                nearestKVK: "",
              }));
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select State" />
            </SelectTrigger>
            <SelectContent>
              {states.map((state) => (
                <SelectItem key={state.stateCode} value={state.stateNameEnglish}>
                  {state.stateNameEnglish}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* {errors.state && (
            <p className="mt-1 text-sm text-red-600">{errors.state}</p>
          )} */}
        </div>
        <div>
          <label className="text-sm font-medium">District</label>
          <Select
            value={form.district || undefined}
            disabled={!form.state}
            onValueChange={(district) => {
              setForm((prev) => ({
                ...prev,
                district,
                blockName: "",
                villageName: "",
                nearestKVK: "",
              }));
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select District" />
            </SelectTrigger>
            <SelectContent>
              {districts.map((district) => (
                <SelectItem key={district.districtCode} value={district.districtNameEnglish}>
                  {district.districtNameEnglish}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* {errors.district && (
            <p className="mt-1 text-sm text-red-600">{errors.district}</p>
          )} */}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Block</label>
        <Select
          value={form.blockName || undefined}
          disabled={!form.district}
          onValueChange={(block) => {
            setForm((prev) => ({
              ...prev,
              blockName: block,
              villageName: "",
            }));
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select Subdistrict" />
          </SelectTrigger>
          <SelectContent>
            {blocks.map((block) => (
              <SelectItem key={block.blockCode} value={block.blockNameEnglish}>
                {block.blockNameEnglish}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium">Village</label>
        <Select
          value={form.villageName || undefined}
          disabled={!form.blockName}
          onValueChange={(val) => handleChange("villageName", val)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select Village" />
          </SelectTrigger>
          <SelectContent>
            {villages.map((village) => (
              <SelectItem key={village.villageCode} value={village.villageNameEnglish}>
                {village.villageNameEnglish}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium">Nearest KVK</label>
        <Select
          value={form.nearestKVK || undefined}
          disabled={!form.district}
          onValueChange={(val) => handleChange("nearestKVK", val)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select KVK" />
          </SelectTrigger>
          <SelectContent>
            {(KVKS[form.district] || []).map((kvk) => (
              <SelectItem key={kvk} value={kvk}>
                {kvk}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

          <Select
            value={form.primaryCrop || undefined}
            onValueChange={(val) => handleChange("primaryCrop", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Primary Crop" />
            </SelectTrigger>
            <SelectContent>
              {CROPS.map((crop) => (
                <SelectItem key={crop} value={crop}>
                  {crop}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* {errors.primaryCrop && (
            <p className="mt-1 text-sm text-red-600">{errors.primaryCrop}</p>
          )} */}
        </div>

        <div>
          <label className="text-sm font-medium">Secondary Crop</label>

          <Select
            value={form.secondaryCrop || undefined}
            onValueChange={(val) => handleChange("secondaryCrop", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Secondary Crop" />
            </SelectTrigger>
            <SelectContent>
              {CROPS.map((crop) => (
                <SelectItem key={crop} value={crop}>
                  {crop}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

          <Select
            value={form.awarenessOfKCC || undefined}
            onValueChange={(val) => handleChange("awarenessOfKCC", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Option" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
          {errors.awarenessOfKCC && (
            <p className="mt-1 text-sm text-red-600">{errors.awarenessOfKCC}</p>
          )}
        </div>

        {/* Uses Agri Apps */}
        <div>
          <label className="text-sm font-medium block mb-2">
            Uses Agricultural Apps
          </label>

          <Select
            value={form.usesAgriApps || undefined}
            onValueChange={(val) => handleChange("usesAgriApps", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Option" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
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

          <Select
            value={form.highestEducatedPerson || undefined}
            onValueChange={(val) =>
              handleChange("highestEducatedPerson", val)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Education Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Under Graduate">Under Graduate</SelectItem>
              <SelectItem value="Graduate">Graduate</SelectItem>
              <SelectItem value="Post Graduate">Post Graduate</SelectItem>
            </SelectContent>
          </Select>
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
