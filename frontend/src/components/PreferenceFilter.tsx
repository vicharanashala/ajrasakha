import { useState, useEffect } from "react";
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
import {
  Filter,
  FileText,
  Calendar,
  RefreshCcw,
  UserIcon,
  Info,
  AlertTriangle,
  Circle,
  Clock,
  Eye,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";
import { DateRange } from "react-date-range";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";

function DateFilterModal({
  date,
  setDate,
}: {
  date: string;
  setDate: (value: string) => void;
}) {
  const today = new Date();

  // type RangeType = {
  //   startDate: Date | null;
  //   endDate: Date | null;
  //   key: string;
  // };

  const [showModal, setShowModal] = useState(false);
  const parseDate = (str: string) => {
    const [s, e] = str.split(":");
    return [new Date(s), new Date(e)];
  };

  const [dateRange, setDateRange] = useState([
    {
      startDate: date !== "all" ? parseDate(date)[0] : undefined,
      endDate: date !== "all" ? parseDate(date)[1] : undefined,
      key: "selection",
    },
  ]);

  const onDateChange = (ranges: any) => {
    setDateRange([ranges.selection]);
  };
  // const format = (date: Date) => {
  //   const fixed = new Date(date);
  //   fixed.setHours(12, 0, 0, 0); // ✅ force midday to avoid timezone shifting
  //   return fixed.toISOString().split("T")[0];
  // };

  const handleApply = () => {
    const { startDate, endDate } = dateRange[0];
    if (startDate && endDate) {
      const format = (d: Date) => {
        const t = new Date(d);
        t.setHours(12, 0, 0, 0);
        return t.toISOString().split("T")[0];
      };
      setDate(`${format(startDate)}:${format(endDate)}`); // ✅ save to parent
    } else {
      setDate("all");
    }
    setShowModal(false);
  };

  const handleReset = () => {
    setDate("all");
    setDateRange([{ startDate: undefined, endDate: undefined, key: "selection" }]);
  };

  const label =
    dateRange[0].startDate && dateRange[0].endDate
      ? `${dateRange[0].startDate.toLocaleDateString()} - ${dateRange[0].endDate.toLocaleDateString()}`
      : "All Time";

  return (
    <div>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 bg-white shadow-sm hover:shadow"
      >
        {label}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-5 rounded-md shadow-lg w-[350px]">
            <DateRange
              ranges={dateRange}
              onChange={onDateChange}
              maxDate={today}
              moveRangeOnFirstSelection={false}
              showDateDisplay={false}
              showPreview={false}
            />

            <div className="flex justify-between mt-4">
              <Button variant="outline" onClick={handleReset}>
                <RefreshCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>

              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleApply}>Apply</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PreferenceFilterProps {
  selectedUser: string;
  setSelectedUser: (value: string) => void;

  date: string;
  setDate: (value: string) => void;

  status: string;
  setStatus: (value: string) => void;

  users: { _id: string; email?: string; userName: string }[] | undefined;
  isLoading: boolean;

  handleApplyFilters: () => void;
}

export default function PreferenceFilter({
  selectedUser,
  setSelectedUser,
  date,
  setDate,
  status,
  setStatus,
  users,
  isLoading,
  handleApplyFilters,
}: PreferenceFilterProps) {
  const [open, setOpen] = useState(false);
  const [shouldApply, setShouldApply] = useState(false);

  useEffect(() => {
    if (shouldApply) {
      handleApplyFilters();
      setShouldApply(false);
    }
  }, [selectedUser, date, status, shouldApply]);

  // const handleReset = () => {
  //   setSelectedUser("all");
  //   setDate("all");
  //   setStatus("all");
  //   setOpen(false);
  //   setShouldApply(true);
  // };

  // const handleApply = () => {
  //   setShouldApply(true);
  //   setOpen(false);
  // };

  const activeFiltersCount =
    (selectedUser !== "all" ? 1 : 0) +
    (date !== "all" ? 1 : 0) +
    (status !== "all" ? 1 : 0);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="flex-1 min-w-[150px] flex items-center justify-center gap-2"
          >
            <Filter className="h-5 w-5 text-primary" />
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

        {/* ✅ Centered + Blurred Background */}
        <DialogContent className="sm:max-w-md w-full backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              Advanced Filters
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Refine your search with multiple filter options
            </p>
            <Separator />
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* USER */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <UserIcon className="h-4 w-4 text-primary" />
                User
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-sm">
                    <p>
                      This option allows filtering questions that have been
                      submitted at least once by the selected user.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Select
                value={selectedUser}
                onValueChange={setSelectedUser}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users?.map((u) => (
                    <SelectItem key={u._id} value={u._id}>
                      {u.userName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />

            {/* STATUS */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-primary" />
                Question Status
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-primary" />
                      <span>All Statuses</span>
                    </div>
                  </SelectItem>

                  <SelectItem value="approved">
                    <div className="flex items-center gap-2">
                      <Circle className="w-4 h-4 text-green-500 fill-green-500/20" />
                      <span>Approved</span>
                    </div>
                  </SelectItem>

                  <SelectItem value="in-review">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <span>In Review</span>
                    </div>
                  </SelectItem>

                  <SelectItem value="rejected">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      <span>Rejected</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            {/* DATE */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Calendar className="h-4 w-4 text-primary" />
                Date Range
              </Label>

              <DateFilterModal date={date} setDate={setDate} />
            </div>
            <Separator />
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setDate("all");
                setSelectedUser("all");
                setStatus("all");
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
                <Button onClick={() => handleApplyFilters()}>
                  Apply Preferences
                </Button>
              </DialogClose>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
