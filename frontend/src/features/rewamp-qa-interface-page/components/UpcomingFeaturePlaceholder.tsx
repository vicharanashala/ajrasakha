import React from "react";
import { Sparkles, Construction, Layers, ShieldCheck, FileSpreadsheet } from "lucide-react";
import { Card, CardContent } from "@/components/atoms/card";
import { Badge } from "@/components/atoms/badge";

interface UpcomingFeaturePlaceholderProps {
  title: string;
  description?: string;
  iconType?: "source" | "checks" | "ffv" | "default";
}

export const UpcomingFeaturePlaceholder: React.FC<UpcomingFeaturePlaceholderProps> = ({
  title,
  description = "This module is under development and will be available in the next release.",
  iconType = "default",
}) => {
  const getIcon = () => {
    switch (iconType) {
      case "source":
        return <Layers className="w-8 h-8 text-blue-500" />;
      case "checks":
        return <ShieldCheck className="w-8 h-8 text-amber-500" />;
      case "ffv":
        return <FileSpreadsheet className="w-8 h-8 text-emerald-500" />;
      default:
        return <Construction className="w-8 h-8 text-primary" />;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-xl border border-dashed border-border/80 bg-muted/20 min-h-[220px]">
      <div className="w-14 h-14 rounded-2xl bg-background shadow-xs border border-border flex items-center justify-center mb-3 transition-transform hover:scale-105 duration-200">
        {getIcon()}
      </div>
      
      <Badge variant="secondary" className="mb-2 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary border-primary/20 flex items-center gap-1">
        <Sparkles className="w-3 h-3" />
        Upcoming Feature
      </Badge>

      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
        {description}
      </p>
    </div>
  );
};
