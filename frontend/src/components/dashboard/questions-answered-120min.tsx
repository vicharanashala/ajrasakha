"use client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import CountUp from "react-countup";
import { TopRightBadge } from "../NewBadge";

interface QuestionsAnswered120MinProps {
  whatsappCount: number;
  ajrasakhaCount: number;
}

export const QuestionsAnswered120Min = ({
  whatsappCount,
  ajrasakhaCount,
}: QuestionsAnswered120MinProps) => {
  return (
    <Card className="relative">
      <CardHeader >
        <CardTitle className="text-base">Questions Answered (≤120 minutes)</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Questions answered within 2 hours
        </p>
        <TopRightBadge label="new" left={0} />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* WhatsApp */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--color-chart-1)]" />
              <span className="text-sm font-medium">WhatsApp</span>
            </div>
            <span className="text-2xl font-bold">
              <CountUp end={whatsappCount} duration={2} preserveValue />
            </span>
          </div>

          {/* Ajrasakha */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--color-chart-2)]" />
              <span className="text-sm font-medium">Ajrasakha</span>
            </div>
            <span className="text-2xl font-bold">
              <CountUp end={ajrasakhaCount} duration={2} preserveValue />
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
