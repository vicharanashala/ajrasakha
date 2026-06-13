import { ArrowLeft, Gauge, MessageSquareText, Sprout } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Skeleton } from "@/components/atoms/skeleton";
import { useUserDetails } from "./hooks/useUserDetails";

type FarmerDashboardProps = {
  userId: string;
  source?: "annam" | "whatsapp";
};

const isLikelyObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value);

export function FarmerDashboard({
  userId,
  source = "annam",
}: FarmerDashboardProps) {
  const navigate = useNavigate();
  const canFetch = isLikelyObjectId(userId);
  const { data, isLoading, error } = useUserDetails(
    undefined,
    undefined,
    1,
    1,
    "",
    source,
    "",
    [],
    [],
    "",
    "",
    "",
    "",
    "all",
    false,
    false,
    "all",
    [],
    "name",
    "asc",
    false,
    "",
    "all",
    userId,
    canFetch,
  );

  const farmer = data.users[0];
  const farmerName =
    farmer?.farmerProfile?.farmerName || farmer?.name || "Farmer";

  return (
    <div className="min-h-screen bg-background px-4 py-5 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => navigate({ to: "/home" })}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Badge variant="outline" className="capitalize">
                {source}
              </Badge>
            </div>
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              Farmer Dashboard
            </h1>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              {userId}
            </p>
          </div>
        </div>

        {!canFetch && (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm font-medium text-destructive">
                Invalid farmer user ID.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Please open the dashboard from a farmer record.
              </p>
            </CardContent>
          </Card>
        )}

        {canFetch && isLoading && (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-lg" />
            ))}
          </div>
        )}

        {canFetch && error && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-destructive">
              Failed to load farmer dashboard. Please try again.
            </CardContent>
          </Card>
        )}

        {canFetch && !isLoading && !error && !farmer && (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm font-medium">Farmer not found.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This user may have been removed or may not belong to this source.
              </p>
            </CardContent>
          </Card>
        )}

        {canFetch && farmer && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Gauge className="h-5 w-5 text-primary" />
                  {farmerName}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <SummaryItem label="Email" value={farmer.email} />
                <SummaryItem
                  label="Mobile"
                  value={farmer.farmerProfile?.phoneNo}
                />
                <SummaryItem label="Role" value={farmer.userRole || farmer.role} />
                <SummaryItem
                  label="Registered"
                  value={
                    farmer.createdAt
                      ? new Date(farmer.createdAt).toLocaleDateString("en-IN")
                      : undefined
                  }
                />
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquareText className="h-4 w-4 text-primary" />
                    Question Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">
                    {farmer.totalQuestions.toLocaleString()}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Total questions from existing user details data.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sprout className="h-4 w-4 text-primary" />
                    Crops
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {[
                    farmer.farmerProfile?.primaryCrop,
                    farmer.farmerProfile?.secondaryCrop,
                    ...(farmer.farmerProfile?.cropsCultivated ?? []),
                  ]
                    .filter(Boolean)
                    .slice(0, 8)
                    .map((crop) => (
                      <Badge key={crop} variant="secondary">
                        {crop}
                      </Badge>
                    ))}
                  {!farmer.farmerProfile?.primaryCrop &&
                    !farmer.farmerProfile?.secondaryCrop &&
                    !farmer.farmerProfile?.cropsCultivated?.length && (
                      <span className="text-sm text-muted-foreground">
                        Not provided
                      </span>
                    )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="rounded-md border bg-card/60 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words font-medium">
        {value || <span className="text-muted-foreground">Not provided</span>}
      </div>
    </div>
  );
}
