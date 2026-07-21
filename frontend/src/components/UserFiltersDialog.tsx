import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Badge } from "@/components/atoms/badge";
import { Filter, MapPin } from "lucide-react";
import { useGetStates } from "@/hooks/api/location/useLocations";

interface UserFiltersDialogProps {
  isAdmin: boolean;
  filter: string;
  setFilter: (val: string) => void;
  roleFilter: string;
  setRoleFilter: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  verifiedFilter: string;
  setVerifiedFilter: (val: string) => void;
  stfFilter: string;
  setStfFilter: (val: string) => void;
  setPage: (val: number) => void;
  activeFiltersCount: number;
}

export const UserFiltersDialog: React.FC<UserFiltersDialogProps> = ({
  isAdmin,
  filter,
  setFilter,
  roleFilter,
  setRoleFilter,
  statusFilter,
  setStatusFilter,
  verifiedFilter,
  setVerifiedFilter,
  stfFilter,
  setStfFilter,
  setPage,
  activeFiltersCount,
}) => {
  const [open, setOpen] = useState(false);
  const { data: statesResponse = [] } = useGetStates();
  const states = statesResponse.map((s) => s.stateNameEnglish);

  // Draft state
  const [draftFilter, setDraftFilter] = useState(filter === "" ? "ALL" : filter);
  const [draftRole, setDraftRole] = useState(roleFilter);
  const [draftStatus, setDraftStatus] = useState(statusFilter);
  const [draftVerified, setDraftVerified] = useState(verifiedFilter);
  const [draftStf, setDraftStf] = useState(stfFilter);

  useEffect(() => {
    if (open) {
      setDraftFilter(filter === "" ? "ALL" : filter);
      setDraftRole(roleFilter);
      setDraftStatus(statusFilter);
      setDraftVerified(verifiedFilter);
      setDraftStf(stfFilter);
    }
  }, [open, filter, roleFilter, statusFilter, verifiedFilter, stfFilter]);

  const handleApply = () => {
    setFilter(draftFilter === "ALL" ? "" : draftFilter);
    setRoleFilter(draftRole);
    setStatusFilter(draftStatus);
    setVerifiedFilter(draftVerified);
    setStfFilter(draftStf);
    setPage(1);
    setOpen(false);
  };

  const handleReset = () => {
    setDraftFilter("ALL");
    setDraftRole("ALL");
    setDraftStatus("ALL");
    setDraftVerified("ALL");
    setDraftStf("ALL");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <Badge className="absolute -top-2 -right-1 h-4 text-[9px] px-1.5 py-0 bg-red-500 hover:bg-red-600 border-0 z-10 text-white">
            New
          </Badge>
          <Filter className="h-4 w-4 text-primary" />
          Filters
          {activeFiltersCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            User Filters
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-primary" />
              State
            </Label>
            <Select value={draftFilter} onValueChange={setDraftFilter}>
              <SelectTrigger className="bg-background w-full">
                <SelectValue placeholder="Select State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All States</SelectItem>
                {states.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isAdmin && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Role</Label>
                <Select value={draftRole} onValueChange={setDraftRole}>
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="moderator">Moderator</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                    <SelectItem value="pae_expert">PAE Expert</SelectItem>
                    <SelectItem value="gate_keeper">Gate Keeper</SelectItem>
                    <SelectItem value="auditor">Auditor</SelectItem>
                    <SelectItem value="tester">Tester</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Status</Label>
                <Select value={draftStatus} onValueChange={setDraftStatus}>
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="false">Unblocked</SelectItem>
                    <SelectItem value="true">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 relative">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  Verification
                  <Badge className="h-4 text-[9px] px-1.5 py-0 bg-red-500 hover:bg-red-600 border-0 text-white">
                    New
                  </Badge>
                </Label>
                <Select value={draftVerified} onValueChange={setDraftVerified}>
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder="Verification" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Users</SelectItem>
                    <SelectItem value="true">Verified</SelectItem>
                    <SelectItem value="false">Not Verified</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 relative">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  STF Status
                  <Badge className="h-4 text-[9px] px-1.5 py-0 bg-red-500 hover:bg-red-600 border-0 text-white">
                    New
                  </Badge>
                </Label>
                <Select value={draftStf} onValueChange={setDraftStf}>
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder="STF Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Users</SelectItem>
                    <SelectItem value="true">STF Users</SelectItem>
                    <SelectItem value="false">Non-STF Users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleReset}>
            Reset
          </Button>
          <Button onClick={handleApply}>Apply Filters</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
