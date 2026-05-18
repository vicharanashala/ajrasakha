"use client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import CountUp from "react-countup";
import { TopRightBadge } from "../NewBadge";

interface ResponseAdherenceProps {
  totalWhatsapp: number;
  totalAjrasakha: number;
  answeredWithin120WhatsApp: number;
  answeredWithin120Ajrasakha: number;
}

export const ResponseAdherence = ({
  totalWhatsapp,
  totalAjrasakha,
  answeredWithin120WhatsApp,
  answeredWithin120Ajrasakha,
}: ResponseAdherenceProps) => {
  // Calculate adherence percentages
  const whatsappAdherence = totalWhatsapp > 0 
    ? (answeredWithin120WhatsApp / totalWhatsapp) * 100 
    : 0;
  
  const ajrasakhaAdherence = totalAjrasakha > 0 
    ? (answeredWithin120Ajrasakha / totalAjrasakha) * 100 
    : 0;

  return (
    <Card className="relative">
      <CardHeader>
        <CardTitle className="text-base">Response Adherence (%)</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Percentage of questions answered within 2 hours
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
            <div className="text-right">
              <span className="text-2xl font-bold">
                <CountUp 
                  end={whatsappAdherence} 
                  duration={2} 
                  decimals={1}
                  preserveValue 
                />%
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {answeredWithin120WhatsApp} of {totalWhatsapp} questions
              </p>
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
                  end={ajrasakhaAdherence} 
                  duration={2} 
                  decimals={1}
                  preserveValue 
                />%
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {answeredWithin120Ajrasakha} of {totalAjrasakha} questions
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
