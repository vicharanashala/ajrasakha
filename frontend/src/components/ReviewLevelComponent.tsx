import { useState } from "react";
import { useGetReviewLevel } from "@/hooks/api/user/useGetReviewLevel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  
  Loader2,
 MapPin,
 Filter,
 Leaf,
 Globe,
 FileText
  
} from "lucide-react";
import { DateRangeFilter } from "./DateRangeFilter";
import { STATES, CROPS, DOMAINS, SEASONS,STATUS } from "./MetaData";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select";
import { Label } from "@/components/atoms/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "./atoms/dialog";
import { Button } from "@/components/atoms/button";
interface DateRange {
  startTime?: Date;
  endTime?: Date;
}
type FilterSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  Icon?:any
};
type Filters = {
  state: string;
  crop: string;
  domain: string;
  status: string;
  dateRange: DateRange;
};
const FilterSelect = ({
  label,
  value,
  options,
  onChange,
  Icon
}: FilterSelectProps) => (
  <div className="space-y-2">
    <Label className="text-sm font-semibold flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-primary" />}
      {label}
    </Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={`Select ${label}`} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {" "}{label}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
const defaultFilters: Filters = {
  state: "all",
  crop: "all",
  domain: "all",
  status: "all",
  dateRange: {},
};
export const ReviewLevelComponent=()=>{
 
  const [openFilter, setOpenFilter] = useState(false);
  const [draftFilters, setDraftFilters] = useState<Filters>(defaultFilters);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  let role="moderator"
  const { data: reviewLevel, isLoading: isLoadingReviewLevel } =
    useGetReviewLevel({role,
    dateRange: filters.dateRange,
  state: filters.state,
  crop: filters.crop,
  domain: filters.domain,
  status: filters.status,
    });
    const levels = reviewLevel || [];
  const totalCompleted = levels.reduce(
    (sum, item) => sum + (item.count??0),
    0
  );
 
  const handleDraftDateChange = (key: string, value?: Date) => {
    setDraftFilters((prev) => ({
      ...prev,
      dateRange: {
        ...prev.dateRange,
        [key]: value,
      },
    }));
  };
  const updateDraft = (key: keyof Filters, value: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };
  const handleApplyFilters = () => {
    setFilters(draftFilters); // apply
    setOpenFilter(false);     // close modal
  };
  const handleClearFilters = () => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
  };
  
  return(
    <div>
      {/*summary of review level */}
      <Card className="mt-10">
      <div className="flex justify-between items-center mb-4 ml-5 mr-5">
        <h1 className="text-lg font-bold">
        Review Stage Distribution (Questions Passed at Each Level)
        </h1>
         
      <Dialog open={openFilter} onOpenChange={setOpenFilter}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4 text-primary" />
              Preferences
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-4xl ">
            <DialogHeader>
              <DialogTitle>Filter Options</DialogTitle>
            </DialogHeader>

            {/* Filter Body */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              
              <FilterSelect
                label="States / Regions"
                value={draftFilters.state}
                options={STATES}
                onChange={(val) => updateDraft("state", val)}
                Icon={MapPin}
              />

              <FilterSelect
                label="Crops"
                value={draftFilters.crop}
                options={CROPS}
                onChange={(val) => updateDraft("crop", val)}
                Icon={Leaf}
              />

              <FilterSelect
                label="Domains"
                value={draftFilters.domain}
                options={DOMAINS}
                onChange={(val) => updateDraft("domain", val)}
                Icon={Globe}
              />

              <FilterSelect
                label="Statuss"
                value={draftFilters.status}
                options={STATUS}
                onChange={(val) => updateDraft("status", val)}
                Icon={FileText}
              />
              <div className="space-y-2 min-w-0">
                    <DateRangeFilter
                  advanceFilter={draftFilters.dateRange}
                handleDialogChange={handleDraftDateChange}
                />
                </div>

            </div>

            <DialogFooter className="gap-2 mt-4">
              <Button
                variant="outline"
                onClick={handleClearFilters}
              >
                Clear
              </Button>

              <Button onClick={handleApplyFilters}>
                Apply Filters
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
          <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh] ml-5 mr-5">
            <Table className="min-w-[800px]">
              <TableHeader className="bg-card sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-center w-12">Sl.No</TableHead>
                  <TableHead className="w-[35%] text-center w-52">
                    Review Level
                  </TableHead>
                  
                  <TableHead className="text-center w-52">
                    Completed Tasks
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoadingReviewLevel ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10">
                      <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : !reviewLevel || reviewLevel.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      rowSpan={10}
                      className="text-center py-10 text-muted-foreground"
                    >
                      No Details found
                    </TableCell>
                  </TableRow>
                ) : (
                  reviewLevel.map((level: any, ind: number) => (
                    <TableRow key={ind} className="text-center">
                      <TableCell className="align-middle w-36">
                        {ind + 1}
                      </TableCell>
                      <TableCell className="align-middle w-36">
                        {level.Review_level}
                      </TableCell>
                     
                      <TableCell className="align-middle w-36">
                        {level.count}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
    </div>
  )
}