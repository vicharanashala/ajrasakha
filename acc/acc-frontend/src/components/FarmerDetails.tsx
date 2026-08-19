import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Input } from "./atoms/input";
import { Label } from "./atoms/label";
import {
  FileText,
  Info,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";
import { plivoService } from "@/hooks/api/plivo/api";
import type { FarmerProfile } from "@/hooks/api/plivo/api";
import { cn } from "@/lib/utils";

interface FarmerDetailsProps {
  phoneNo: string;
  className?: string;
  defaultOpen?: boolean;
  extractedProfile?: FarmerProfile | null;
  onProfileUpdated?: (profile: FarmerProfile) => void;
}

export const FarmerDetails = ({
  phoneNo,
  className,
  extractedProfile,
  onProfileUpdated,
}: FarmerDetailsProps) => {
  const [farmer, setFarmer] = useState<FarmerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchedPhoneRef = useRef<string | null>(null);

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

  const handleFieldChange = (field: keyof FarmerProfile, value: any) => {
    setFarmer((prev) => {
      const updated = { ...(prev || {}), [field]: value };
      if (onProfileUpdated) onProfileUpdated(updated);
      return updated;
    });
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
        return merged;
      });
    }
  }, [extractedProfile, phoneNo]);

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

  const inputClass =
    "h-8 sm:h-8.5 w-full rounded-lg px-2.5 py-1 text-xs border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/60 transition-all font-medium";

  return (
    <Card
      className={cn(
        "border border-zinc-200/50 dark:border-zinc-800/50 bg-white/70 dark:bg-zinc-950/60 backdrop-blur-lg shadow-2xl rounded-2xl overflow-hidden transition-all duration-300",
        className,
      )}
    >
      <CardHeader className="!py-3 !px-4 border-b border-zinc-200/50 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/30">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/30 dark:border-indigo-800/30 shadow-sm">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-xs sm:text-sm font-black tracking-wider uppercase text-zinc-900 dark:text-zinc-100">
              Farmer Details
            </CardTitle>
            <p className="text-[10px] text-amber-600 dark:text-amber-400/90 flex items-center gap-1 font-medium mt-0.5">
              <Info className="h-3 w-3 shrink-0" />
              <span>Fill / Ask during call</span>
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-3.5 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500 mb-2" />
            <span className="text-xs">Loading farmer profile...</span>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[calc(100vh-230px)] overflow-y-auto pr-1 custom-scrollbar">
            {/* 1. Farmer Name */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                <span>Farmer Name</span>
                <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input
                value={activeProfile.farmerName || ""}
                onChange={(e) => handleFieldChange("farmerName", e.target.value)}
                placeholder="Enter farmer name"
                className={inputClass}
              />
            </div>

            {/* 2. Farmer Phone */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                <span>Farmer Phone</span>
                <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input
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
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                <span>Village / Location</span>
                <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input
                value={activeProfile.villageName || ""}
                onChange={(e) => handleFieldChange("villageName", e.target.value)}
                placeholder="Enter village or location"
                className={inputClass}
              />
            </div>

            {/* 4. District */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                District
              </Label>
              <Input
                value={activeProfile.district || ""}
                onChange={(e) => handleFieldChange("district", e.target.value)}
                placeholder="Enter district"
                className={inputClass}
              />
            </div>

            {/* 5. State */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                State
              </Label>
              <Input
                value={activeProfile.state || ""}
                onChange={(e) => handleFieldChange("state", e.target.value)}
                placeholder="Select or enter state"
                className={inputClass}
              />
            </div>

            {/* 6. Age */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Age
              </Label>
              <Input
                value={activeProfile.age !== undefined && activeProfile.age !== null ? String(activeProfile.age) : ""}
                onChange={(e) => handleFieldChange("age", e.target.value ? Number(e.target.value) || e.target.value : undefined)}
                placeholder="Enter age"
                className={inputClass}
              />
            </div>

            {/* 7. Gender */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Gender
              </Label>
              <Input
                value={activeProfile.gender || ""}
                onChange={(e) => handleFieldChange("gender", e.target.value)}
                placeholder="Select or enter gender"
                className={inputClass}
              />
            </div>

            {/* 8. Language Preference */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Language Preference
              </Label>
              <Input
                value={activeProfile.languagePreference || ""}
                onChange={(e) => handleFieldChange("languagePreference", e.target.value)}
                placeholder="Select or enter language"
                className={inputClass}
              />
            </div>

            {/* 9. Primary Crop */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                <span>Primary Crop</span>
                <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input
                value={activeProfile.primaryCrop || ""}
                onChange={(e) => handleFieldChange("primaryCrop", e.target.value)}
                placeholder="Select or enter primary crop"
                className={inputClass}
              />
            </div>

            {/* 10. Secondary Crop */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Secondary Crop
              </Label>
              <Input
                value={activeProfile.secondaryCrop || ""}
                onChange={(e) => handleFieldChange("secondaryCrop", e.target.value)}
                placeholder="Select or enter secondary crop"
                className={inputClass}
              />
            </div>

            {/* 11. Block */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Block
              </Label>
              <Input
                value={activeProfile.blockName || ""}
                onChange={(e) => handleFieldChange("blockName", e.target.value)}
                placeholder="Enter block name"
                className={inputClass}
              />
            </div>

            {/* 12. Years of Experience */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Years of Experience
              </Label>
              <Input
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
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Crops Cultivated
              </Label>
              <Input
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
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Highest Educated
              </Label>
              <Input
                value={activeProfile.highestEducatedPerson || ""}
                onChange={(e) => handleFieldChange("highestEducatedPerson", e.target.value)}
                placeholder="Select or enter education level"
                className={inputClass}
              />
            </div>

            {/* 15. Smartphones */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Smartphones in Household
              </Label>
              <Input
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

        <div className="pt-2.5 flex items-center justify-between gap-2 border-t border-zinc-200/50 dark:border-zinc-800/60">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>Form Auto-Save ON</span>
            <Clock className="h-3 w-3 ml-0.5 opacity-70 shrink-0" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FarmerDetails;
