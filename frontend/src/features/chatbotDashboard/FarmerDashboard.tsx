import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Languages,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Sprout,
  UserRound,
} from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import type { ReactNode } from "react";
import { useUserDetails, type FarmerProfile } from "./hooks/useUserDetails";
import { useFarmerQuestionMetrics } from "./hooks/useFarmerQuestionMetrics";

type FarmerDashboardProps = {
  userId: string;
  source?: "annam" | "whatsapp";
};

const isLikelyObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value);

const requiredProfileFields: Array<{
  key: keyof FarmerProfile;
  label: string;
}> = [
  { key: "farmerName", label: "Name" },
  { key: "phoneNo", label: "Mobile Number" },
  { key: "district", label: "District" },
  { key: "blockName", label: "Block" },
  { key: "villageName", label: "Village" },
  { key: "primaryCrop", label: "Primary Crop" },
  { key: "languagePreference", label: "Language Preference" },
];

const hasValue = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
};

const formatDate = (value?: string | Date | null) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatList = (items: Array<string | undefined | null>) => {
  const uniqueItems = Array.from(
    new Set(items.map((item) => item?.trim()).filter(Boolean) as string[]),
  );
  return uniqueItems.length ? uniqueItems.join(", ") : undefined;
};

export function FarmerDashboard({
  userId,
  source = "annam",
}: FarmerDashboardProps) {
  const navigate = useNavigate();
  const canFetch = isLikelyObjectId(userId);
  const {
    data,
    isLoading: isFarmerLoading,
    error: farmerError,
  } = useUserDetails(
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

  const {
    data: questionMetrics,
    isLoading: isMetricsLoading,
    error: metricsError,
  } = useFarmerQuestionMetrics(userId, source, "all", canFetch);

  const farmer = data.users[0];
  const profile = farmer?.farmerProfile;
  const farmerName = profile?.farmerName || farmer?.name || "Farmer";
  const missingFields = requiredProfileFields
    .filter((field) => !hasValue(profile?.[field.key]))
    .map((field) => field.label);
  const isProfileComplete = Boolean(profile) && missingFields.length === 0;
  const primaryCrops = formatList([
    profile?.primaryCrop,
    ...(profile?.cropsCultivated ?? []),
  ]);

  const metrics = questionMetrics ?? {
    totalQuestionsAsked: 0,
    questionsClosed: 0,
    questionsInReview: 0,
    questionsPending: 0,
    duplicateQuestions: 0,
    nonDuplicateQuestions: 0,
    questionsClosedWithin2Hours: 0,
    carryForwardQuestions: 0,
    questionsAwaitingReview: 0,
    statusBreakdown: {},
  };

  return (
    <TooltipProvider>
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
                {farmer?.isVerified !== undefined && (
                  <Badge variant={farmer.isVerified ? "default" : "secondary"}>
                    {farmer.isVerified ? "Verified" : "Unverified"}
                  </Badge>
                )}
              </div>
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {farmerName}
            </h1>
            <p className="mt-1 break-all text-sm text-muted-foreground">
                Farmer Dashboard - {userId}
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

        {canFetch && isFarmerLoading && (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-lg" />
            ))}
          </div>
        )}

          {canFetch && farmerError && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-destructive">
              Failed to load farmer dashboard. Please try again.
            </CardContent>
          </Card>
        )}

          {canFetch && !isFarmerLoading && !farmerError && !farmer && (
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
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserRound className="h-5 w-5 text-primary" />
                      Farmer Profile Summary
                    </CardTitle>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant={isProfileComplete ? "default" : "secondary"}
                          className="w-fit gap-1.5"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {isProfileComplete ? "Profile Complete" : "Profile Incomplete"}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isProfileComplete
                          ? "All required farmer profile fields are available."
                          : `Missing: ${missingFields.join(", ") || "Farmer profile"}`}
                      </TooltipContent>
                    </Tooltip>
                  </div>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <SummaryItem label="Name" value={farmerName} icon={<UserRound />} />
                  <SummaryItem label="Mobile Number" value={profile?.phoneNo} icon={<Phone />} />
                <SummaryItem label="Email Address" value={farmer.email} icon={<Mail />} />
                  <SummaryItem label="District" value={profile?.district} icon={<MapPin />} />
                  <SummaryItem label="Block" value={profile?.blockName} icon={<MapPin />} />
                  <SummaryItem label="Village" value={profile?.villageName} icon={<MapPin />} />
                  <SummaryItem label="Gender" value={profile?.gender} />
                  <SummaryItem label="Age" value={profile?.age} />
                  <SummaryItem
                    label="Language Preference"
                    value={profile?.languagePreference}
                    icon={<Languages />}
                  />
                  <SummaryItem
                    label="Primary Crops"
                    value={primaryCrops}
                    icon={<Sprout />}
                  />
                <SummaryItem
                    label="Registration Date"
                    value={formatDate(farmer.createdAt)}
                    icon={<CalendarDays />}
                  />
                  <SummaryItem
                    label="Profile Status"
                    value={isProfileComplete ? "Complete" : "Incomplete"}
                    icon={<BadgeCheck />}
                    missingMessage={
                      isProfileComplete
                        ? undefined
                        : `Missing: ${missingFields.join(", ") || "Farmer profile"}`
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <MessageSquareText className="h-5 w-5 text-primary" />
                      Question Metrics
                    </CardTitle>
                    {metricsError && (
                      <span className="text-xs text-destructive">
                        Failed to load question metrics.
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {isMetricsLoading ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {Array.from({ length: 9 }).map((_, index) => (
                        <Skeleton key={index} className="h-24 rounded-lg" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <MetricCard
                        label="Total Questions Asked"
                        value={metrics.totalQuestionsAsked}
                        icon={<ClipboardList />}
                      />
                      <MetricCard
                        label="Questions Closed"
                        value={metrics.questionsClosed}
                        icon={<CheckCircle2 />}
                      />
                      <MetricCard
                        label="Questions in Review"
                        value={metrics.questionsInReview}
                      />
                      <MetricCard
                        label="Questions Pending"
                        value={metrics.questionsPending}
                      />
                      <MetricCard
                        label="Duplicate Questions"
                        value={metrics.duplicateQuestions}
                      />
                      <MetricCard
                        label="Non-Duplicate Questions"
                        value={metrics.nonDuplicateQuestions}
                      />
                      <MetricCard
                        label="Questions Closed Within 2 Hours"
                        value={metrics.questionsClosedWithin2Hours}
                        icon={<Clock3 />}
                      />
                      <MetricCard
                        label="Carry-Forward Questions"
                        value={metrics.carryForwardQuestions}
                      />
                      <MetricCard
                        label="Questions Awaiting Review"
                        value={metrics.questionsAwaitingReview}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function SummaryItem({
  label,
  value,
  icon,
  missingMessage,
}: {
  label: string;
  value?: string | number | null;
  icon?: ReactNode;
  missingMessage?: string;
}) {
  const isMissing = !hasValue(value);
  const content = (
    <div className="rounded-md border bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
        {icon && <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
        {label}
      </div>
      <div className="mt-1 break-words font-medium">
        {isMissing ? (
          <span className="text-muted-foreground">Not provided</span>
        ) : (
          value
        )}
      </div>
    </div>
  );

  if (!isMissing && !missingMessage) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent>
        {missingMessage || `${label} is missing from the farmer profile.`}
      </TooltipContent>
    </Tooltip>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon && (
          <span className="rounded-md bg-primary/10 p-1.5 text-primary [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">
        {value.toLocaleString("en-IN")}
      </div>
    </div>
  );
}
