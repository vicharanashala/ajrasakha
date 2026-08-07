import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Loader2, History, PlusCircle, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  LocationService,
  type ILocationAudit,
} from "@/hooks/services/locationService";

const locationService = new LocationService();

/** Read-only viewer for the state/district add-delete audit trail. */
export const LocationAuditModal = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data, isLoading } = useQuery({
    queryKey: ["location-audits"],
    queryFn: () => locationService.getLocationAudits(200),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const audits = (data as ILocationAudit[]) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[720px] max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" aria-hidden="true" />
            State &amp; District Audit Trail
          </DialogTitle>
          <DialogDescription>
            Every add / delete of a state or district, with the reason and who did it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 pr-1 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : audits.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No audit entries yet.
            </p>
          ) : (
            audits.map((a) => (
              <div
                key={a._id ?? `${a.entity}-${a.code}-${a.createdAt}`}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {a.action === "add" ? (
                      <PlusCircle className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-red-600" />
                    )}
                    <span className="text-sm font-semibold">
                      {a.action === "add" ? "Added" : "Deleted"} {a.entity}:{" "}
                      {a.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (code {a.code}
                      {a.entity === "district" && a.stateCode != null
                        ? `, state ${a.stateCode}`
                        : ""}
                      )
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {a.createdAt
                      ? new Date(a.createdAt).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        })
                      : ""}
                  </span>
                </div>

                <p className="mt-1.5 text-sm text-foreground">
                  <span className="text-muted-foreground">Reason: </span>
                  {a.reason}
                </p>

                {(a.performedByName || a.performedByEmail) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    By {a.performedByName || a.performedByEmail}
                    {a.performedByName && a.performedByEmail
                      ? ` (${a.performedByEmail})`
                      : ""}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocationAuditModal;
