"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Label } from "@/components/atoms/label";
import { Input } from "@/components/atoms/input";
import { Calendar } from "@/components/atoms/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/atoms/popover";
import { Badge } from "@/components/atoms/badge";
import { Separator } from "@/components/atoms/separator";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { 
  CalendarIcon, 
  Loader2, 
  Mail, 
  Send, 
  X,
  AlertCircle,
  PlusCircle,
} from "lucide-react";
import { useSendOutreachReport } from "@/hooks/api/question/useSendOutreachReport";
import { toast } from "sonner";

// Simple email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const OutreachReportModal = ({setIsSidebarOpen}:{setIsSidebarOpen:(value:boolean) => void}) => {
  const [open, setOpen] = useState(false);
  
  // Date states - default to last 7 days
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  // Email input states
  const [emails, setEmails] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: sendReport, isPending: isSending } = useSendOutreachReport();

  const addEmail = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    
    if (!trimmed) return;
    
    if (!EMAIL_REGEX.test(trimmed)) {
      setError(`"${email}" is not a valid email address`);
      return;
    }
    
    if (emails.includes(trimmed)) {
      setError(`"${email}" is already added`);
      return;
    }
    
    setEmails(prev => [...prev, trimmed]);
    setInputValue("");
    setError(null);
  };

  const removeEmail = (emailToRemove: string) => {
    setEmails(prev => prev.filter(email => email !== emailToRemove));
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
      e.preventDefault();
      addEmail(inputValue);
    } else if (e.key === 'Backspace' && inputValue === "" && emails.length > 0) {
      removeEmail(emails[emails.length - 1]);
    }
  };

  const resetForm = () => {
    setStartDate(subDays(new Date(), 7));
    setEndDate(new Date());
    setEmails([]);
    setInputValue("");
    setError(null);
  };

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      toast.error("Please select both start and end dates");
      return;
    }
    if (startDate > endDate) {
      toast.error("Start date cannot be after end date");
      return;
    }
    if (emails.length === 0) {
      toast.error("Please add at least one recipient email");
      return;
    }

    try {
      await sendReport({
        startDate,
        endDate,
        emails: emails,
      });
      setOpen(false);
      setTimeout(resetForm, 300);
    } catch (error) {
      toast.error("Failed to send report. Please try again.");
    }
  };

  const isSubmitDisabled = isSending || emails.length === 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isSending) {
        setOpen(isOpen);
        if (!isOpen) setTimeout(resetForm, 300);
      }
      setIsSidebarOpen(false);
    }}>
      <DialogTrigger asChild>
        <button className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] hover:bg-blue-50 dark:hover:bg-blue-500/5 border border-gray-200 dark:border-gray-800 hover:border-blue-500/50 rounded-xl group transition-all shadow-sm dark:shadow-none">
           <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-500 dark:text-blue-400">
                      <Mail size={20} />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          Outreach Report
                        </p>
                        <span className="bg-red-500 text-[8px] text-white px-1 rounded uppercase font-bold">
                          New
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500">Generate & send summary</p>
                    </div>
                  </div>
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Outreach Data Report
          </DialogTitle>
          <DialogDescription>
            Select date range and enter recipient emails to send the CSV report.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* DATE RANGE SECTION */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              Date Range
            </Label>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Start Date */}
              <Popover open={startOpen} onOpenChange={setStartOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    {startDate ? format(startDate, "MMM d, yyyy") : "Start date"}
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
                      "w-full justify-start text-left font-normal h-10",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    {endDate ? format(endDate, "MMM d, yyyy") : "End date"}
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
                <Mail className="w-4 h-4" />
                Recipients
                {emails.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {emails.length}
                  </Badge>
                )}
              </Label>
              
              {emails.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setEmails([]);
                    setError(null);
                  }}
                  className="h-7 text-xs"
                  disabled={isSending}
                >
                  Clear All
                </Button>
              )}
            </div>

            {/* Email Input Field with Chips */}
            <div 
              className={cn(
                "min-h-[48px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors",
                "focus-within:outline-none focus-within:ring-1 focus-within:ring-ring",
                error && "border-red-500 focus-within:ring-red-500"
              )}
              onClick={() => inputRef.current?.focus()}
            >
              <div className="flex flex-wrap gap-2 items-center">
                {emails.map((email) => (
                  <Badge 
                    key={email} 
                    variant="secondary"
                    className="flex items-center gap-1 pr-1 bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    <span className="max-w-[150px] truncate text-xs" title={email}>
                      {email}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEmail(email);
                      }}
                      className="ml-1 hover:bg-primary/20 rounded-sm p-0.5 transition-colors"
                      disabled={isSending}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                
                <input
                  ref={inputRef}
                  type="email"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={emails.length === 0 ? "Enter email..." : "Add more..."}
                  className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground text-sm"
                  disabled={isSending}
                />
                <button
                  type="button"
                  onClick={() => addEmail(inputValue)}
                  disabled={isSending || !inputValue.trim()}
                  className="ml-2 p-1 text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  <PlusCircle className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className="w-full sm:w-auto gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};  