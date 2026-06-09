import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Button } from "./atoms/button";
import { Input } from "./atoms/input";
import { Label } from "./atoms/label";
import { ChevronDown, ChevronUp, Edit2, Save, X, User, MapPin, Phone, Wheat } from "lucide-react";
import { plivoService } from "@/hooks/api/plivo/api";
import type { FarmerProfile } from "@/hooks/api/plivo/api";
import { cn } from "@/lib/utils";

interface FarmerDetailsProps {
  phoneNo: string;
  className?: string;
}

export const FarmerDetails = ({ phoneNo, className }: FarmerDetailsProps) => {
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
      if (farmer) {
        // Update existing
        await plivoService.updateFarmer(phoneNo, editForm);
      } else {
        // Create new
        await plivoService.createFarmer(phoneNo, editForm);
      }
      setFarmer(editForm);
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
    { key: 'state', label: 'State', icon: MapPin },
    { key: 'villageName', label: 'Village', icon: MapPin },
    { key: 'primaryCrop', label: 'Primary Crop', icon: Wheat },
  ];

  const allFields = [
    ...callRelevantFields,
    { key: 'age', label: 'Age', icon: null },
    { key: 'gender', label: 'Gender', icon: null },
    { key: 'blockName', label: 'Block', icon: null },
    { key: 'district', label: 'District', icon: null },
    { key: 'languagePreference', label: 'Language', icon: null },
    { key: 'yearsOfExperience', label: 'Years of Experience', icon: null },
    { key: 'secondaryCrop', label: 'Secondary Crop', icon: null },
    { key: 'cropsCultivated', label: 'Crops Cultivated', icon: null },
    { key: 'awarenessOfKCC', label: 'KCC Awareness', icon: null },
    { key: 'usesAgriApps', label: 'Uses Agri Apps', icon: null },
    { key: 'highestEducatedPerson', label: 'Highest Educated Person', icon: null },
    { key: 'numberOfSmartphones', label: 'Number of Smartphones', icon: null },
  ];

  const fieldsToShow = isExpanded ? allFields : callRelevantFields;

  return (
    <Card className={cn("border border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/20 dark:bg-zinc-900/10 shadow-none rounded-xl", className)}>
      <CardHeader className="p-2.5 pb-1.5">
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
              className="h-6 w-6 p-0 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2.5 pt-1 space-y-2">
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
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {fieldsToShow.map((field) => {
              const value = farmer[field.key as keyof FarmerProfile];
              if (!value) return null;
              const Icon = field.icon;
              return (
                <div key={field.key} className="flex items-center gap-1.5 py-0.5 min-w-0">
                  {Icon && <Icon className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />}
                  <span className="text-zinc-500 dark:text-zinc-400 min-w-[50px] shrink-0">{field.label}:</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate" title={String(value)}>
                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : Array.isArray(value) ? value.join(', ') : String(value)}
                  </span>
                </div>
              );
            })}
            {!farmer.farmerName && !farmer.phoneNo && !farmer.state && !farmer.villageName && !farmer.primaryCrop && (
              <div className="col-span-2 text-xs text-muted-foreground italic text-center py-1">No details available</div>
            )}
          </div>
        ) : (
          <div className="text-xs text-zinc-500 dark:text-zinc-400 italic">
            No farmer details found for this number
          </div>
        )}
      </CardContent>
    </Card>
  );
};
