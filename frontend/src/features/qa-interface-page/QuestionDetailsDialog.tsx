import { type ReactNode } from "react";

import type {IQuestion,QuestionRerouteRepo} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/atoms/dialog";
import { Button } from "../../components/atoms/button";
import {
  
  BookOpen,
  Flag,
  FileText,
  MessageSquare,
  Calendar,
  RefreshCcw,
  MapPin,
  Map,
  Sprout,
  Sun,
  Layers,
 
  FileSearch,
  
} from "lucide-react";
import { ScrollArea } from "../../components/atoms/scroll-area";

type QuestionDetailsDialogProps = {
  question: IQuestion|QuestionRerouteRepo;
  buttonLabel?: string;
};

export const QuestionDetailsDialog = ({
  question,
  buttonLabel = "View more details",
}: QuestionDetailsDialogProps) => {
  const {
    text,
    source,
    priority,
    totalAnswersCount,
    createdAt,
    updatedAt,
    details,
    status,
  } = question;
  const Option = ({ label, value }: { label: ReactNode; value?: string }) => {
    return (
      <div className="rounded-md border p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-sm">{value ?? "-"}</div>
      </div>
    );
  };

  // const created = createdAt ? new Date(createdAt).toLocaleString() : "-";
  // const updated = updatedAt ? new Date(updatedAt).toLocaleString() : "-";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-primary/30 hover:border-primary hover:bg-primary/5 transition-all"
          aria-label={buttonLabel}
          title={buttonLabel}
        >
          <FileSearch className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">View Metadata</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-balance">Question Details</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-1 px-4">
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Summary
              </h3>
              <div className="rounded-md border p-3">
                <p className="text-sm">{text}</p>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Metadata
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-primary" /> Source
                    </div>
                  }
                  value={source}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Flag className="w-3 h-3 text-primary" /> Priority
                    </div>
                  }
                  value={priority}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <FileText className="w-3 h-3 text-primary" /> Status
                    </div>
                  }
                  value={status}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-primary" /> Total
                      Answers
                    </div>
                  }
                  value={String(totalAnswersCount ?? 0)}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-primary" /> Created At
                    </div>
                  }
                  value={createdAt}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <RefreshCcw className="w-3 h-3 text-primary" /> Updated At
                    </div>
                  }
                  value={updatedAt}
                />
              </div>
            </section>

            {/* Details */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Details
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-primary" /> State
                    </div>
                  }
                  value={details?.state}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Map className="w-3 h-3 text-primary" /> District
                    </div>
                  }
                  value={details?.district}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Sprout className="w-3 h-3 text-primary" /> Crop
                    </div>
                  }
                  value={details?.crop}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Sun className="w-3 h-3 text-primary" /> Season
                    </div>
                  }
                  value={details?.season}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Layers className="w-3 h-3 text-primary" /> Domain
                    </div>
                  }
                  value={details?.domain}
                />
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};