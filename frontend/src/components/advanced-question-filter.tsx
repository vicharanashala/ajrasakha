import React from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Label } from "@/components/atoms/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select";
import { Separator } from "@/components/atoms/separator";
import { Badge } from "@/components/atoms/badge";
import { Slider } from "@/components/atoms/slider";
import {
  Filter,
  FileText,
  MessageSquare,
  MapPin,
  Calendar,
  Flag,
  RefreshCcw,
} from "lucide-react";

export type QuestionFilterStatus = "all" | "open" | "answered" | "closed";
export type QuestionDateRangeFilter =
  | "all"
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year";
export const STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
].sort();
export const CROPS = ["Rice", "Wheat", "Cotton", "Sugarcane", "Vegetables"];

export type QuestionSourceFilter = "all" | "AJRASAKHA" | "AGRI_EXPERT";
export type QuestionPriorityFilter = "all" | "high" | "low" | "medium";
export type AdvanceFilterValues = {
  status: QuestionFilterStatus;
  source: QuestionSourceFilter;
  state: string;
  answersCount: [number, number];
  dateRange: QuestionDateRangeFilter;
  crop: string;
  priority: QuestionPriorityFilter;
};

interface AdvanceFilterDialogProps {
  advanceFilter: AdvanceFilterValues;
  setAdvanceFilterValues: (values: any) => void;
  handleDialogChange: (key: string, value: any) => void;
  handleApplyFilters: () => void;
  normalizedStates: string[];
  crops: string[];
  activeFiltersCount: number;
  onReset: () => void;
}

export const AdvanceFilterDialog: React.FC<AdvanceFilterDialogProps> = ({
  advanceFilter,
  setAdvanceFilterValues,
  handleDialogChange,
  handleApplyFilters,
  normalizedStates,
  crops,
  activeFiltersCount,
  onReset,
}) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="flex-1 min-w-[150px] flex items-center justify-center gap-2"
        >
          <Filter className="h-4 w-4" />
          Preferences
          {activeFiltersCount > 0 && (
            <Badge
              variant="destructive"
              className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <ScrollArea>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Advanced Filters
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Refine your search with multiple filter options
            </p>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Question Status & Source */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4" />
                  Question Status
                </Label>
                <Select
                  value={advanceFilter.status}
                  onValueChange={(v) => handleDialogChange("status", v)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="open">🟢 Open</SelectItem>
                    <SelectItem value="answered">🔵 Answered</SelectItem>
                    <SelectItem value="closed">🔴 Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="h-4 w-4" />
                  Source
                </Label>
                <Select
                  value={advanceFilter.source}
                  onValueChange={(v) => handleDialogChange("source", v)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="AJRASAKHA">Ajrasakha</SelectItem>
                    <SelectItem value="AGRI_EXPERT">Agri Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Location & Crop */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4" />
                  State/Region
                </Label>
                <Select
                  value={advanceFilter.state}
                  onValueChange={(v) => handleDialogChange("state", v)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {normalizedStates.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  Crop Type
                </Label>
                <Select
                  value={advanceFilter.crop}
                  onValueChange={(v) => handleDialogChange("crop", v)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Crops</SelectItem>
                    {crops.map((crop) => (
                      <SelectItem key={crop} value={crop}>
                        {crop}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Date Range & Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Calendar className="h-4 w-4" />
                  Date Range
                </Label>
                <Select
                  value={advanceFilter.dateRange}
                  onValueChange={(v) => handleDialogChange("dateRange", v)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="quarter">Last 3 Months</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Flag className="h-4 w-4" />
                  Priority
                </Label>
                <Select
                  value={advanceFilter.priority}
                  onValueChange={(v) => handleDialogChange("priority", v)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Number of Answers Slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="h-4 w-4" />
                  Number of Answers
                </Label>
                <Badge variant="secondary" className="text-xs">
                  {advanceFilter.answersCount[0]} -{" "}
                  {advanceFilter.answersCount[1]}
                </Badge>
              </div>
              <div className="px-2">
                <Slider
                  value={advanceFilter.answersCount}
                  onValueChange={(value) =>
                    handleDialogChange("answersCount", value)
                  }
                  max={100}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>0 answers</span>
                  <span>100+ answers</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Filter questions based on the number of answers received
              </p>
            </div>

            {/* Active Filters Badges */}
            {activeFiltersCount > 0 && (
              <>
                <Separator />
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">
                      Active Filters ({activeFiltersCount})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(advanceFilter).map(([key, value]) => {
                      if (
                        value === "all" ||
                        (Array.isArray(value) &&
                          value[0] === 0 &&
                          value[1] === 100)
                      )
                        return null;
                      return (
                        <Badge
                          key={key}
                          variant="secondary"
                          className="text-xs flex items-center gap-1"
                        >
                          {key}:{" "}
                          {Array.isArray(value)
                            ? `${value[0]}-${value[1]}`
                            : value}
                          <RefreshCcw
                            className="h-3 w-3 ml-1 cursor-pointer"
                            onClick={() =>
                              handleDialogChange(
                                key,
                                Array.isArray(value) ? [0, 100] : "all"
                              )
                            }
                          />
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setAdvanceFilterValues({
                  status: "all",
                  source: "all",
                  state: "all",
                  answersCount: [0, 100],
                  dateRange: "all",
                  crop: "all",
                  priority: "all",
                });
                onReset();
              }}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={handleApplyFilters}>Apply Preferences</Button>
              </DialogClose>
            </div>
          </DialogFooter>
        </DialogContent>
      </ScrollArea>
    </Dialog>
  );
};
