import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Calendar,
  Bell,
  BellPlus,
  Trash2,
  Clock,
  MapPin,
  ChevronRight,
  Shovel,
  Sprout,
  FlaskConical,
  Droplets,
  Scissors,
  Bug,
  Archive,
  Leaf,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Badge } from "@/components/atoms/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { Skeleton } from "@/components/atoms/skeleton";
import { useGetCalendarCrops } from "@/hooks/api/cropCalendar/useGetCalendarCrops";
import { useGetCropCalendar } from "@/hooks/api/cropCalendar/useGetCropCalendar";
import { useGetUpcomingActivities } from "@/hooks/api/cropCalendar/useGetUpcomingActivities";
import { useCreateReminder } from "@/hooks/api/cropCalendar/useCreateReminder";
import { useGetReminders } from "@/hooks/api/cropCalendar/useGetReminders";
import { useDeleteReminder } from "@/hooks/api/cropCalendar/useDeleteReminder";
import { LanguageSelector } from "@/components/LanguageSelector";
import type { ICropActivity } from "@/hooks/services/cropCalendarService";

const ACTIVITY_TYPE_KEYS: Record<string, string> = {
  preparation: "activityTypes.preparation",
  sowing: "activityTypes.sowing",
  fertilizing: "activityTypes.fertilizing",
  irrigation: "activityTypes.irrigation",
  weeding: "activityTypes.weeding",
  pest_control: "activityTypes.pest_control",
  harvesting: "activityTypes.harvesting",
  storage: "activityTypes.storage",
};

const ACTIVITY_TYPE_STYLES: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  preparation: {
    color: "text-slate-700",
    bg: "bg-slate-100",
    border: "border-slate-300",
    icon: <Shovel className="size-4" />,
  },
  sowing: {
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    icon: <Sprout className="size-4" />,
  },
  fertilizing: {
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-300",
    icon: <FlaskConical className="size-4" />,
  },
  irrigation: {
    color: "text-cyan-700",
    bg: "bg-cyan-50",
    border: "border-cyan-300",
    icon: <Droplets className="size-4" />,
  },
  weeding: {
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-300",
    icon: <Scissors className="size-4" />,
  },
  pest_control: {
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-300",
    icon: <Bug className="size-4" />,
  },
  harvesting: {
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-300",
    icon: <Leaf className="size-4" />,
  },
  storage: {
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-300",
    icon: <Archive className="size-4" />,
  },
};

function getActivityConfig(type: string) {
  const t = (k: string) => k;
  return {
    ...(ACTIVITY_TYPE_STYLES[type] || {
      color: "text-gray-700",
      bg: "bg-gray-100",
      border: "border-gray-300",
      icon: <Calendar className="size-4" />,
    }),
    labelKey: ACTIVITY_TYPE_KEYS[type] || "",
    label: type,
  };
}

const MONTHS_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ActivityCard({ activity }: { activity: ICropActivity }) {
  const { t } = useTranslation("cropCalendar");
  const config = getActivityConfig(activity.type);
  return (
    <div
      className={`rounded-lg border ${config.border} ${config.bg} p-3 transition-all hover:shadow-md`}
    >
      <div className="flex items-start gap-2">
        <div className={`mt-0.5 ${config.color}`}>{config.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className={`text-sm font-semibold ${config.color}`}>
              {activity.activity}
            </h4>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {config.labelKey ? t(config.labelKey) : config.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {activity.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function CalendarTimeline({
  activities,
  selectedSeason,
}: {
  activities: ICropActivity[];
  selectedSeason: string;
}) {
  const { t } = useTranslation("cropCalendar");
  const monthActivities: Record<string, ICropActivity[]> = {};
  for (const activity of activities) {
    if (!monthActivities[activity.month]) {
      monthActivities[activity.month] = [];
    }
    monthActivities[activity.month].push(activity);
  }

  const activeMonths = MONTHS_ORDER.filter(m => monthActivities[m]);

  if (activeMonths.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Calendar className="size-12 mx-auto mb-3 opacity-40" />
        <p>{t("calendar.noActivities")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          {selectedSeason} {t("calendar.season")} — {activeMonths.length} {t("calendar.months")}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {activeMonths.map((month, idx) => (
          <div key={month} className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center size-8 rounded-full bg-primary/10 text-primary text-xs font-bold">
                {idx + 1}
              </div>
              <div>
                <h3 className="text-sm font-bold">{month}</h3>
                <p className="text-[10px] text-muted-foreground">
                  {monthActivities[month].length} {monthActivities[month].length === 1 ? t("calendar.activity") : t("calendar.activities")}
                </p>
              </div>
              <ChevronRight className="size-3 text-muted-foreground ml-auto" />
            </div>
            <div className="space-y-2">
              {monthActivities[month].map((activity, i) => (
                <ActivityCard key={`${month}-${i}`} activity={activity} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpcomingSection({
  activities,
  isLoading,
}: {
  activities: ICropActivity[];
  isLoading: boolean;
}) {
  const { t } = useTranslation("cropCalendar");

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="size-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">{t("upcoming.none")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activities.map((activity, idx) => {
        const config = getActivityConfig(activity.type);
        const daysEstimate = Math.floor((idx / activities.length) * 30);
        return (
          <div
            key={`${activity.activity}-${idx}`}
            className={`flex items-center gap-3 rounded-lg border ${config.border} ${config.bg} p-3`}
          >
            <div className={`shrink-0 ${config.color}`}>{config.icon}</div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${config.color}`}>
                {activity.activity}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {activity.description}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Badge variant="outline" className="text-[10px]">
                ~{daysEstimate}{t("upcoming.days")}
              </Badge>
              <p className="text-[10px] text-muted-foreground mt-1">{activity.month}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RemindersSection({
  selectedCrop,
  activities,
}: {
  selectedCrop: string;
  activities: ICropActivity[];
}) {
  const { t } = useTranslation("cropCalendar");
  const [reminderCrop, setReminderCrop] = useState(selectedCrop);
  const [reminderActivity, setReminderActivity] = useState("");
  const [reminderDays, setReminderDays] = useState(7);

  const { data: reminders, isLoading: remindersLoading } = useGetReminders();
  const createReminder = useCreateReminder();
  const deleteReminder = useDeleteReminder();

  const uniqueActivities = [...new Set(activities.map(a => a.activity))];

  const handleCreate = () => {
    if (!reminderCrop || !reminderActivity || reminderDays < 0) return;
    createReminder.mutate(
      {
        cropName: reminderCrop,
        activity: reminderActivity,
        remindBeforeDays: reminderDays,
      },
      {
        onSuccess: () => {
          setReminderActivity("");
          setReminderDays(7);
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteReminder.mutate(id);
  };

  return (
    <div className="space-y-6">
      {/* Create Reminder Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellPlus className="size-5 text-primary" />
            {t("reminder.createTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("reminder.crop")}</label>
              <Select value={reminderCrop} onValueChange={setReminderCrop}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("reminder.selectCrop")} />
                </SelectTrigger>
                <SelectContent>
                  {reminderCrop && (
                    <SelectItem value={reminderCrop}>{reminderCrop}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("reminder.activity")}</label>
              <Select value={reminderActivity} onValueChange={setReminderActivity}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("reminder.selectActivity")} />
                </SelectTrigger>
                <SelectContent>
                  {uniqueActivities.map(a => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("reminder.remindBefore")}
              </label>
              <Input
                type="number"
                min={0}
                max={90}
                value={reminderDays}
                onChange={e => setReminderDays(parseInt(e.target.value) || 0)}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground invisible">
                Action
              </label>
              <Button
                onClick={handleCreate}
                disabled={!reminderCrop || !reminderActivity || createReminder.isPending}
                className="w-full"
              >
                <BellPlus className="size-4" />
                {createReminder.isPending ? t("reminder.creating") : t("reminder.create")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reminders List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-5 text-primary" />
            {t("reminder.activeTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {remindersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : !reminders || reminders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="size-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{t("reminder.noReminders")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reminders.map(reminder => {
                const config = getActivityConfig(
                  activities.find(a => a.activity === reminder.activity)?.type || ""
                );
                return (
                  <div
                    key={reminder.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 hover:shadow-sm transition-shadow"
                  >
                    <div className={`shrink-0 ${config.color || "text-muted-foreground"}`}>
                      <Bell className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{reminder.cropName}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {reminder.activity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("reminder.remind")} {reminder.remindBeforeDays} {reminder.remindBeforeDays !== 1 ? t("reminder.days") : t("reminder.day")} {t("reminder.before")}
                        {" · "}
                        {t("reminder.created")} {new Date(reminder.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(reminder.id)}
                      disabled={deleteReminder.isPending}
                      className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityLegend() {
  const { t } = useTranslation("cropCalendar");
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(ACTIVITY_TYPE_STYLES).map(([key, config]) => {
        const labelKey = ACTIVITY_TYPE_KEYS[key] || "";
        return (
          <div
            key={key}
            className={`flex items-center gap-1.5 rounded-md border ${config.border} ${config.bg} px-2 py-1`}
          >
            <span className={config.color}>{config.icon}</span>
            <span className={`text-[11px] font-medium ${config.color}`}>{labelKey ? t(labelKey) : key}</span>
          </div>
        );
      })}
    </div>
  );
}

export function CropCalendarPage() {
  const { t } = useTranslation("cropCalendar");
  const [selectedCrop, setSelectedCrop] = useState<string>("");

  const { data: crops, isLoading: cropsLoading } = useGetCalendarCrops();
  const { data: calendar, isLoading: calendarLoading } = useGetCropCalendar(selectedCrop);
  const { data: upcoming, isLoading: upcomingLoading } = useGetUpcomingActivities(selectedCrop);

  // Auto-select first crop
  if (!selectedCrop && crops && crops.length > 0) {
    setSelectedCrop(crops[0]);
  }

  const seasons = calendar?.seasons || [];
  const [selectedSeason, setSelectedSeason] = useState<string>("");

  // Auto-select first season
  if (seasons.length > 0 && (!selectedSeason || !seasons.find(s => s.name === selectedSeason))) {
    setSelectedSeason(seasons[0].name);
  }

  const currentSeason = seasons.find(s => s.name === selectedSeason);
  const seasonActivities = currentSeason?.activities || [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10">
              <Calendar className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("subtitle")}
              </p>
            </div>
          </div>
          <LanguageSelector />
        </div>
      </div>

      {/* Activity Legend */}
      <ActivityLegend />

      {/* Crop Selector */}
      <Card>
        <CardContent className="pt-6">
          {cropsLoading ? (
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-9 w-24 rounded-md" />
              ))}
            </div>
          ) : (
            <Tabs value={selectedCrop} onValueChange={setSelectedCrop}>
              <TabsList className="h-auto flex-wrap bg-muted/50">
                {(crops || []).map(crop => (
                  <TabsTrigger
                    key={crop}
                    value={crop}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    {crop}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Calendar View */}
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="size-5 text-primary" />
                  {selectedCrop} — {t("calendar.activityCalendar")}
                </CardTitle>
                {seasons.length > 0 && (
                  <Tabs value={selectedSeason} onValueChange={setSelectedSeason}>
                    <TabsList>
                      {seasons.map(season => (
                        <TabsTrigger key={season.name} value={season.name}>
                          {season.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {calendarLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-40 rounded-lg" />
                  ))}
                </div>
              ) : (
                <CalendarTimeline
                  activities={seasonActivities}
                  selectedSeason={selectedSeason}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upcoming Activities */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-5 text-amber-500" />
                {t("upcoming.title")}
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {t("upcoming.next30days")}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedCrop ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="size-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t("upcoming.selectCrop")}</p>
                </div>
              ) : (
                <UpcomingSection activities={upcoming || []} isLoading={upcomingLoading} />
              )}
            </CardContent>
          </Card>

          {/* Reminders */}
          <RemindersSection
            selectedCrop={selectedCrop}
            activities={seasonActivities}
          />
        </div>
      </div>
    </div>
  );
}
