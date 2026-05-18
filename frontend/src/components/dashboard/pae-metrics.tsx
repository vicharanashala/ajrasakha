"use client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import CountUp from "react-countup";
import { TopRightBadge } from "../NewBadge";

interface PAEMetricsProps {
  assigned: number;
  submitted: number;
  closed: number;
}

export const PAEMetrics = ({ assigned, submitted, closed }: PAEMetricsProps) => {
  const total = assigned + submitted + closed;

  const calculatePercentage = (value: number) => {
    return total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  };

  return (
    <Card className="relative">
      <CardHeader>
        <CardTitle className="text-base">PAE (Principal Agri Experts)</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Status breakdown of questions under PAE review
        </p>
        <TopRightBadge label="new" left={0} />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* PAE Assigned */}
          <div className="flex flex-col p-4 rounded-lg bg-muted">
            <span className="text-xs text-muted-foreground mb-2">PAE Assigned</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                <CountUp end={assigned} duration={1.5} preserveValue />
              </span>
              {/* <span className="text-sm text-muted-foreground">
                ({calculatePercentage(assigned)}%)
              </span> */}
            </div>
            {/* <p className="text-xs text-muted-foreground mt-2">
              pae_review = true & (status = "open" || "delayed")
            </p> */}
          </div>

          {/* PAE Submitted */}
          <div className="flex flex-col p-4 rounded-lg bg-muted">
            <span className="text-xs text-muted-foreground mb-2">PAE Submitted</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                <CountUp end={submitted} duration={1.5} preserveValue />
              </span>
              {/* <span className="text-sm text-muted-foreground">
                ({calculatePercentage(submitted)}%)
              </span> */}
            </div>
            {/* <p className="text-xs text-muted-foreground mt-2">
              status = "pae_submitted"
            </p> */}
          </div>

          {/* PAE Closed */}
          <div className="flex flex-col p-4 rounded-lg bg-muted">
            <span className="text-xs text-muted-foreground mb-2">PAE Closed</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                <CountUp end={closed} duration={1.5} preserveValue />
              </span>
              {/* <span className="text-sm text-muted-foreground">
                ({calculatePercentage(closed)}%)
              </span> */}
            </div>
            {/* <p className="text-xs text-muted-foreground mt-2">
              pae_review = true & status = "closed"
            </p> */}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
