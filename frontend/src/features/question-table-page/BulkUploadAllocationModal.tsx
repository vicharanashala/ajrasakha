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
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  UserCheck,
  Users,
  FileText,
  X,
} from "lucide-react";
import { useGetAllUsers } from "../../hooks/api/user/useGetAllUsers";

type AllocationMode = "expert" | "draft" | "pae_expert";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (mode: AllocationMode, paeExpertId?: string) => void;
  isLoading?: boolean;
  /** When true, skip mode selection and show only the PAE expert picker */
  paeOnly?: boolean;
}

export function BulkUploadAllocationModal({
  open,
  onClose,
  onConfirm,
  isLoading,
  paeOnly = false,
}: Props) {
  const [selectedMode, setSelectedMode] = useState<AllocationMode>(paeOnly ? "pae_expert" : "expert");
  const [selectedPaeExpertId, setSelectedPaeExpertId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedExpertId, setExpandedExpertId] = useState<string | null>(null);

  const { data: usersData, isLoading: isUsersLoading } = useGetAllUsers({
    enabled: open && selectedMode === "pae_expert",
  });

  useEffect(() => {
    if (open) {
      setSelectedMode(paeOnly ? "pae_expert" : "expert");
      setSelectedPaeExpertId(null);
      setSearchTerm("");
      setExpandedExpertId(null);
    }
  }, [open, paeOnly]);

  const paeExperts =
    (usersData?.users ?? []).filter((u) => u.role === "pae_expert");

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
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl flex-col overflow-hidden p-0 sm:max-h-[85vh]">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle>
            {paeOnly ? "Allocate to PAE Expert" : "Choose Allocation Method"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!paeOnly && (
            <div className="flex flex-col gap-3 px-6 py-3">
              {options.map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => {
                    setSelectedMode(opt.mode);
                    setSelectedPaeExpertId(null);
                    setSearchTerm("");
                  }}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
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
                    <p className="mb-1 text-sm font-medium leading-none">
                      {opt.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {opt.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedMode === "pae_expert" && (
            <div className="mt-1 flex min-h-0 flex-col gap-3 px-6 py-3">
              <div className="relative shrink-0">
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
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {paeExperts.length === 0
                    ? "No PAE experts found."
                    : "No results match your search."}
                </p>
              ) : (
                <ScrollArea className="min-h-0 flex-1 rounded-lg border p-1">
                  <div className="flex flex-col p-1">
                    {filteredPaeExperts.map((expert) => {
                      const isSelected = selectedPaeExpertId === expert._id;
                      const isExpanded = expandedExpertId === expert._id;

                      return (
                        <div
                          key={expert._id}
                          className={`mb-1 w-full rounded-xl border text-sm transition-all ${
                            isSelected
                              ? "border-primary bg-primary/8 shadow-sm"
                              : "border-transparent hover:border-border hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-start gap-3 px-5 py-4">
                            <div
                              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                                isSelected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-primary/10 text-primary"
                              }`}
                            >
                              {expert.userName[0]?.toUpperCase() ?? "?"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => setSelectedPaeExpertId(expert._id)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <p className="min-w-0 truncate text-sm font-semibold">
                                      {expert.userName}
                                    </p>
                                    {isSelected && (
                                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                                        Selected
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {expert.email}
                                  </p>
                                </button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-muted-foreground"
                                  onClick={() =>
                                    setExpandedExpertId((prev) =>
                                      prev === expert._id ? null : expert._id,
                                    )
                                  }
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="h-4 w-4" />
                                      <span className="sr-only">Collapse details</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="h-4 w-4" />
                                      <span className="sr-only">Expand details</span>
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="grid gap-x-6 gap-y-4 border-t px-5 pb-5 pt-4 md:grid-cols-2">
                              <div className="min-w-0">
                                <div className="space-y-1">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Mobile
                                  </p>
                                  <p className="truncate text-xs font-medium">
                                    {typeof expert.mobile === "string" &&
                                    expert.mobile.trim()
                                      ? expert.mobile
                                      : "N/A"}
                                  </p>
                                </div>
                              </div>

                              <div className="min-w-0">
                                <div className="space-y-1">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    University
                                  </p>
                                  <p className="truncate text-xs font-medium">
                                    {typeof expert.university === "string" &&
                                    expert.university.trim()
                                      ? expert.university
                                      : "N/A"}
                                  </p>
                                </div>
                              </div>

                              <div className="min-w-0">
                                <div className="space-y-1">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    State
                                  </p>
                                  <p className="truncate text-xs font-medium">
                                    {typeof expert.state === "string" &&
                                    expert.state.trim()
                                      ? expert.state
                                      : "N/A"}
                                  </p>
                                </div>
                              </div>

                              <div className="min-w-0">
                                <div className="space-y-1">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Domain
                                  </p>
                                  <p className="truncate text-xs font-medium">
                                    {typeof expert.domain === "string" &&
                                    expert.domain.trim()
                                      ? expert.domain
                                      : "N/A"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 shrink-0 border-t px-6 py-4">
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
                {paeOnly ? "Allocating..." : "Uploading..."}
              </>
            ) : (
              paeOnly ? "Allocate to PAE" : "Confirm & Upload"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
