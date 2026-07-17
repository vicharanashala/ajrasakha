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

export const FarmerDetails = ({ phoneNo, className, defaultOpen = false }: FarmerDetailsProps) => {
  const [farmer, setFarmer] = useState<FarmerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<FarmerProfile>({});
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    fetchFarmerDetails();
  }, [phoneNo]);

  const fetchFarmerDetails = async () => {
    if (!phoneNo) {
      return;
    }
    setLoading(true);
    try {
      const data = await plivoService.getFarmerByPhoneNo(phoneNo);
      setFarmer(data?.profile || null);
      setEditForm(data?.profile || {});
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
      const payload = { ...editForm, phoneNo: editForm.phoneNo || phoneNo };
      if (farmer) {
        // Update existing
        await plivoService.updateFarmer(phoneNo, payload);
      } else {
        // Create new
        await plivoService.createFarmer(phoneNo, payload);
      }
      setFarmer(payload);
      setIsEditing(false);
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
    setEditForm(prev => ({ ...prev, [field]: value }));
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
    { key: 'villageName', label: 'Village', icon: MapPin },
    { key: 'primaryCrop', label: 'Primary Crop', icon: Wheat },
  ];

  const allFields = [
    ...callRelevantFields,
    { key: 'age', label: 'Age', icon: Calendar },
    { key: 'gender', label: 'Gender', icon: Users },
    { key: 'blockName', label: 'Block', icon: MapPin },
    { key: 'district', label: 'District', icon: MapPin },
    { key: 'languagePreference', label: 'Language', icon: Languages },
    { key: 'yearsOfExperience', label: 'Years of Experience', icon: Award },
    { key: 'secondaryCrop', label: 'Secondary Crop', icon: Wheat },
    { key: 'cropsCultivated', label: 'Crops Cultivated', icon: Sparkles },
    { key: 'awarenessOfKCC', label: 'KCC Awareness', icon: BookOpen },
    { key: 'usesAgriApps', label: 'Uses Agri Apps', icon: Smartphone },
    { key: 'highestEducatedPerson', label: 'Highest Educated Person', icon: GraduationCap },
    { key: 'numberOfSmartphones', label: 'Number of Smartphones', icon: Smartphone },
  ];


  return (
    <Card className={cn("border border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/20 dark:bg-zinc-900/10 shadow-none rounded-xl", className)}>
      <CardHeader className="border-b border-zinc-100 dark:border-zinc-800/85">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Farmer Details</CardTitle>
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
      <CardContent className="p-2 space-y-2">
        {isEditing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={editForm.farmerName || ''}
                  onChange={(e) => handleInputChange('farmerName', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={editForm.phoneNo || phoneNo}
                  onChange={(e) => handleInputChange('phoneNo', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">State</Label>
                <Input
                  value={editForm.state || ''}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Village</Label>
                <Input
                  value={editForm.villageName || ''}
                  onChange={(e) => handleInputChange('villageName', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Primary Crop</Label>
                <Input
                  value={editForm.primaryCrop || ''}
                  onChange={(e) => handleInputChange('primaryCrop', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Age</Label>
                <Input
                  type="number"
                  value={editForm.age || ''}
                  onChange={(e) => handleInputChange('age', parseInt(e.target.value) || undefined)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Gender</Label>
                <Input
                  value={editForm.gender || ''}
                  onChange={(e) => handleInputChange('gender', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">District</Label>
                <Input
                  value={editForm.district || ''}
                  onChange={(e) => handleInputChange('district', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Block</Label>
                <Input
                  value={editForm.blockName || ''}
                  onChange={(e) => handleInputChange('blockName', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Language</Label>
                <Input
                  value={editForm.languagePreference || ''}
                  onChange={(e) => handleInputChange('languagePreference', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Years of Experience</Label>
                <Input
                  type="number"
                  value={editForm.yearsOfExperience || ''}
                  onChange={(e) => handleInputChange('yearsOfExperience', parseInt(e.target.value) || undefined)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Secondary Crop</Label>
                <Input
                  value={editForm.secondaryCrop || ''}
                  onChange={(e) => handleInputChange('secondaryCrop', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Crops Cultivated (comma separated)</Label>
                <Input
                  value={editForm.cropsCultivated?.join(', ') || ''}
                  onChange={(e) => handleInputChange('cropsCultivated', e.target.value.split(',').map(c => c.trim()))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Highest Educated Person</Label>
                <Input
                  value={editForm.highestEducatedPerson || ''}
                  onChange={(e) => handleInputChange('highestEducatedPerson', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Number of Smartphones</Label>
                <Input
                  type="number"
                  value={editForm.numberOfSmartphones || ''}
                  onChange={(e) => handleInputChange('numberOfSmartphones', parseInt(e.target.value) || undefined)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                onClick={handleCancel}
                size="sm"
                variant="outline"
                className="h-8"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                size="sm"
                className="h-8"
                disabled={saveLoading}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {saveLoading ? 'Saving...' : 'Update'}
              </Button>
            </div>
          </div>
        ) : farmer ? (
          <div className="space-y-4">
            {!isExpanded ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] leading-relaxed">
                {callRelevantFields.map((field) => {
                  const value = farmer[field.key as keyof FarmerProfile];
                  if (value === undefined || value === null || value === "") return null;
                  const Icon = field.icon || User;
                  const colors = getFieldColors(field.key);
                  return (
                    <div
                      key={field.key}
                      className={cn(
                        "flex items-start gap-2.5 p-2.5 rounded-xl border transition-all duration-200 bg-white dark:bg-zinc-900/60 hover:shadow-sm",
                        colors.borderColor
                      )}
                    >
                      <div className={cn("flex-shrink-0 p-1.5 rounded-lg border", colors.bgColor, colors.borderColor, colors.iconColor)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">
                          {field.label}
                        </span>
                        <div className="mt-0.5">
                          {renderValue(field.key, value)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                {fieldGroups.map((group) => {
                  const visibleFields = group.keys.map(k => allFields.find(f => f.key === k)).filter(Boolean) as typeof allFields;
                  const hasVisibleFields = visibleFields.some(field => {
                    const val = farmer[field.key as keyof FarmerProfile];
                    return val !== undefined && val !== null && val !== "";
                  });

                  if (!hasVisibleFields) return null;

                  return (
                    <div key={group.title} className={cn("p-3 rounded-xl border bg-zinc-50/15 dark:bg-zinc-900/20", group.borderColor)}>
                      <h4 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2.5 pl-0.5">
                        {group.title}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[12px]">
                        {visibleFields.map((field) => {
                          const value = farmer[field.key as keyof FarmerProfile];
                          if (value === undefined || value === null || value === "") return null;
                          const Icon = field.icon || User;
                          const colors = getFieldColors(field.key);
                          return (
                            <div
                              key={field.key}
                              className={cn(
                                "flex items-start gap-2.5 p-2 rounded-lg border transition-all duration-200 bg-white dark:bg-zinc-900/60 hover:shadow-sm",
                                colors.borderColor
                              )}
                            >
                              <div className={cn("flex-shrink-0 p-1.5 rounded-lg border", colors.bgColor, colors.borderColor, colors.iconColor)}>
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="block text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">
                                  {field.label}
                                </span>
                                <div className="mt-0.5">
                                  {renderValue(field.key, value)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!farmer.farmerName && !farmer.phoneNo && !farmer.state && !farmer.villageName && !farmer.primaryCrop && (
              <div className="text-xs text-zinc-500 italic text-center py-2">No details available</div>
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
