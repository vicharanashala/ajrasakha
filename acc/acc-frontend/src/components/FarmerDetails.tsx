import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Button } from "./atoms/button";
import { Input } from "./atoms/input";
import { Label } from "./atoms/label";
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  Save,
  X,
  User,
  MapPin,
  Phone,
  Wheat,
  Calendar,
  Users,
  Languages,
  Award,
  BookOpen,
  Smartphone,
  GraduationCap,
  Sparkles,
  Map
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

const getFieldColors = (key: string) => {
  switch (key) {
    case 'farmerName':
    case 'phoneNo':
    case 'languagePreference':
    case 'age':
    case 'gender':
      return {
        iconColor: 'text-indigo-650 dark:text-indigo-400',
        bgColor: 'bg-indigo-50/50 dark:bg-indigo-950/20',
        borderColor: 'border-indigo-100/40 dark:border-indigo-900/35'
      };
    case 'state':
    case 'villageName':
    case 'blockName':
    case 'district':
      return {
        iconColor: 'text-sky-650 dark:text-sky-400',
        bgColor: 'bg-sky-50/50 dark:bg-sky-950/20',
        borderColor: 'border-sky-100/40 dark:border-sky-900/35'
      };
    case 'primaryCrop':
    case 'secondaryCrop':
    case 'cropsCultivated':
    case 'yearsOfExperience':
      return {
        iconColor: 'text-emerald-650 dark:text-emerald-400',
        bgColor: 'bg-emerald-50/50 dark:bg-emerald-950/20',
        borderColor: 'border-emerald-100/40 dark:border-emerald-900/35'
      };
    default:
      return {
        iconColor: 'text-amber-650 dark:text-amber-400',
        bgColor: 'bg-amber-50/50 dark:bg-amber-950/20',
        borderColor: 'border-amber-100/40 dark:border-amber-900/35'
      };
  }
};

const fieldGroups = [
  {
    title: "General Profile",
    keys: ["farmerName", "phoneNo", "age", "gender", "languagePreference"],
    borderColor: "border-indigo-100/30 dark:border-indigo-900/20"
  },
  {
    title: "Location & Geography",
    keys: ["state", "district", "blockName", "villageName"],
    borderColor: "border-sky-100/30 dark:border-sky-900/20"
  },
  {
    title: "Agricultural Profile",
    keys: ["primaryCrop", "secondaryCrop", "cropsCultivated", "yearsOfExperience"],
    borderColor: "border-emerald-100/30 dark:border-emerald-900/20"
  },
  {
    title: "Social & Technology Profile",
    keys: ["awarenessOfKCC", "usesAgriApps", "highestEducatedPerson", "numberOfSmartphones"],
    borderColor: "border-amber-100/30 dark:border-amber-900/20"
  }
];

const renderValue = (key: string, value: any) => {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-100/30 dark:border-emerald-900/30 mt-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Yes
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/40 px-2 py-0.5 rounded-full border border-zinc-200/20 dark:border-zinc-700/20 mt-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
        No
      </span>
    );
  }

  if (key === 'cropsCultivated') {
    const cropsArr = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',').map(c => c.trim()).filter(Boolean)
        : [];
    if (cropsArr.length > 0) {
      return (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {cropsArr.map((crop, idx) => (
            <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50/15 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-100/20 dark:border-emerald-900/20">
              {crop}
            </span>
          ))}
        </div>
      );
    }
  }

  if (key === 'phoneNo') {
    const str = String(value);
    if (str.startsWith("91") && str.length === 12) {
      return (
        <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-100">
          {`+91 ${str.substring(2, 7)} ${str.substring(7)}`}
        </span>
      );
    }
    return (
      <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-100">
        {str}
      </span>
    );
  }

  return (
    <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-100 break-words">
      {String(value)}
    </span>
  );
};

export const FarmerDetails = ({ phoneNo, className, defaultOpen = false, extractedProfile, onProfileUpdated }: FarmerDetailsProps) => {
  const [farmer, setFarmer] = useState<FarmerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultOpen);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<FarmerProfile>({});
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    fetchFarmerDetails();
  }, [phoneNo]);

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
          : typeof raw.cropsCultivated === 'string'
            ? raw.cropsCultivated.split(',').map((c: string) => c.trim()).filter(Boolean)
            : undefined,
      highestEducatedPerson: raw.highestEducatedPerson || raw.extracted_highest_educated || "",
      numberOfSmartphones: raw.numberOfSmartphones !== undefined && raw.numberOfSmartphones !== null ? Number(raw.numberOfSmartphones) : undefined,
    };
  };

  useEffect(() => {
    if (extractedProfile && Object.keys(extractedProfile).length > 0) {
      const normalized = normalizeProfile(extractedProfile, phoneNo);
      setFarmer((prev) => ({ ...(prev || {}), ...normalized }));
      setEditForm((prev) => ({ ...prev, ...normalized }));
      setIsEditing(true);
    }
  }, [extractedProfile, phoneNo]);

  const fetchFarmerDetails = async () => {
    if (!phoneNo) {
      return;
    }
    setLoading(true);
    try {
      const data = await plivoService.getFarmerByPhoneNo(phoneNo);
      const normalized = normalizeProfile(data?.profile || {}, phoneNo);
      setFarmer(Object.keys(normalized).length > 0 ? normalized : null);
      setEditForm(normalized);
    } catch (error) {
      console.error(`[FARMER_FLOW] FarmerDetails: Failed to fetch farmer details for ${phoneNo}:`, error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!phoneNo) {
      return;
    }
    setSaveLoading(true);
    try {
      const payload = { ...editForm, phoneNo: phoneNo || editForm.phoneNo };
      if (farmer) {
        // Update existing
        await plivoService.updateFarmer(phoneNo, payload);
      } else {
        // Create new
        await plivoService.createFarmer(phoneNo, payload);
      }
      setFarmer(payload);
      setIsEditing(false);
      if (onProfileUpdated) onProfileUpdated(payload);
    } catch (error) {
      console.error(`[FARMER_FLOW] FarmerDetails: Failed to save farmer details for ${phoneNo}:`, error);
      alert("Failed to save farmer details");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCancel = () => {
    setEditForm(farmer || {});
    setIsEditing(false);
  };

  const handleInputChange = (field: keyof FarmerProfile, value: any) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Loading farmer details...</div>
        </CardContent>
      </Card>
    );
  }

  const callRelevantFields = [
    { key: 'farmerName', label: 'Name', icon: User },
    { key: 'phoneNo', label: 'Phone', icon: Phone },
    { key: 'state', label: 'State', icon: Map },
    { key: 'district', label: 'District', icon: MapPin },
    { key: 'villageName', label: 'Village', icon: MapPin },
    { key: 'primaryCrop', label: 'Primary Crop', icon: Wheat },
  ];

  const allFields = [
    ...callRelevantFields,
    { key: 'age', label: 'Age', icon: Calendar },
    { key: 'gender', label: 'Gender', icon: Users },
    { key: 'blockName', label: 'Block', icon: MapPin },
    { key: 'languagePreference', label: 'Language', icon: Languages },
    { key: 'yearsOfExperience', label: 'Years of Experience', icon: Award },
    { key: 'secondaryCrop', label: 'Secondary Crop', icon: Wheat },
    { key: 'cropsCultivated', label: 'Crops Cultivated', icon: Sparkles },
    { key: 'awarenessOfKCC', label: 'KCC Awareness', icon: BookOpen },
    { key: 'usesAgriApps', label: 'Uses Agri Apps', icon: Smartphone },
    { key: 'highestEducatedPerson', label: 'Highest Educated Person', icon: GraduationCap },
    { key: 'numberOfSmartphones', label: 'Number of Smartphones', icon: Smartphone },
  ];

  const fieldsToShow = isExpanded ? allFields : callRelevantFields;

  const renderViewCard = (key: string, label: string, Icon: any, value: any, colSpanClass: string = "") => {
    const colors = getFieldColors(key);
    const displayVal = value !== undefined && value !== null && value !== "" ? renderValue(key, value) : <span className="text-zinc-400 italic text-[11px]">-</span>;
    return (
      <div
        key={key}
        className={cn(
          "flex items-center gap-2 p-1.5 px-2 rounded-lg border transition-all duration-200 bg-white dark:bg-zinc-900/60 shadow-sm",
          colors.borderColor,
          colSpanClass
        )}
      >
        <div className={cn("flex-shrink-0 p-1 rounded-md border", colors.bgColor, colors.borderColor, colors.iconColor)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            {label}
          </span>
          <div className="mt-0.5">
            {displayVal}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className={cn("border border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/20 dark:bg-zinc-900/10 shadow-none rounded-xl !py-0 !gap-0", className)}>
      <CardHeader className="!py-2 !px-3 !pb-2 border-b border-zinc-100 dark:border-zinc-800/85">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">Farmer Details</CardTitle>
          <div className="flex items-center gap-1.5">
            {!isEditing && (
              <Button
                onClick={() => setIsEditing(true)}
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            )}
            <Button
              onClick={() => setIsExpanded(!isExpanded)}
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 gap-0.5"
              title={isExpanded ? "Show basic fields" : "Show all fields"}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              <span>{isExpanded ? "Less Fields" : "All Fields"}</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2.5 space-y-2">
        {isEditing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Name</Label>
                <Input
                  value={editForm.farmerName || ''}
                  onChange={(e) => handleInputChange('farmerName', e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Phone (Read-only)</Label>
                <Input
                  value={phoneNo || editForm.phoneNo || ''}
                  readOnly={true}
                  disabled={true}
                  className="h-7 text-xs bg-zinc-800 dark:bg-zinc-900 !text-white font-bold cursor-not-allowed border border-zinc-700 font-mono shadow-inner opacity-100"
                />
              </div>
            </div>

            {/* Village, District, State in One Line */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Village</Label>
                <Input
                  value={editForm.villageName || ''}
                  onChange={(e) => handleInputChange('villageName', e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">District</Label>
                <Input
                  value={editForm.district || ''}
                  onChange={(e) => handleInputChange('district', e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">State</Label>
                <Input
                  value={editForm.state || ''}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            </div>

            {/* Age, Gender, Language in One Single Line (Directly Below Village, District, State) */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Age</Label>
                <Input
                  type="number"
                  value={editForm.age || ''}
                  onChange={(e) => handleInputChange('age', parseInt(e.target.value) || undefined)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Gender</Label>
                <Input
                  value={editForm.gender || ''}
                  onChange={(e) => handleInputChange('gender', e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Language</Label>
                <Input
                  value={editForm.languagePreference || ''}
                  onChange={(e) => handleInputChange('languagePreference', e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            </div>

            {/* Primary Crop & Secondary Crop Side-by-Side */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Primary Crop</Label>
                <Input
                  value={editForm.primaryCrop || ''}
                  onChange={(e) => handleInputChange('primaryCrop', e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Secondary Crop</Label>
                <Input
                  value={editForm.secondaryCrop || ''}
                  onChange={(e) => handleInputChange('secondaryCrop', e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            </div>

            {/* Additional fields only when expanded */}
            {isExpanded && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-200/40 dark:border-zinc-800/40">
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Block</Label>
                  <Input
                    value={editForm.blockName || ''}
                    onChange={(e) => handleInputChange('blockName', e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Years of Experience</Label>
                  <Input
                    type="number"
                    value={editForm.yearsOfExperience || ''}
                    onChange={(e) => handleInputChange('yearsOfExperience', parseInt(e.target.value) || undefined)}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5 col-span-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Crops Cultivated</Label>
                  <Input
                    value={editForm.cropsCultivated?.join(', ') || ''}
                    onChange={(e) => handleInputChange('cropsCultivated', e.target.value.split(',').map(c => c.trim()))}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Highest Educated</Label>
                  <Input
                    value={editForm.highestEducatedPerson || ''}
                    onChange={(e) => handleInputChange('highestEducatedPerson', e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Smartphones</Label>
                  <Input
                    type="number"
                    value={editForm.numberOfSmartphones || ''}
                    onChange={(e) => handleInputChange('numberOfSmartphones', parseInt(e.target.value) || undefined)}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <Button
                onClick={handleCancel}
                size="sm"
                variant="outline"
                className="h-7 text-xs px-3"
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                size="sm"
                className="h-7 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                disabled={saveLoading}
              >
                <Save className="h-3 w-3 mr-1" />
                {saveLoading ? 'Saving...' : 'Update'}
              </Button>
            </div>
          </div>
        ) : farmer ? (
          <div className="space-y-2">
            {/* Row 1: Name & Phone */}
            <div className="grid grid-cols-2 gap-2">
              {renderViewCard('farmerName', 'Name', User, farmer.farmerName)}
              {renderViewCard('phoneNo', 'Phone', Phone, phoneNo || farmer.phoneNo)}
            </div>

            {/* Row 2: Village, District, State in One Line */}
            <div className="grid grid-cols-3 gap-2">
              {renderViewCard('villageName', 'Village', MapPin, farmer.villageName)}
              {renderViewCard('district', 'District', MapPin, farmer.district)}
              {renderViewCard('state', 'State', Map, farmer.state)}
            </div>

            {/* Row 3: Age, Gender, Language in One Single Line (Directly Below Village, District, State) */}
            <div className="grid grid-cols-3 gap-2">
              {renderViewCard('age', 'Age', Calendar, farmer.age)}
              {renderViewCard('gender', 'Gender', Users, farmer.gender)}
              {renderViewCard('languagePreference', 'Language', Languages, farmer.languagePreference)}
            </div>

            {/* Row 4: Primary Crop & Secondary Crop */}
            <div className="grid grid-cols-2 gap-2">
              {renderViewCard('primaryCrop', 'Primary Crop', Wheat, farmer.primaryCrop)}
              {renderViewCard('secondaryCrop', 'Secondary Crop', Wheat, farmer.secondaryCrop)}
            </div>

            {/* Additional fields only when expanded */}
            {isExpanded && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-200/40 dark:border-zinc-800/40">
                {renderViewCard('blockName', 'Block', MapPin, farmer.blockName)}
                {renderViewCard('yearsOfExperience', 'Years of Experience', Award, farmer.yearsOfExperience)}
                {renderViewCard('cropsCultivated', 'Crops Cultivated', Sparkles, farmer.cropsCultivated, 'col-span-2')}
                {renderViewCard('highestEducatedPerson', 'Highest Educated', GraduationCap, farmer.highestEducatedPerson)}
                {renderViewCard('numberOfSmartphones', 'Smartphones', Smartphone, farmer.numberOfSmartphones)}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center border border-dashed border-zinc-200 dark:border-zinc-800/80 rounded-2xl bg-zinc-55/20 dark:bg-zinc-900/10">
            <div className="p-3 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 mb-3 border border-zinc-200/40 dark:border-zinc-700/30">
              <User className="h-6 w-6 stroke-[1.5]" />
            </div>
            <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              No Profile Associated
            </h4>
            <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 max-w-[240px] mb-4 leading-relaxed">
              No profile has been registered for +91 {phoneNo.replace(/^91/, "")} yet.
            </p>
            <Button
              onClick={() => setIsEditing(true)}
              size="sm"
              className="h-8 px-4 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm shadow-indigo-500/15 gap-1.5"
            >
              <Edit2 className="h-3 w-3" />
              <span>Create Profile</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
