import { Card, CardContent } from "@/components/atoms/card";
import type { UserDetail } from "@/features/chatbotDashboard/hooks/useUserDetails";
import { Button } from "../atoms/button";
import { useState } from "react";
import { Input } from "../atoms/input";

interface FarmerDetailsContentProps {
  user: UserDetail;
  isAdmin?: boolean;
  isChangingPassword?: boolean;
  isUpdatingVerification?: boolean;

  onEdit?: (user: UserDetail) => void;
  onDelete?: (user: UserDetail) => void;
  onVerificationChange?: (nextStatus: boolean) => void;
  onChangePassword?: (payload: {
    newPassword: string;
    keepLoggedIn: boolean;
  }) => Promise<void> | void;
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
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value || <EmptyValue />}</div>
    </div>
  );
}

export function FarmerDetailsContent({
  user,
  isAdmin,
  isChangingPassword,
  isUpdatingVerification,
  onEdit,
  onDelete,
  onVerificationChange,
  onChangePassword,
}: FarmerDetailsContentProps) {
  const fp = user?.farmerProfile;
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">
                {user?.name || fp?.farmerName || "Unknown User"}
              </h2>

              <p className="text-muted-foreground">{user?.email}</p>

              <div className="mt-3">
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

            {isAdmin && (
              <div className="flex gap-2">
                <Button
                  variant={user.isVerified ? "destructive" : "default"}
                  disabled={isUpdatingVerification}
                  onClick={() => onVerificationChange?.(!user.isVerified)}
                >
                  {user.isVerified ? "Set Unverified" : "Verify User"}
                </Button>

                <Button variant="outline" onClick={() => onEdit?.(user)}>
                  Edit
                </Button>

                <Button variant="destructive" onClick={() => onDelete?.(user)}>
                  Delete
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-lg font-semibold">Change Password</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <Input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={keepLoggedIn}
              onChange={(e) => setKeepLoggedIn(e.target.checked)}
            />

            <span className="text-sm">
              Keep user logged in for active sessions
            </span>
          </div>

          <div className="mt-4">
            <Button
              disabled={
                !newPassword ||
                newPassword !== confirmPassword ||
                isChangingPassword
              }
              onClick={() =>
                onChangePassword?.({
                  newPassword,
                  keepLoggedIn,
                })
              }
            >
              {isChangingPassword ? "Changing..." : "Change Password"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-lg font-semibold">Account Information</h3>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DetailItem label="Name" value={user?.name} />
            <DetailItem label="Email" value={user?.email} />
            <DetailItem label="Role" value={user?.userRole || user?.role} />
            <DetailItem label="Total Questions" value={user?.totalQuestions} />
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
          <h3 className="mb-4 text-lg font-semibold">Farmer Profile</h3>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DetailItem label="Farmer Name" value={fp?.farmerName} />
            <DetailItem label="Age" value={fp?.age} />
            <DetailItem label="Gender" value={fp?.gender} />
            <DetailItem label="Phone" value={fp?.phoneNo} />
            <DetailItem label="Village" value={fp?.villageName} />
            <DetailItem label="Block" value={fp?.blockName} />
            <DetailItem label="District" value={fp?.district} />
            <DetailItem label="State" value={fp?.state} />
            <DetailItem label="Language" value={fp?.languagePreference} />
          </div>
        </CardContent>
      </Card>

      {/* Farm Details */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-lg font-semibold">Farm Details</h3>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DetailItem label="Primary Crop" value={fp?.primaryCrop} />

            <DetailItem label="Secondary Crop" value={fp?.secondaryCrop} />

            <DetailItem
              label="Land Holding"
              value={fp?.landhold ? `${fp.landhold} acres` : null}
            />

            <DetailItem label="Nearest KVK" value={fp?.nearestKVK} />

            <DetailItem
              label="Years of Experience"
              value={
                fp?.yearsOfExperience ? `${fp.yearsOfExperience} years` : null
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
