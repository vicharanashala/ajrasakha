import { CheckCircle2, Clock } from "lucide-react";
import CountUp from "react-countup";
import { motion,useInView, } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../atoms/card";
import { useEffect, useRef, useState } from "react";

export interface ModeratorApprovalRate {
  approved: number;
  pending: number;
  approvalRate: number;
}

interface ApprovalRateCardProps {
  data: ModeratorApprovalRate;
}

export const ApprovalRateCard: React.FC<ApprovalRateCardProps> = ({ data }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { amount: 1 });
  const [animateKey, setAnimateKey] = useState(0);

  //Restart animation when entering viewport
  useEffect(() => {
    if (isInView) {
      setAnimateKey((prev) => prev + 1);
    }
  }, [isInView]);
  return (
    <Card ref={ref} className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-base">Moderator Approval Rate</CardTitle>
        <CardDescription>Based on pending and approved answers</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex items-center">
        <div className="w-full space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                Approval Rate
              </span>
              <span className="text-2xl font-bold text-primary">
                <CountUp
                  key={animateKey}
                  end={data.approvalRate}
                  duration={2}
                  suffix="%"
                  preserveValue
                />
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
              key={animateKey}
              initial={{ width: 0 }}
              animate={{ width: `${data.approvalRate}%` }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
            />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Approved</p>
                <p className="text-lg font-semibold text-foreground">
                  <CountUp key={`approved-${animateKey}`} end={data.approved} duration={2} preserveValue />
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-lg font-semibold text-foreground">
                  <CountUp key={`pending-${animateKey}`} end={data.pending} duration={2} preserveValue />
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
