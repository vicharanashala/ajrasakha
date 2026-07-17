import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { Label } from "@/components/atoms/label";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Textarea } from "@/components/atoms/textarea";
import { Input } from "@/components/atoms/input";
import type { IUser } from "@/types";
import { RotateCcw, User, X, Loader2 } from "lucide-react";
import { useState } from "react";

interface ReroutePaeDialogProps {
  paeExperts: IUser[];
  isUsersLoading: boolean;
  isPending: boolean;
  onSubmit: (paeExpertId: string, comment: string) => void;
}

export const ReroutePaeDialog = ({
  paeExperts,
  isUsersLoading,
  isPending,
  onSubmit,
}: ReroutePaeDialogProps) => {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredExperts = paeExperts.filter(
    (expert) =>
      expert.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expert.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = () => {
    if (!selectedExpertId || !comment.trim()) return;
    onSubmit(selectedExpertId, comment.trim());
    setOpen(false);
    setComment("");
    setSelectedExpertId(null);
    setSearchTerm("");
  };

  const handleCancel = () => {
    setOpen(false);
    setComment("");
    setSelectedExpertId(null);
    setSearchTerm("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={`
            bg-amber-600 text-white
            flex items-center gap-2
            px-3 py-1 sm:px-4 sm:py-1
            rounded-md
            text-sm
            whitespace-nowrap
            transition-all duration-200
            hover:bg-amber-700 hover:shadow-md active:scale-95
          `}
        >
          <RotateCcw className="h-4 w-4" />
          PAE Modify
        </button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[85vh] min-h-[50vh] h-[75vh] flex flex-col p-4">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="p-2 rounded-lg bg-amber-100 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-amber-600" />
            </div>
            Request PAE Expert Modification
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-2">
          <Label htmlFor="pae-comment">
            Comment for PAE Expert <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="pae-comment"
            placeholder="Enter feedback / modification instructions for the PAE expert..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[80px]"
            required
          />
        </div>

        <div className="mt-2 space-y-2">
          <Label>
            Select PAE Expert <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input
              type="text"
              placeholder="Search PAE experts by name, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 border"
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
        </div>

        <ScrollArea className="flex-1 pr-2 mt-2">
          <div className="space-y-2">
            {isUsersLoading && (
              <div className="flex justify-center items-center py-10 text-muted-foreground">
                <div className="flex flex-col items-center space-y-2">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Loading PAE experts...</span>
                </div>
              </div>
            )}

            {!isUsersLoading && filteredExperts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <User className="w-8 h-8 mb-2 text-muted-foreground/80" />
                <p className="text-sm font-medium">No PAE experts available</p>
              </div>
            )}

            {!isUsersLoading &&
              filteredExperts.map((expert) => (
                <div
                  key={expert._id}
                  // @ts-ignore
                  onClick={() => setSelectedExpertId(expert._id)}
                  className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedExpertId === expert._id
                      ? "bg-amber-100 border-2 border-amber-500"
                      : "hover:bg-muted/50 border-2 border-transparent"
                  }`}
                >
                  <div className="p-2 rounded-lg bg-amber-100/60 flex items-center justify-center">
                    <User className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex flex-col flex-1">
                    <div className="font-medium truncate" title={expert.userName}>
                      {expert?.userName?.slice(0, 48)}
                      {expert?.userName && expert.userName.length > 48 ? "..." : ""}
                    </div>
                    <div
                      className="text-xs text-muted-foreground truncate"
                      title={expert.email}
                    >
                      {expert?.email?.slice(0, 48)}
                      {expert?.email?.length > 48 ? "..." : ""}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex gap-2 justify-end pt-4">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedExpertId || !comment.trim() || isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send for Modification"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
