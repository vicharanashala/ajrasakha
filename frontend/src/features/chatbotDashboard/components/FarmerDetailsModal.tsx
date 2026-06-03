import { type ReactNode } from "react";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { type UserDetail } from "../hooks/useUserDetails";

const EMPTY_VALUE = "Not provided";

function EmptyValue() {
  return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  const hasValue = value !== null && value !== undefined && value !== "";

  return (
    <div className="rounded-md border bg-card/60 p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-foreground break-words">
        {hasValue ? value : <EmptyValue />}
      </dd>
    </div>
  );
}

function BooleanValue({ value }: { value?: boolean }) {
  if (value == null) return <EmptyValue />;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        value
          ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
          : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
      }`}
    >
      {value ? "Yes" : "No"}
    </span>
  );
}

function ListValue({ value }: { value?: string | string[] | null }) {
  const items = Array.isArray(value)
    ? value
    : value
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  if (items.length === 0) return <EmptyValue />;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded bg-muted px-2 py-0.5 text-xs font-medium"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function LatestPlatform({ user }: { user: UserDetail }) {
  const fp = user.farmerProfile;
  const latestPlatform =
    fp?.platformHistory && fp.platformHistory.length > 0
      ? fp.platformHistory[fp.platformHistory.length - 1]
      : null;

  if (latestPlatform) {
    return (
      <span>
        {latestPlatform.os}{" "}
        <span className="text-muted-foreground">
          ({new Date(latestPlatform.timestamp).toLocaleDateString("en-IN")})
        </span>
      </span>
    );
  }

  return fp?.platform ? <span>{fp.platform}</span> : <EmptyValue />;
}

function PlatformHistory({ user }: { user: UserDetail }) {
  const history = user.farmerProfile?.platformHistory ?? [];

  if (history.length === 0) return <EmptyValue />;

  return (
    <div className="space-y-1">
      {history.map((entry, index) => (
        <div key={`${entry.os}-${entry.timestamp}-${index}`}>
          {entry.os}{" "}
          <span className="text-muted-foreground">
            {new Date(entry.timestamp).toLocaleString("en-IN")}
          </span>
        </div>
      ))}
    </div>
  );
}

interface FarmerDetailsModalProps {
  user: UserDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onEdit: (user: UserDetail) => void;
  onDelete: (user: UserDetail) => void;
}

export function FarmerDetailsModal({
  user,
  open,
  onOpenChange,
  isAdmin,
  onEdit,
  onDelete,
}: FarmerDetailsModalProps) {
  const fp = user?.farmerProfile;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Farmer Details</DialogTitle>
        </DialogHeader>

        {user && (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">
                  {user.name || fp?.farmerName || EMPTY_VALUE}
                </h3>
                <p className="break-all text-sm text-muted-foreground">
                  {user.email || EMPTY_VALUE}
                </p>
              </div>

              {isAdmin && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(user)}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(user)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              )}
            </div>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Account</h4>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem label="Name" value={user.name} />
                <DetailItem label="Email" value={user.email} />
                <DetailItem label="Role" value={user.userRole || user.role} />
                <DetailItem
                  label="Query asked"
                  value={user.totalQuestions?.toLocaleString()}
                />
                <DetailItem
                  label="Created at"
                  value={
                    user.createdAt
                      ? new Date(user.createdAt).toLocaleString("en-IN")
                      : null
                  }
                />
                <DetailItem
                  label="Latest platform"
                  value={<LatestPlatform user={user} />}
                />
              </dl>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Profile</h4>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem label="Farmer name" value={fp?.farmerName} />
                <DetailItem label="Age" value={fp?.age} />
                <DetailItem label="Gender" value={fp?.gender} />
                <DetailItem label="Phone" value={fp?.phoneNo} />
                <DetailItem label="Language" value={fp?.languagePreference} />
                <DetailItem
                  label="Experience"
                  value={
                    fp?.yearsOfExperience != null
                      ? `${fp.yearsOfExperience} years`
                      : null
                  }
                />
                <DetailItem label="Village" value={fp?.villageName} />
                <DetailItem label="Block" value={fp?.blockName} />
                <DetailItem label="District" value={fp?.district} />
                <DetailItem label="State" value={fp?.state} />
                <DetailItem
                  label="Location"
                  value={
                    fp?.location?.latitude && fp?.location?.longitude ? (
                      <a
                        href={`https://maps.google.com/?q=${fp.location.latitude},${fp.location.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                      >
                        <MapPin className="h-4 w-4" />
                        View map
                      </a>
                    ) : null
                  }
                />
              </dl>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Farm Details</h4>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem
                  label="Crops cultivated"
                  value={<ListValue value={fp?.cropsCultivated} />}
                />
                <DetailItem
                  label="Primary crop"
                  value={<ListValue value={fp?.primaryCrop} />}
                />
                <DetailItem
                  label="Secondary crop"
                  value={<ListValue value={fp?.secondaryCrop} />}
                />
                <DetailItem
                  label="Landhold"
                  value={
                    fp?.landhold != null ? `${fp.landhold} acres` : null
                  }
                />
                <DetailItem
                  label="KCC aware"
                  value={<BooleanValue value={fp?.awarenessOfKCC} />}
                />
                <DetailItem
                  label="Uses agri apps"
                  value={<BooleanValue value={fp?.usesAgriApps} />}
                />
                <DetailItem
                  label="Education"
                  value={fp?.highestEducatedPerson}
                />
                <DetailItem
                  label="Smartphones"
                  value={fp?.numberOfSmartphones}
                />
                <DetailItem label="Nearest KVK" value={fp?.nearestKVK} />
                <DetailItem
                  label="Platform history"
                  value={<PlatformHistory user={user} />}
                />
              </dl>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
