"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";

import { TopRightBadge } from "../NewBadge";

interface AverageResponseTimeProps {
  whatsappAvgTime: number;
  ajrasakhaAvgTime: number;
}

export const AverageResponseTime = ({
  whatsappAvgTime,
  ajrasakhaAvgTime,
}: AverageResponseTimeProps) => {

  const formatHours = (hours: number) => {

    const totalMinutes = Math.round(hours * 60);

    const hrs = Math.floor(totalMinutes / 60);

    const mins = totalMinutes % 60;

    if (hrs === 0) {
      return `${mins} mins`;
    }

    if (mins === 0) {
      return `${hrs} hrs`;
    }

    return `${hrs} hr ${mins} mins`;
  };

  return (
    <Card className="relative">
      <CardHeader>
        <CardTitle className="text-base">
          Average Response Time
        </CardTitle>

        <p className="text-sm text-muted-foreground mt-1">
          Average time to answer questions
        </p>

        <TopRightBadge label="new" left={0} />
      </CardHeader>

      <CardContent>
        <div className="space-y-4">

          {/* WhatsApp */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">

            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--color-chart-1)]" />

              <span className="text-sm font-medium">
                WhatsApp
              </span>
            </div>

            <div className="text-right">
              <span className="text-xl font-bold">
                {formatHours(whatsappAvgTime)}
              </span>
            </div>
          </div>

          {/* Ajrasakha */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">

            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--color-chart-2)]" />

              <span className="text-sm font-medium">
                Ajrasakha
              </span>
            </div>

            <div className="text-right">
              <span className="text-xl font-bold">
                {formatHours(ajrasakhaAvgTime)}
              </span>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
};