import React, { useState, useEffect } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Label } from "@/components/atoms/label";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Separator } from "@/components/atoms/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/atoms/select";
import { Filter, Globe, Layers, Bot, UserRound, MapPin, Sprout } from "lucide-react";
import { StateMultiSelect } from "@/components/atoms/StateMultiSelect";
import { CropMultiSelect } from "@/components/atoms/CropMultiSelect";
import { CROPS, Review_Level_QAI } from "@/components/MetaData";
import { useGetStates } from "@/hooks/api/location/useLocations";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";

interface QaPreferencesDialogProps {
  reviewLevel: string;
  source: string;
  states: string[];
  crops: string[];
  onFilterChange: (key: string, value: any) => void;
}

export const QaPreferencesDialog: React.FC<QaPreferencesDialogProps> = ({ reviewLevel, source, states, crops, onFilterChange }) => {
  const [open, setOpen] = useState(false);
  const { data: cropsData } = useGetAllCrops({ type: "crop", limit: 500 });
  const dbCrops = cropsData?.crops || [];
  const { data: statesResponse = [] } = useGetStates();
  const stateOptions = statesResponse.map((s) => s.stateNameEnglish);
  const [localReviewLevel, setLocalReviewLevel] = useState(reviewLevel);
  const [localSource, setLocalSource] = useState(source);
  const [localStates, setLocalStates] = useState<string[]>(states);
  const [localCrops, setLocalCrops] = useState<string[]>(crops);

  useEffect(() => {
    if (open) {
      setLocalReviewLevel(reviewLevel);
      setLocalSource(source);
      setLocalStates(states);
      setLocalCrops(crops);
    }
  }, [open, reviewLevel, source, states, crops]);

  let activeFiltersCount = 0;
  if (reviewLevel && reviewLevel !== "all") activeFiltersCount++;
  if (source && source !== "all") activeFiltersCount++;
  if (states.length > 0) activeFiltersCount++;
  if (crops.length > 0) activeFiltersCount++;

  const handleApply = () => {
    onFilterChange("review_level", localReviewLevel);
    onFilterChange("source", localSource);
    onFilterChange("states", localStates);
    onFilterChange("crops", localCrops);
    setOpen(false);
  };

  const handleReset = () => {
    setLocalReviewLevel("all");
    setLocalSource("all");
    setLocalStates([]);
    setLocalCrops([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 px-2 py-1 h-8 bg-background hover:bg-accent hover:text-accent-foreground border border-input rounded-md transition-all shadow-sm shrink-0">
          <span className="text-xs font-normal text-gray-900 dark:text-white whitespace-nowrap">Preferences</span>
          {activeFiltersCount > 0 && (
            <Badge variant="destructive" className="bg-red-500 h-4 px-1.5 min-w-4 rounded-full flex items-center justify-center text-[10px]">{activeFiltersCount}</Badge>
          )}
        </button>
      </DialogTrigger>
      <ScrollArea>
        <DialogContent className="sm:max-w-2xl max-w-[95vw]">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2"><Filter className="h-5 w-5 text-primary" /> Advanced Filters</DialogTitle>
            <p className="text-sm text-muted-foreground">Refine your search with multiple filter options</p>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4 text-primary" /> Source</Label>
                <Select value={localSource} onValueChange={setLocalSource}>
                  <SelectTrigger className="bg-background w-full"><SelectValue placeholder="Select Source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all"><div className="flex items-center gap-2"><Globe className="w-4 h-4 text-primary" /><span>All Sources</span></div></SelectItem>
                    <SelectItem value="AJRASAKHA"><div className="flex items-center gap-2"><Bot className="w-4 h-4 text-primary" /><span>Ajrasakha</span></div></SelectItem>
                    <SelectItem value="AGRI_EXPERT"><div className="flex items-center gap-2"><UserRound className="w-4 h-4 text-primary" /><span>Agri Expert</span></div></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4 text-primary" /> Review Level</Label>
                <Select value={localReviewLevel} onValueChange={setLocalReviewLevel}>
                  <SelectTrigger className="bg-background w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    {Review_Level_QAI.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" /> State/Region</Label>
                <StateMultiSelect states={stateOptions} selected={localStates} onChange={setLocalStates} />
              </div>
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold"><Sprout className="h-4 w-4 text-primary" /> Crop Type</Label>
                <CropMultiSelect dbCrops={dbCrops} crops={CROPS} selected={localCrops} onChange={setLocalCrops} />
              </div>
            </div>
          </div>
          <div className="border-t border-border mt-4 pt-4 flex gap-4 justify-between items-center w-full">
            <Button variant="ghost" className="text-muted-foreground w-1/2" onClick={handleReset}>Reset Filters</Button>
            <Button onClick={handleApply} className="w-1/2">Apply Changes</Button>
          </div>
        </DialogContent>
      </ScrollArea>
    </Dialog>
  );
};