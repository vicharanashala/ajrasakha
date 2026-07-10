"use client";

import { useState } from "react";
import { RefreshCw, SunMedium, Droplets, Wind, ThermometerSun } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { cn } from "@/lib/utils";

type WeatherSnapshot = {
  temperature: string;
  condition: string;
  humidity: string;
  wind: string;
  advice: string[];
};

const MOCK_SNAPSHOTS: WeatherSnapshot[] = [
  {
    temperature: "32°C",
    condition: "Sunny",
    humidity: "58%",
    wind: "14 km/h",
    advice: [
      "Good day for irrigation.",
      "Delay pesticide spraying if rain is expected.",
      "Suitable conditions for harvesting.",
    ],
  },
  {
    temperature: "29°C",
    condition: "Partly Cloudy",
    humidity: "64%",
    wind: "11 km/h",
    advice: [
      "Irrigation can be done in the early morning.",
      "Check crops for moisture stress after noon.",
      "Harvesting is safe, but monitor cloud build-up.",
    ],
  },
  {
    temperature: "30°C",
    condition: "Clear Sky",
    humidity: "52%",
    wind: "16 km/h",
    advice: [
      "Good visibility for field work today.",
      "Apply sprays only if wind remains steady.",
      "A suitable window for harvesting and transport.",
    ],
  },
];

interface WeatherAdvisorySnapshotProps {
  className?: string;
}

export const WeatherAdvisorySnapshot = ({ className }: WeatherAdvisorySnapshotProps) => {
  const [snapshotIndex, setSnapshotIndex] = useState(0);

  const currentSnapshot = MOCK_SNAPSHOTS[snapshotIndex];

  const handleRefresh = () => {
    setSnapshotIndex((currentIndex) => (currentIndex + 1) % MOCK_SNAPSHOTS.length);
  };

  return (
    <Card
      className={cn(
        "w-full border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <SunMedium className="h-5 w-5 text-sky-600" />
            <CardTitle className="text-lg font-semibold text-slate-900">
              Weather Advisory
            </CardTitle>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="h-8 gap-2 border-sky-200 bg-white/80 text-sky-700 hover:bg-sky-50 hover:text-sky-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        <p className="text-sm text-slate-600">
          Mock snapshot for quick farmer guidance. Frontend only.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-sky-100 bg-white/90 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <ThermometerSun className="h-4 w-4 text-sky-600" />
              Temperature
            </div>
            <div className="text-lg font-semibold text-slate-900">{currentSnapshot.temperature}</div>
          </div>

          <div className="rounded-xl border border-sky-100 bg-white/90 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <SunMedium className="h-4 w-4 text-amber-500" />
              Condition
            </div>
            <div className="text-lg font-semibold text-slate-900">{currentSnapshot.condition}</div>
          </div>

          <div className="rounded-xl border border-sky-100 bg-white/90 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <Droplets className="h-4 w-4 text-cyan-600" />
              Humidity
            </div>
            <div className="text-lg font-semibold text-slate-900">{currentSnapshot.humidity}</div>
          </div>

          <div className="rounded-xl border border-sky-100 bg-white/90 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <Wind className="h-4 w-4 text-emerald-600" />
              Wind
            </div>
            <div className="text-lg font-semibold text-slate-900">{currentSnapshot.wind}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
          <div className="mb-2 text-sm font-semibold text-emerald-900">
            Farmer Advisory
          </div>
          <ul className="space-y-2 text-sm leading-6 text-emerald-950">
            {currentSnapshot.advice.map((tip) => (
              <li key={tip} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};