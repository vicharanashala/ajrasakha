"use client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import CountUp from "react-countup";

interface AverageResponseTimeProps {
  whatsappAvgTime: number;
  ajrasakhaAvgTime: number;
}

export const AverageResponseTime = ({
  whatsappAvgTime,
  ajrasakhaAvgTime,
}: AverageResponseTimeProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Average Response Time (in hours)</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Average time to answer questions
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
            <div className="text-right">
              <span className="text-2xl font-bold">
                <CountUp 
                  end={whatsappAvgTime} 
                  duration={2} 
                  decimals={1}
                  preserveValue 
                />
              </span>
              <span className="text-sm text-muted-foreground ml-1">hrs</span>
            </div>
          </div>

          {/* Ajrasakha */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--color-chart-2)]" />
              <span className="text-sm font-medium">Ajrasakha</span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold">
                <CountUp 
                  end={ajrasakhaAvgTime} 
                  duration={2} 
                  decimals={1}
                  preserveValue 
                />
              </span>
              <span className="text-sm text-muted-foreground ml-1">hrs</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
