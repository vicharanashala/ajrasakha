import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Textarea } from "@/components/atoms/textarea";
import { Checkbox } from "@/components/atoms/checkbox";
import type { IUser } from "@/types";
import { Send, UserPlus, User, X } from "lucide-react";

interface ReRouteDialogProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  comment: string;
  setComment: (comment: string) => void;
  isUsersLoading: boolean;
  filteredExperts: IUser[];
  selectedExperts: string[];
  handleSelectExpert: (expertId: string) => void;
  handleSubmit: () => void;
  handleCancel: () => void;
  lastReroutedTo: any;
}

export const ReRouteDialog = ({
  isModalOpen,
  setIsModalOpen,
  searchTerm,
  setSearchTerm,
  comment,
  setComment,
  isUsersLoading,
  filteredExperts,
  selectedExperts,
  handleSelectExpert,
  handleSubmit,
  handleCancel,
  lastReroutedTo,
}: ReRouteDialogProps) => {
  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogTrigger asChild>
        <button
          disabled={lastReroutedTo?.status === "pending"}
          className={`bg-primary text-primary-foreground flex items-center gap-2 px-2 py-2 rounded
            ${
              lastReroutedTo?.status === "pending"
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-primary/90"
            }
          `}
        >
          <Send className="h-4 w-4" />
          Re Route
        </button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-4xl lg:max-w-6xl max-h-[85vh] min-h-[60vh] h-[85vh] flex flex-col p-4">
        <div className="mt-4 space-y-2">
          <Label htmlFor="reject-comment">
            Comments <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="reject-comment"
            placeholder="Enter reason for rejection..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[100px]"
            required
          />
        </div>

        <DialogHeader className="space-y-4">
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            Select Experts Manually
          </DialogTitle>

          <div className="mt-1 relative">
            <Input
              type="text"
              placeholder="Search experts by name, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary border"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] md:max-h-[60vh] pr-2">
          <div className="space-y-3">
            {isUsersLoading && (
              <div className="flex justify-center items-center py-10 text-muted-foreground">
                <div className="flex flex-col items-center space-y-2">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Loading experts...</span>
                </div>
              </div>
            )}

            {!isUsersLoading && filteredExperts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <UserPlus className="w-8 h-8 mb-2 text-muted-foreground/80" />
                <p className="text-sm font-medium">No experts available</p>
                <p className="text-xs text-muted-foreground">
                  Try refreshing or check back later.
                </p>
              </div>
            )}

            {!isUsersLoading &&
              filteredExperts.map((expert) => (
                <div
                  key={expert._id}
                  className={`flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors ${
                    expert.isBlocked
                      ? "blur-[0px] cursor-not-allowed"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>

                  <Checkbox
                    id={`expert-${expert._id}`}
                    checked={selectedExperts.includes(expert._id)}
                    onCheckedChange={() => handleSelectExpert(expert._id)}
                    disabled={
                      expert.isBlocked ||
                      (selectedExperts.length > 0 &&
                        !selectedExperts.includes(expert._id))
                    }
                    className="mt-1"
                  />

                  <Label
                    htmlFor={`expert-${expert._id}`}
                    className="font-normal cursor-pointer flex-1 w-full"
                  >
                    <div className="flex justify-between items-center w-full">
                      <div className="flex flex-col">
                        <div
                          className="font-medium truncate"
                          title={expert.firstName}
                        >
                          {expert?.firstName?.slice(0, 48)}
                          {expert?.firstName?.length > 48 ? "..." : ""}
                        </div>
                        <div
                          className="text-xs text-muted-foreground truncate"
                          title={expert.email}
                        >
                          {expert?.email?.slice(0, 48)}
                          {expert?.email?.length > 48 ? "..." : ""}
                        </div>
                        {expert.isBlocked && (
                          <span className="mt-1 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full w-fit">
                            Blocked
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-muted-foreground flex-shrink-0 ml-2 hidden md:block">
                        {expert.preference?.domain &&
                        expert.preference.domain !== "all"
                          ? expert.preference.domain
                          : "Agriculture Expert"}
                      </div>
                    </div>
                  </Label>
                </div>
              ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex gap-2 justify-end pt-4">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="hidden md:block"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedExperts.length === 0 || !comment.trim()}
          >
            {`Submit (${selectedExperts.length} selected)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
