import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/atoms/dialog";
import { Button } from "../../components/atoms/button";
import { Input } from "../../components/atoms/input";
import { ScrollArea } from "../../components/atoms/scroll-area";
import { Loader2, Search, UserCheck, Users, FileText, X } from "lucide-react";
import { useGetAllUsers } from "../../hooks/api/user/useGetAllUsers";

type AllocationMode = "expert" | "draft" | "pae_expert";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (mode: AllocationMode, paeExpertId?: string) => void;
  isLoading?: boolean;
}

export function BulkUploadAllocationModal({
  open,
  onClose,
  onConfirm,
  isLoading,
}: Props) {
  const [selectedMode, setSelectedMode] = useState<AllocationMode>("expert");
  const [selectedPaeExpertId, setSelectedPaeExpertId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: usersData, isLoading: isUsersLoading } = useGetAllUsers({
    enabled: open && selectedMode === "pae_expert",
  });

  useEffect(() => {
    if (open) {
      setSelectedMode("expert");
      setSelectedPaeExpertId(null);
      setSearchTerm("");
    }
  }, [open]);

  const paeExperts =
    usersData?.users.filter((u) => u.role === "pae_expert") ?? [];

  const filteredPaeExperts = paeExperts.filter(
    (e) =>
      e.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleConfirm = () => {
    if (selectedMode === "pae_expert" && !selectedPaeExpertId) return;
    onConfirm(selectedMode, selectedPaeExpertId ?? undefined);
  };

  const isConfirmDisabled =
    isLoading || (selectedMode === "pae_expert" && !selectedPaeExpertId);

  const options: {
    mode: AllocationMode;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      mode: "expert",
      label: "Allocate Questions to Expert",
      description:
        "Questions will be automatically assigned to available experts based on their preferences.",
      icon: <Users className="h-5 w-5" />,
    },
    {
      mode: "draft",
      label: "Save Questions to Draft",
      description:
        "Questions will be created but not assigned to any expert. You can allocate them later.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      mode: "pae_expert",
      label: "Assign to PAE Expert",
      description:
        "Manually assign all questions to a specific PAE expert.",
      icon: <UserCheck className="h-5 w-5" />,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose Allocation Method</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {options.map((opt) => (
            <button
              key={opt.mode}
              type="button"
              onClick={() => {
                setSelectedMode(opt.mode);
                setSelectedPaeExpertId(null);
                setSearchTerm("");
              }}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors w-full ${
                selectedMode === opt.mode
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <span
                className={`mt-0.5 flex-shrink-0 ${
                  selectedMode === opt.mode
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {opt.icon}
              </span>
              <div>
                <p className="text-sm font-medium leading-none mb-1">
                  {opt.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {opt.description}
                </p>
              </div>
            </button>
          ))}
        </div>

        {selectedMode === "pae_expert" && (
          <div className="flex flex-col gap-2 mt-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search PAE experts..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {isUsersLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPaeExperts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {paeExperts.length === 0
                  ? "No PAE experts found."
                  : "No results match your search."}
              </p>
            ) : (
              <ScrollArea className="h-40 rounded-md border">
                <div className="flex flex-col p-1">
                  {filteredPaeExperts.map((expert) => (
                    <button
                      key={expert._id}
                      type="button"
                      onClick={() => setSelectedPaeExpertId(expert._id)}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        selectedPaeExpertId === expert._id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {expert.userName[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {expert.userName}
                        </p>
                        <p
                          className={`truncate text-xs ${
                            selectedPaeExpertId === expert._id
                              ? "text-primary-foreground/80"
                              : "text-muted-foreground"
                          }`}
                        >
                          {expert.email}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        <DialogFooter className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              "Confirm & Upload"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
