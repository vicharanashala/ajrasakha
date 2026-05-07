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
}

export const QuestionsAnsweredAfter120MinProps = ({
  whatsappCount,
  ajrasakhaCount,
}: QuestionsAnsweredAfter120MinProps) => {
  let check = [
    { status: "passed", value: whatsappCount },
    { status: "delayed", value: ajrasakhaCount },
    { status: "open", value: ajrasakhaCount }
  ];
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
        <div className={`mt-6 grid grid-cols-3 gap-3`}>
          {check.map((item) => (
            <div
              key={item.status}
              className="p-3 rounded-lg bg-muted text-center"
            >
              <p className="text-xs text-muted-foreground">{item.status}</p>
              <p className="text-lg font-semibold text-foreground">
                <CountUp end={item.value} duration={2} preserveValue />
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
