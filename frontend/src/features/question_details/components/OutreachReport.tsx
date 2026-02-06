"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Label } from "@/components/atoms/label";
import { Input } from "@/components/atoms/input";
import { Calendar } from "@/components/atoms/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/atoms/popover";
import { Checkbox } from "@/components/atoms/checkbox";
import { Badge } from "@/components/atoms/badge";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Separator } from "@/components/atoms/separator";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { 
  CalendarIcon, 
  Loader2, 
  Mail, 
  Send, 
  Users, 
  Search,
  Check,
  X
} from "lucide-react";
import { useSendOutreachReport } from "@/hooks/api/question/useSendOutreachReport";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import { toast } from "sonner";

// Roles allowed to receive outreach reports
const ALLOWED_ROLES = ['admin', 'moderator'];

export const OutreachReport = () => {
  // Date states - default to last 7 days
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: usersResponse, isLoading: isLoadingUsers } = useGetAllUsers();
  const { mutateAsync: sendReport, isPending: isSending } = useSendOutreachReport();
  const users = useMemo(() => {
    return usersResponse?.users || [];
  }, [usersResponse]);

  // Filter eligible users by role, search, and not blocked
  const eligibleUsers = useMemo(() => {
    return users.filter((user) => {
      // Only allowed roles
      const hasAllowedRole = ALLOWED_ROLES.includes(user.role?.toLowerCase());
      // Not blocked
      const isActive = !user.isBlocked;
      // Matches search
      const matchesSearch = searchQuery === "" || 
        user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.userName?.toLowerCase().includes(searchQuery.toLowerCase());
      
      return hasAllowedRole && isActive && matchesSearch;
    });
  }, [users, searchQuery]);

  // Toggle email selection
  const toggleEmail = (email: string) => {
    setSelectedEmails(prev => 
      prev.includes(email)
        ? prev.filter(e => e !== email)
        : [...prev, email]
    );
  };

  // Select/deselect all visible users
  const toggleAll = () => {
    const visibleEmails = eligibleUsers.map(u => u.email).filter(Boolean);
    const allSelected = visibleEmails.every(email => selectedEmails.includes(email));
    
    if (allSelected) {
      setSelectedEmails(prev => prev.filter(e => !visibleEmails.includes(e)));
    } else {
      setSelectedEmails(prev => [...new Set([...prev, ...visibleEmails])]);
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    // Validation
    if (!startDate || !endDate) {
      toast.error("Please select both start and end dates");
      return;
    }
    if (startDate > endDate) {
      toast.error("Start date cannot be after end date");
      return;
    }
    if (selectedEmails.length === 0) {
      toast.error("Please select at least one recipient");
      return;
    }

    try {
      await sendReport({
        startDate,
        endDate,
        emails: selectedEmails,
      });
      
      // Reset after success
      setSelectedEmails([]);
    } catch (error) {
    }
  };

  const isSubmitDisabled = isSending || selectedEmails.length === 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="w-5 h-5 text-primary" />
          Outreach Data Report
        </CardTitle>
        <CardDescription>
          Export questions by date range and send to selected recipients
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* DATE RANGE SECTION */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <CalendarIcon className="w-4 h-4" />
            Date Range
          </Label>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Start Date */}
            <Popover open={startOpen} onOpenChange={setStartOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {startDate ? format(startDate, "PPP") : "Pick start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date);
                    setStartOpen(false);
                  }}
                    disabled={(date) => endDate ? date > endDate : false}
                />
              </PopoverContent>
            </Popover>

            {/* End Date */}
            <Popover open={endOpen} onOpenChange={setEndOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {endDate ? format(endDate, "PPP") : "Pick end date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => {
                    setEndDate(date);
                    setEndOpen(false);
                  }}
                  disabled={(date) => startDate ? date < startDate : false}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <Separator />

        {/* RECIPIENTS SECTION */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" />
              Recipients
              {selectedEmails.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selectedEmails.length} selected
                </Badge>
              )}
            </Label>
            
            {eligibleUsers.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={toggleAll}
                className="h-7 text-xs"
              >
                {eligibleUsers.every(u => selectedEmails.includes(u.email)) 
                  ? "Deselect All" 
                  : "Select All"}
              </Button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by username or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              disabled={isLoadingUsers}
            />
          </div>

          {/* User List */}
          <div className="border rounded-md">
            {isLoadingUsers ? (
              <div className="p-8 flex items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading users...
              </div>
            ) : eligibleUsers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {searchQuery 
                  ? "No users match your search" 
                  : "No eligible users found"}
              </div>
            ) : (
              <ScrollArea className="h-64">
                <div className="p-2 space-y-1">
                  {eligibleUsers.map((user) => {
                    const isSelected = selectedEmails.includes(user.email);
                    
                    return (
                      <label
                        key={user._id}
                        className={cn(
                          "flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors",
                          "hover:bg-muted/50",
                          isSelected && "bg-primary/5"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleEmail(user.email)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">
                              {user.userName}
                            </span>
                            {isSelected && (
                              <Check className="w-3 h-3 text-primary" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {user.email}
                          </p>
                          <Badge variant="outline" className="mt-1 text-[10px] capitalize">
                            {user.role}
                          </Badge>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Selected Chips */}
          {selectedEmails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedEmails.map((email) => {
                const user = users.find(u => u.email === email);
                
                return (
                  <Badge 
                    key={email} 
                    variant="secondary"
                    className="flex items-center gap-1 pr-1"
                  >
                    <span className="max-w-[150px] truncate" title={email}>
                      {user?.userName || email}
                    </span>
                    <button
                      onClick={() => toggleEmail(email)}
                      className="ml-1 hover:bg-muted rounded-sm p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </div>

        {/* SUBMIT BUTTON */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className="w-full"
          size="lg"
        >
          {isSending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending Report...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send Report to {selectedEmails.length} Recipient{selectedEmails.length !== 1 ? 's' : ''}
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          This will export questions from{" "}
          {startDate ? format(startDate, "MMM d, yyyy") : "..."} to{" "}
          {endDate ? format(endDate, "MMM d, yyyy") : "..."} and email as CSV.
        </p>
      </CardContent>
    </Card>
  );
};