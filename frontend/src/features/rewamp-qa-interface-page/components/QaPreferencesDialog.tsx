import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Label } from "@/components/atoms/label";
import { Separator } from "@/components/atoms/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select";
import {
  Filter,
  Globe,
  Layers,
  Bot,
  UserRound,
  MapPin,
  Sprout,
} from "lucide-react";
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

export const QaPreferencesDialog: React.FC<QaPreferencesDialogProps> = ({
  reviewLevel,
  source,
  states,
  crops,
  onFilterChange,
}) => {
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
        <button
          type="button"
          className="flex items-center gap-1.5 px-2.5 py-1 h-8 bg-background hover:bg-accent hover:text-accent-foreground border border-input rounded-md transition-all shadow-xs shrink-0 cursor-pointer"
        >
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground whitespace-nowrap">
            Preferences
          </span>
          {activeFiltersCount > 0 && (
            <Badge
              variant="destructive"
              className="bg-primary text-primary-foreground h-4 px-1.5 min-w-4 rounded-full flex items-center justify-center text-[10px] font-bold"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            Preferences & Filters
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Refine your allocated questions by source, review level, state, and crop
          </p>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Top Section: Source & Review Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 min-w-0">
              <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Globe className="h-3.5 w-3.5 text-primary" />
                Source
              </Label>
              <Select value={localSource} onValueChange={setLocalSource}>
                <SelectTrigger className="bg-background w-full text-xs h-9">
                  <SelectValue placeholder="Select Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    <div className="flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-primary" />
                      <span>All Sources</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="AJRASAKHA" className="text-xs">
                    <div className="flex items-center gap-2">
                      <Bot className="w-3.5 h-3.5 text-blue-500" />
                      <span>Ajrasakha</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="AGRI_EXPERT" className="text-xs">
                    <div className="flex items-center gap-2">
                      <UserRound className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Agri Expert</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 min-w-0">
              <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Layers className="h-3.5 w-3.5 text-primary" />
                Review Level
              </Label>
              <Select
                value={localReviewLevel}
                onValueChange={setLocalReviewLevel}
              >
                <SelectTrigger className="bg-background w-full text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    All Levels
                  </SelectItem>
                  {Review_Level_QAI.map((d) => (
                    <SelectItem key={d} value={d} className="text-xs">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="bg-border/60" />

          {/* Bottom Section: Location & Crop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 min-w-0">
              <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                State / Region
              </Label>
              <StateMultiSelect
                states={stateOptions}
                selected={localStates}
                onChange={setLocalStates}
              />
            </div>

            <div className="space-y-1.5 min-w-0">
              <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Sprout className="h-3.5 w-3.5 text-primary" />
                Crop Type
              </Label>
              <CropMultiSelect
                dbCrops={dbCrops}
                crops={CROPS}
                selected={localCrops}
                onChange={setLocalCrops}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border/80 mt-2 pt-3 flex gap-3 justify-between items-center w-full">
          <Button
            type="button"
            variant="ghost"
            className="text-xs text-muted-foreground hover:text-foreground w-1/2"
            onClick={handleReset}
          >
            Reset Filters
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            className="text-xs font-semibold w-1/2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
          >
            Apply Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};