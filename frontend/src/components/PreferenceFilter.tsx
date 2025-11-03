import { useState ,useEffect} from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
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
  CheckCircle2,
  Eye,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";

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
  handleApplyFilters
}: PreferenceFilterProps) {

  const [open, setOpen] = useState(false);
  const [shouldApply, setShouldApply] = useState(false);
  useEffect(() => {
    if (shouldApply) {
      handleApplyFilters();
      setShouldApply(false);
    }
  }, [ selectedUser, date, status, shouldApply]);

  const handleReset = () => {
    setSelectedUser("all");
    setDate("all");
    setStatus("all");
    setOpen(false);
    setShouldApply(true);
  };

  const handleApply = () => {
    setShouldApply(true);
    setOpen(false);
  };

  const activeFiltersCount =
    (selectedUser !== "all" ? 1 : 0) +
    (date !== "all" ? 1 : 0) +
    (status !== "all" ? 1 : 0);

  return (
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
          <Separator/>
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
            <Select value={selectedUser} onValueChange={setSelectedUser} disabled={isLoading}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users?.map(u => (
                  <SelectItem key={u._id} value={u._id}>
                    {u.userName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Separator/>

          {/* DATE */}
          <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Calendar className="h-4 w-4 text-primary" />
                  Date Range
                </Label>
            <Select value={date} onValueChange={setDate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
          <Separator/>

          {/* STATUS */}
          <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4 text-primary" />
                    Question Status
                  </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
              <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-primary" />
                          <span>All Statuses</span>
                        </div>
                      </SelectItem>

                      <SelectItem value="open">
                        <div className="flex items-center gap-2">
                          <Circle className="w-4 h-4 text-green-500 fill-green-500/20" />
                          <span>Open</span>
                        </div>
                      </SelectItem>

                      <SelectItem value="in-review">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-500" />
                          <span>In Review</span>
                        </div>
                      </SelectItem>

                      <SelectItem value="delayed">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                          <span>Delayed</span>
                        </div>
                      </SelectItem>

                      <SelectItem value="closed">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-red-500" />
                          <span>Closed</span>
                        </div>
                      </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator/>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setDate("all");
                setSelectedUser("all");
                setStatus('all');
               
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
  );
}
