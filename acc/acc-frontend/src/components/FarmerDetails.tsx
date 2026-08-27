import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Input } from "./atoms/input";
import { Label } from "./atoms/label";
import { Button } from "./atoms/button";
import {
  Info,
  CheckCircle2,
  Clock,
  Loader2,
  Save,
  AlertCircle,
} from "lucide-react";
import { plivoService } from "@/hooks/api/plivo/api";
import type { FarmerProfile } from "@/hooks/api/plivo/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface FarmerDetailsProps {
  phoneNo: string;
  className?: string;
  defaultOpen?: boolean;
  disabled?: boolean;
  extractedProfile?: FarmerProfile | null;
  onProfileUpdated?: (profile: FarmerProfile) => void;
}

export const FarmerDetails = ({
  phoneNo,
  className,
  disabled = false,
  extractedProfile,
  onProfileUpdated,
}: FarmerDetailsProps) => {
  const [farmer, setFarmer] = useState<FarmerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastFetchedPhoneRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstMountRef = useRef<boolean>(true);

  const normalizeProfile = (raw: any, activePhone?: string): FarmerProfile => {
    if (!raw) return {};
    const phone = activePhone || raw.phoneNo || raw.extracted_phone || raw.phone || "";
    return {
      farmerName: raw.farmerName || raw.extracted_name || raw.name || raw.farmer_name || "",
      phoneNo: phone,
      age: raw.age !== undefined && raw.age !== null ? Number(raw.age) : raw.extracted_age !== undefined && raw.extracted_age !== null ? Number(raw.extracted_age) : undefined,
      gender: raw.gender || raw.extracted_gender || "",
      villageName: raw.villageName || raw.extracted_village || raw.village || "",
      blockName: raw.blockName || raw.extracted_block || raw.block || "",
      district: raw.district || raw.extracted_district || "",
      state: raw.state || raw.extracted_state || "",
      primaryCrop: raw.primaryCrop || raw.extracted_primary_crop || raw.extracted_crop || raw.crop || "",
      secondaryCrop: raw.secondaryCrop || raw.extracted_secondary_crop || "",
      languagePreference: raw.languagePreference || raw.extracted_language || raw.language || "",
      yearsOfExperience: raw.yearsOfExperience !== undefined && raw.yearsOfExperience !== null ? Number(raw.yearsOfExperience) : undefined,
      cropsCultivated: Array.isArray(raw.cropsCultivated)
        ? raw.cropsCultivated
        : raw.extracted_crop
          ? [raw.extracted_crop]
          : typeof raw.cropsCultivated === "string"
            ? raw.cropsCultivated.split(",").map((c: string) => c.trim()).filter(Boolean)
            : undefined,
      highestEducatedPerson: raw.highestEducatedPerson || raw.extracted_highest_educated || "",
      numberOfSmartphones: raw.numberOfSmartphones !== undefined && raw.numberOfSmartphones !== null ? Number(raw.numberOfSmartphones) : undefined,
    };
  };

  const persistFarmerProfile = useCallback(async (profileToSave: FarmerProfile, targetPhone?: string) => {
    const phoneKey = (targetPhone || profileToSave.phoneNo || phoneNo || "").trim();
    if (!phoneKey) {
      return;
    }

    // Must have at least some data to save
    const hasData = profileToSave.farmerName || profileToSave.villageName || profileToSave.primaryCrop || profileToSave.state || profileToSave.district || profileToSave.blockName;
    if (!hasData) {
      return;
    }

    try {
      setSaveStatus("saving");
      const cleanPayload: FarmerProfile = {
        ...profileToSave,
        phoneNo: phoneKey,
      };

      await plivoService.updateFarmer(phoneKey, cleanPayload);
      setSaveStatus("saved");
      console.log(`✅ [FARMER_FLOW] Successfully auto-saved farmer profile for ${phoneKey}:`, cleanPayload);
    } catch (err) {
      console.error(`❌ [FARMER_FLOW] Failed to auto-save farmer profile for ${phoneKey}:`, err);
      setSaveStatus("error");
    }
  }, [phoneNo]);

  const scheduleAutoSave = useCallback((updatedProfile: FarmerProfile) => {
    if (disabled) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    setSaveStatus("idle");
    autoSaveTimerRef.current = setTimeout(() => {
      persistFarmerProfile(updatedProfile);
    }, 800);
  }, [disabled, persistFarmerProfile]);

  const handleFieldChange = (field: keyof FarmerProfile, value: any) => {
    if (disabled) return;
    setFarmer((prev) => {
      const updated = { ...(prev || {}), [field]: value };
      if (onProfileUpdated) onProfileUpdated(updated);
      scheduleAutoSave(updated);
      return updated;
    });
  };

  const handleManualSave = async () => {
    if (disabled) return;
    const currentPhone = (farmer?.phoneNo || phoneNo || "").trim();
    if (!currentPhone) {
      toast.error("Please provide a farmer phone number to save details.");
      return;
    }
    const currentProfile: FarmerProfile = {
      ...(farmer || {}),
      phoneNo: currentPhone,
    };
    try {
      setSaveStatus("saving");
      await plivoService.updateFarmer(currentPhone, currentProfile);
      setSaveStatus("saved");
      toast.success(`Farmer profile for ${currentPhone} saved successfully.`);
    } catch (err: any) {
      setSaveStatus("error");
      toast.error("Failed to save farmer profile.");
    }
  };

  useEffect(() => {
    if (phoneNo && phoneNo.trim() !== "") {
      if (phoneNo !== lastFetchedPhoneRef.current) {
        lastFetchedPhoneRef.current = phoneNo;
        fetchFarmerDetails();
      }
    }
  }, [phoneNo]);

  useEffect(() => {
    if (extractedProfile && Object.keys(extractedProfile).length > 0) {
      const normalized = normalizeProfile(extractedProfile, phoneNo);
      setFarmer((prev) => {
        const merged = { ...(prev || {}), ...normalized };
        if (onProfileUpdated) onProfileUpdated(merged);
        if (!isFirstMountRef.current && !disabled) {
          scheduleAutoSave(merged);
        }
        return merged;
      });
    }
    isFirstMountRef.current = false;
  }, [extractedProfile, phoneNo, disabled, scheduleAutoSave]);

  const fetchFarmerDetails = async () => {
    if (!phoneNo) return;
    setLoading(true);
    try {
      const data = await plivoService.getFarmerByPhoneNo(phoneNo);
      const normalized = normalizeProfile(data?.profile || {}, phoneNo);
      const profileData = Object.keys(normalized).length > 0 ? normalized : null;
      setFarmer(profileData);
      if (profileData && onProfileUpdated) onProfileUpdated(profileData);
    } catch (error) {
      console.error(`[FarmerDetails] Failed to fetch farmer details for ${phoneNo}:`, error);
    } finally {
      setLoading(false);
    }
  };

  const activeProfile: FarmerProfile = farmer || {};

  const inputClass = cn(
    "h-7 w-full rounded-md px-2 py-0.5 text-xs border transition-all font-medium",
    disabled
      ? "bg-zinc-100/70 dark:bg-zinc-900/40 border-zinc-200/50 dark:border-zinc-800/50 text-zinc-400 dark:text-zinc-500 cursor-not-allowed select-none placeholder:text-zinc-400/50"
      : "border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/60"
  );

  return (
    <Card
      className={cn(
        "border border-zinc-200/50 dark:border-zinc-800/50 bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg shadow-2xl rounded-xl overflow-hidden transition-all duration-300 flex flex-col !gap-0 !p-0 !py-0",
        disabled && "opacity-85 select-none",
        className,
      )}
    >
      <CardHeader className="!py-1.5 !px-3.5 !pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0 !gap-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", disabled ? "bg-zinc-400 dark:bg-zinc-600" : "bg-indigo-500")}></span>
            <CardTitle className="text-xs font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
              Farmer Details
            </CardTitle>
          </div>
          {disabled ? (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium flex items-center gap-1">
              <Info className="h-3 w-3 shrink-0" />
              No Active Call
            </span>
          ) : (
            <span className="text-[10px] text-amber-600 dark:text-amber-400/90 font-medium flex items-center gap-1">
              <Info className="h-3 w-3 shrink-0" />
              Fill / Ask during call
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="!p-2.5 !px-3 space-y-1.5 flex-1 flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500 mb-1.5" />
            <span className="text-xs">Loading farmer profile...</span>
          </div>
        ) : (
          <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
            {/* 1. Farmer Name */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                <span>Farmer Name</span>
                <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input
                disabled={disabled}
                value={activeProfile.farmerName || ""}
                onChange={(e) => handleFieldChange("farmerName", e.target.value)}
                placeholder="Enter farmer name"
                className={inputClass}
              />
            </div>

            {/* 2. Farmer Phone */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                <span>Farmer Phone</span>
                <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input
                disabled={disabled}
                value={activeProfile.phoneNo || phoneNo || ""}
                onChange={(e) => handleFieldChange("phoneNo", e.target.value)}
                placeholder="+91 Enter phone number"
                className={cn(
                  inputClass,
                  phoneNo ? "font-mono font-bold bg-zinc-100/80 dark:bg-zinc-900/80" : "",
                )}
              />
            </div>

            {/* 3. Village / Location */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                <span>Village / Location</span>
                <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input
                disabled={disabled}
                value={activeProfile.villageName || ""}
                onChange={(e) => handleFieldChange("villageName", e.target.value)}
                placeholder="Enter village or location"
                className={inputClass}
              />
            </div>

            {/* 4. District */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400">
                District
              </Label>
              <Input
                disabled={disabled}
                value={activeProfile.district || ""}
                onChange={(e) => handleFieldChange("district", e.target.value)}
                placeholder="Enter district"
                className={inputClass}
              />
            </div>

            {/* 5. State */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400">
                State
              </Label>
              <Input
                disabled={disabled}
                value={activeProfile.state || ""}
                onChange={(e) => handleFieldChange("state", e.target.value)}
                placeholder="Select or enter state"
                className={inputClass}
              />
            </div>

            {/* 6. Age */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400">
                Age
              </Label>
              <Input
                disabled={disabled}
                value={activeProfile.age !== undefined && activeProfile.age !== null ? String(activeProfile.age) : ""}
                onChange={(e) => handleFieldChange("age", e.target.value ? Number(e.target.value) || e.target.value : undefined)}
                placeholder="Enter age"
                className={inputClass}
              />
            </div>

            {/* 7. Gender */}
            <div className="space-y-1">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400">
                Gender
              </Label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { value: "Male", label: "Male" },
                  { value: "Female", label: "Female" },
                  { value: "Other", label: "Other" },
                ].map((option) => {
                  const isSelected =
                    (activeProfile.gender || "").toLowerCase() === option.value.toLowerCase();
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && handleFieldChange("gender", option.value)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 h-7 px-2 text-xs font-medium rounded-md border transition-all select-none",
                        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                        isSelected
                          ? disabled
                            ? "bg-zinc-400 dark:bg-zinc-700 text-white border-zinc-400 dark:border-zinc-700 font-semibold"
                            : "bg-indigo-600 text-white border-indigo-600 shadow-sm font-semibold dark:bg-indigo-500 dark:border-indigo-500"
                          : "bg-white/70 dark:bg-zinc-900/70 border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
                      )}
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full border flex items-center justify-center shrink-0",
                          isSelected
                            ? "border-white bg-white"
                            : "border-zinc-400 dark:border-zinc-500"
                        )}
                      >
                        {isSelected && (
                          <span className="w-1 h-1 rounded-full bg-indigo-600" />
                        )}
                      </span>
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 8. Language Preference */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400">
                Language Preference
              </Label>
              <Input
                disabled={disabled}
                value={activeProfile.languagePreference || ""}
                onChange={(e) => handleFieldChange("languagePreference", e.target.value)}
                placeholder="Select or enter language"
                className={inputClass}
              />
            </div>

            {/* 9. Primary Crop */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                <span>Primary Crop</span>
                <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input
                disabled={disabled}
                value={activeProfile.primaryCrop || ""}
                onChange={(e) => handleFieldChange("primaryCrop", e.target.value)}
                placeholder="Select or enter primary crop"
                className={inputClass}
              />
            </div>

            {/* 10. Secondary Crop */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400">
                Secondary Crop
              </Label>
              <Input
                disabled={disabled}
                value={activeProfile.secondaryCrop || ""}
                onChange={(e) => handleFieldChange("secondaryCrop", e.target.value)}
                placeholder="Select or enter secondary crop"
                className={inputClass}
              />
            </div>

            {/* 11. Block */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400">
                Block
              </Label>
              <Input
                disabled={disabled}
                value={activeProfile.blockName || ""}
                onChange={(e) => handleFieldChange("blockName", e.target.value)}
                placeholder="Enter block name"
                className={inputClass}
              />
            </div>

            {/* 12. Years of Experience */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400">
                Years of Experience
              </Label>
              <Input
                disabled={disabled}
                value={
                  activeProfile.yearsOfExperience !== undefined && activeProfile.yearsOfExperience !== null
                    ? String(activeProfile.yearsOfExperience)
                    : ""
                }
                onChange={(e) => handleFieldChange("yearsOfExperience", e.target.value ? Number(e.target.value) || e.target.value : undefined)}
                placeholder="Enter years of experience"
                className={inputClass}
              />
            </div>

            {/* 13. Crops Cultivated */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400">
                Crops Cultivated
              </Label>
              <Input
                disabled={disabled}
                value={
                  Array.isArray(activeProfile.cropsCultivated)
                    ? activeProfile.cropsCultivated.join(", ")
                    : activeProfile.cropsCultivated || ""
                }
                onChange={(e) => handleFieldChange("cropsCultivated", e.target.value.split(",").map(c => c.trim()))}
                placeholder="e.g. Wheat, Rice, Cotton"
                className={inputClass}
              />
            </div>

            {/* 14. Highest Educated */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400">
                Highest Educated
              </Label>
              <Input
                disabled={disabled}
                value={activeProfile.highestEducatedPerson || ""}
                onChange={(e) => handleFieldChange("highestEducatedPerson", e.target.value)}
                placeholder="Select or enter education level"
                className={inputClass}
              />
            </div>

            {/* 15. Smartphones */}
            <div className="space-y-0.5">
              <Label className="text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-400">
                Smartphones in Household
              </Label>
              <Input
                disabled={disabled}
                value={
                  activeProfile.numberOfSmartphones !== undefined && activeProfile.numberOfSmartphones !== null
                    ? String(activeProfile.numberOfSmartphones)
                    : ""
                }
                onChange={(e) => handleFieldChange("numberOfSmartphones", e.target.value ? Number(e.target.value) || e.target.value : undefined)}
                placeholder="Enter number of smartphones"
                className={inputClass}
              />
            </div>
          </div>
        )}

        <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-zinc-200/50 dark:border-zinc-800/60 shrink-0">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
            {saveStatus === "saving" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-amber-500 shrink-0" />
                <span className="text-amber-600 dark:text-amber-400">Saving...</span>
              </>
            ) : saveStatus === "saved" ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                <span className="text-emerald-600 dark:text-emerald-400">Saved to Database</span>
              </>
            ) : saveStatus === "error" ? (
              <>
                <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                <span className="text-red-600 dark:text-red-400">Save Error</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                <span>Form Auto-Save ON</span>
                <Clock className="h-2.5 w-2.5 ml-0.5 opacity-70 shrink-0" />
              </>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            onClick={handleManualSave}
            disabled={disabled || saveStatus === "saving"}
            className={cn(
              "h-6 px-2 text-[10.5px] font-bold rounded-md flex items-center gap-1 shadow-sm transition-all",
              disabled
                ? "bg-zinc-300 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500 cursor-not-allowed hover:bg-zinc-300 dark:hover:bg-zinc-800"
                : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            )}
          >
            {saveStatus === "saving" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            <span>Save Profile</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FarmerDetails;
