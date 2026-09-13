import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Switch } from "@/components/atoms/switch";
import {
  AlertTriangle,
  Zap,
  Clock,
  Users,
  Loader2,
  RefreshCcw,
  CheckCircle2,
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useSLAAutoEscalation } from "@/hooks/api/question/useSLAAutoEscalation";
import { ReallocationManualModal } from "./ReallocationManualModal";
import { cn } from "@/lib/utils";

export const SLAEscalationPanel = () => {
  const {
    isEnabled,
    toggleEnabled,
    delayedCount,
    activeExpertCount,
    previewLoading,
    isEscalating,
    lastEscalationAt,
    escalatedCount,
    triggerEscalation,
    refetchPreview,
  } = useSLAAutoEscalation();

  const [showManualModal, setShowManualModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const hasDelayedQuestions = delayedCount > 0;
  const isHealthy = !hasDelayedQuestions && !isEscalating;

  return (
    <>
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          hasDelayedQuestions &&
            "border-destructive/50 shadow-destructive/10 shadow-lg",
          isHealthy && "border-green-500/30"
        )}
      >
        {/* Animated background pulse when there are breached questions */}
        {hasDelayedQuestions && (
          <div className="absolute inset-0 bg-destructive/5 animate-pulse pointer-events-none" />
        )}

        <CardHeader className="relative pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "p-2 rounded-lg",
                  hasDelayedQuestions
                    ? "bg-destructive/10"
                    : "bg-green-500/10"
                )}
              >
                {hasDelayedQuestions ? (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  SLA Auto-Escalation
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically reallocate questions that exceed the 2-hour SLA
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-xs font-medium",
                    isEnabled
                      ? "text-green-600"
                      : "text-muted-foreground"
                  )}
                >
                  {isEnabled ? "Auto" : "Manual"}
                </span>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={toggleEnabled}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-8 w-8 p-0"
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="relative pt-0">
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div
                className={cn(
                  "p-3 rounded-lg border",
                  hasDelayedQuestions
                    ? "bg-destructive/5 border-destructive/20"
                    : "bg-muted/50 border-border"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Delayed
                  </span>
                </div>
                <p
                  className={cn(
                    "text-2xl font-bold",
                    hasDelayedQuestions
                      ? "text-destructive"
                      : "text-foreground"
                  )}
                >
                  {previewLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  ) : (
                    delayedCount
                  )}
                </p>
              </div>

              <div className="p-3 rounded-lg border bg-muted/50 border-border">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Active Experts
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {previewLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  ) : (
                    activeExpertCount
                  )}
                </p>
              </div>

              <div className="p-3 rounded-lg border bg-muted/50 border-border">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowUpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Escalated
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {escalatedCount}
                </p>
              </div>

              <div className="p-3 rounded-lg border bg-muted/50 border-border">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Status
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {isEnabled ? (
                    <Badge
                      variant="outline"
                      className="bg-green-500/10 text-green-600 border-green-500/20 text-xs"
                    >
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Paused
                    </Badge>
                  )}
                  {lastEscalationAt && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      Last:{" "}
                      {new Date(lastEscalationAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={triggerEscalation}
                disabled={isEscalating || !hasDelayedQuestions}
                className={cn(
                  "gap-2",
                  hasDelayedQuestions
                    ? "bg-destructive hover:bg-destructive/90 text-white"
                    : ""
                )}
              >
                {isEscalating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Escalating...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Escalate Now ({delayedCount})
                  </>
                )}
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowManualModal(true)}
                className="gap-2"
              >
                Manual Override
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => refetchPreview()}
                disabled={previewLoading}
                className="gap-2 text-muted-foreground"
              >
                <RefreshCcw
                  className={cn(
                    "h-3.5 w-3.5",
                    previewLoading && "animate-spin"
                  )}
                />
                Refresh
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <ReallocationManualModal
        open={showManualModal}
        onOpenChange={setShowManualModal}
        type="escalation"
      />
    </>
  );
};
