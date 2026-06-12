import { Card, CardContent } from "@/components/atoms/card";
import type { UserDetail } from "@/features/chatbotDashboard/hooks/useUserDetails";

interface FarmerDetailsContentProps {
  user: UserDetail;
}

function EmptyValue() {
  return <span className="text-muted-foreground">Not provided</span>;
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">
        {value || <EmptyValue />}
      </div>
    </div>
  );
}

export function FarmerDetailsContent({
  user,
}: FarmerDetailsContentProps) {

  const fp = user?.farmerProfile;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div>
            <h2 className="text-2xl font-bold">
              {user?.name || fp?.farmerName || "Unknown User"}
            </h2>

            <p className="text-muted-foreground">
              {user?.email}
            </p>

            <div className="mt-2">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                  user?.isVerified
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {user?.isVerified ? "Verified" : "Not Verified"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-lg font-semibold">
            Account Information
          </h3>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DetailItem label="Name" value={user?.name} />
            <DetailItem label="Email" value={user?.email} />
            <DetailItem
              label="Role"
              value={user?.userRole || user?.role}
            />
            <DetailItem
              label="Total Questions"
              value={user?.totalQuestions}
            />
            <DetailItem
              label="Created At"
              value={
                user?.createdAt
                  ? new Date(user.createdAt).toLocaleString()
                  : null
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Farmer Profile */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-lg font-semibold">
            Farmer Profile
          </h3>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DetailItem
              label="Farmer Name"
              value={fp?.farmerName}
            />
            <DetailItem label="Age" value={fp?.age} />
            <DetailItem label="Gender" value={fp?.gender} />
            <DetailItem label="Phone" value={fp?.phoneNo} />
            <DetailItem
              label="Village"
              value={fp?.villageName}
            />
            <DetailItem
              label="Block"
              value={fp?.blockName}
            />
            <DetailItem
              label="District"
              value={fp?.district}
            />
            <DetailItem
              label="State"
              value={fp?.state}
            />
            <DetailItem
              label="Language"
              value={fp?.languagePreference}
            />
          </div>
        </CardContent>
      </Card>

      {/* Farm Details */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-lg font-semibold">
            Farm Details
          </h3>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DetailItem
              label="Primary Crop"
              value={fp?.primaryCrop}
            />

            <DetailItem
              label="Secondary Crop"
              value={fp?.secondaryCrop}
            />

            <DetailItem
              label="Land Holding"
              value={
                fp?.landhold
                  ? `${fp.landhold} acres`
                  : null
              }
            />

            <DetailItem
              label="Nearest KVK"
              value={fp?.nearestKVK}
            />

            <DetailItem
              label="Years of Experience"
              value={
                fp?.yearsOfExperience
                  ? `${fp.yearsOfExperience} years`
                  : null
              }
            />

            <DetailItem
              label="Crops Cultivated"
              value={fp?.cropsCultivated?.join(", ")}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}