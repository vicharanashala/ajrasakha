"use client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import CountUp from "react-countup";

interface QuestionsAnsweredAfter120MinProps {
  whatsappCount: number;
  ajrasakhaCount: number;
  questionsStateBreakdown?: {
    whatsapp: { status: string; count: number }[];
    ajrasakha: { status: string; count: number }[];
  };
}

export const QuestionsAnsweredAfter120MinProps = ({
  whatsappCount,
  ajrasakhaCount,
  questionsStateBreakdown,
}: QuestionsAnsweredAfter120MinProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Questions Answered ({">"}120 minutes)</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Questions answered after 2 hours
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--color-chart-1)]" />
              <span className="text-sm font-medium">WhatsApp</span>
            </div>
            <span className="text-2xl font-bold">
              <CountUp end={whatsappCount} duration={2} preserveValue />
            </span>      
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
          {questionsStateBreakdown?.whatsapp?.map((item) => (
            <div
              key={item.status}
              className="p-3 rounded-lg bg-muted text-center"
            >
              <p className="text-xs text-muted-foreground">{item.status}</p>
              <p className="text-lg font-semibold text-foreground">
                <CountUp end={item.count} duration={2} preserveValue />
              </p>
            </div>
          ))}
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--color-chart-2)]" />
              <span className="text-sm font-medium">Ajrasakha</span>
            </div>
            <span className="text-2xl font-bold">
              <CountUp end={ajrasakhaCount} duration={2} preserveValue />
            </span>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
          {questionsStateBreakdown?.ajrasakha?.map((item) => (
            <div
              key={item.status}
              className="p-3 rounded-lg bg-muted text-center"
            >
              <p className="text-xs text-muted-foreground">{item.status}</p>
              <p className="text-lg font-semibold text-foreground">
                <CountUp end={item.count} duration={2} preserveValue />
              </p>
            </div>
          ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
