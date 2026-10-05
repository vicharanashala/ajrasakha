import React from "react";
import { ChevronUp, ChevronsRight } from "lucide-react";
import { Card, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";

interface OcrExtractionPanelProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const OcrExtractionPanel: React.FC<OcrExtractionPanelProps> = ({
  isCollapsed = false,
  onToggleCollapse,
}) => {
  if (isCollapsed) {
    return (
      <div className="h-full min-h-[260px] flex flex-col items-center justify-between py-4 px-2 bg-card border border-border rounded-xl shadow-xs transition-all duration-300 w-12">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8 rounded-lg hover:bg-muted"
          title="Expand OCR Extraction"
        >
          <ChevronsRight className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
        </Button>

        <div className="flex items-center gap-2 [writing-mode:vertical-rl] rotate-180 select-none py-4">
          <span className="text-xs font-semibold tracking-wide text-foreground">
            Ocr extraction
          </span>
        </div>

        <div className="w-2 h-2 rounded-full bg-cyan-500" />
      </div>
    );
  }

  return (
    <Card className="flex flex-col h-full border border-border bg-card shadow-xs rounded-xl overflow-hidden relative min-h-[260px]">
      {onToggleCollapse && (
        <div className="absolute top-2 right-2 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Collapse Panel"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
      )}

      <CardContent className="p-6 flex-1 flex items-center justify-center">
        <div className="text-center p-8 rounded-xl border border-dashed border-border/80 bg-muted/20 w-full h-full flex flex-col items-center justify-center">
          <p className="text-sm font-semibold text-foreground">
            Ocr extraction
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Upcoming feature
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
