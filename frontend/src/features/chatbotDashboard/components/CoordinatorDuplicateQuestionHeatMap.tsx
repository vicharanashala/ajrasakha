import { useMemo, useState } from "react";
import { Activity, Copy, InfoIcon, MapPinned, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Skeleton } from "@/components/atoms/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { cn } from "@/lib/utils";
import {
  type CoordinatorDuplicateQuestionDetail,
  type CoordinatorDuplicateQuestionVillage,
  useCoordinatorDuplicateQuestionHeatMap,
} from "../hooks/useCoordinatorDuplicateQuestionHeatMap";

interface CoordinatorDuplicateQuestionHeatMapProps {
  coordinatorId: string;
  enabled?: boolean;
}

type SelectedCell = {
  block: string;
  village: string;
  count: number;
  details: CoordinatorDuplicateQuestionDetail[];
} | null;

const formatDate = (value?: string) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
};

const getCellStyle = (count: number, max: number) => {
  if (!count || !max) {
    return {
      backgroundColor: "hsl(var(--muted) / 0.25)",
      color: "hsl(var(--muted-foreground))",
    };
  }

  const intensity = Math.min(count / max, 1);
  const alpha = 0.12 + intensity * 0.78;

  return {
    backgroundColor: `rgba(34, 197, 94, ${alpha})`,
    color: intensity > 0.58 ? "#052e16" : "hsl(var(--foreground))",
  };
};

export function CoordinatorDuplicateQuestionHeatMap({
  coordinatorId,
  enabled = true,
}: CoordinatorDuplicateQuestionHeatMapProps) {
  const queryClient = useQueryClient();
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, error } = useCoordinatorDuplicateQuestionHeatMap(
    coordinatorId,
    enabled,
  );

  const blocks = data?.blocks ?? [];
  const villages = useMemo(() => {
    const seen = new Set<string>();
    blocks.forEach((block) => {
      block.villages.forEach((village) => {
        if (village.village) seen.add(village.village);
      });
    });

    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [blocks]);
  const villageTotals = useMemo(
    () =>
      villages.map((villageName) => {
        const details = blocks.flatMap(
          (block) =>
            block.villages.find((village) => village.village === villageName)
              ?.details ?? [],
        );

        return {
          village: villageName,
          count: details.length,
          details,
        };
      }),
    [blocks, villages],
  );
  const maxCount = useMemo(
    () =>
      Math.max(
        0,
        ...blocks.flatMap((block) => [
          block.count,
          ...block.villages.map((village) => village.count),
        ]),
        ...villageTotals.map((village) => village.count),
      ),
    [blocks, villageTotals],
  );
  const scopeLabel =
    data?.scope === "district"
      ? `${data?.district || "District"} blocks and villages`
      : data?.scope === "block"
        ? `${data?.block || "Block"} villages`
        : "Village duplicate questions";
  const yAxisLabel = data?.scope === "block" ? "Block" : "Blocks";

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({
      queryKey: ["coordinator-duplicate-question-heat-map", coordinatorId],
    });
    setRefreshing(false);
  };

  const openDetails = (
    block: string,
    village: CoordinatorDuplicateQuestionVillage,
  ) => {
    setSelectedCell({
      block,
      village: village.village,
      count: village.count,
      details: village.details,
    });
  };

  return (
    <>
      <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-card via-card to-card/40 shadow-sm transition-shadow duration-300 hover:shadow-lg">
        <CardHeader className="gap-3 border-b border-border/50 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex items-center gap-2.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <MapPinned className="h-4 w-4 text-primary" />
              </div>
              <div className="leading-tight">
                <CardTitle className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
                  <span>Duplicate Question Heat Map</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-help text-muted-foreground/60 hover:text-muted-foreground">
                        <InfoIcon className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Counts repeated question groups once per farmer. For
                      example, one farmer asking the same question 5 times is
                      counted as 1 duplicate group.
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  {scopeLabel}
                </p>
              </div>
            </motion.div>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-md border-border/60 bg-background/80 shadow-sm"
              onClick={handleRefresh}
              title="Refresh"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
              />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="flex flex-wrap items-center gap-1.5 text-[11px]"
          >
            <span className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/5 px-2 py-0.5 font-medium text-primary">
              <Copy className="h-3 w-3" />
              Duplicate Groups
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/40 px-2 py-0.5 font-semibold text-foreground">
              <span className="text-muted-foreground">Total:</span>
              <motion.span
                key={String(data?.totalDuplicateQuestions ?? 0)}
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                className="tabular-nums"
              >
                {data?.totalDuplicateQuestions ?? 0}
              </motion.span>
            </span>
            <span className="rounded border border-border/60 bg-background px-2 py-0.5 text-muted-foreground">
              Y: {yAxisLabel}
            </span>
            <span className="rounded border border-border/60 bg-background px-2 py-0.5 text-muted-foreground">
              X: Villages
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-0.5 text-muted-foreground">
              <Activity className="h-3 w-3" />
              Click a count for details
            </span>
          </motion.div>

          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Skeleton className="h-[430px] w-full rounded-lg" />
              </motion.div>
            ) : error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
              >
                Failed to load duplicate question heat map.
              </motion.div>
            ) : blocks.length === 0 || villages.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground"
              >
                No duplicate question data found for this coordinator hierarchy.
              </motion.div>
            ) : (
              <motion.div
                key="table"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="overflow-hidden rounded-lg border border-border/70 bg-background/80 shadow-sm"
              >
                <div className="max-h-[560px] overflow-auto">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-20 bg-card">
                      <tr>
                        <th className="sticky left-0 z-30 min-w-[180px] border-b border-r border-border/60 bg-card px-3 py-2.5 text-left font-semibold text-foreground">
                          Block
                        </th>
                        {villages.map((village) => (
                          <th
                            key={village}
                            className="min-w-[110px] border-b border-border/60 px-2 py-2.5 text-center font-semibold text-foreground"
                          >
                            <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Village
                            </span>
                            <span className="line-clamp-2">{village}</span>
                          </th>
                        ))}
                        <th className="sticky right-0 z-30 min-w-[120px] border-b border-l border-border/60 bg-card px-2 py-2.5 text-center font-semibold text-foreground">
                          Block Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {blocks.map((block, rowIdx) => {
                        const villageByName = new Map(
                          block.villages.map((village) => [
                            village.village,
                            village,
                          ]),
                        );

                        return (
                          <motion.tr
                            key={block.block}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{
                              duration: 0.25,
                              delay: Math.min(rowIdx * 0.015, 0.3),
                            }}
                            className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                          >
                            <th className="sticky left-0 z-10 min-w-[180px] border-r border-border/60 bg-background px-3 py-2 text-left font-medium text-foreground">
                              <span className="line-clamp-2">{block.block}</span>
                            </th>
                            {villages.map((villageName) => {
                              const village = villageByName.get(villageName) ?? {
                                village: villageName,
                                count: 0,
                                details: [],
                              };
                              const title = [
                                `${block.block} - ${villageName}`,
                                `Duplicate groups: ${village.count}`,
                              ].join("\n");

                              return (
                                <td
                                  key={`${block.block}-${villageName}`}
                                  className="h-11 min-w-[110px] border-r border-border/30 p-1 text-center align-middle last:border-r-0"
                                  title={title}
                                >
                                  <motion.button
                                    type="button"
                                    whileHover={{ scale: village.count ? 1.08 : 1 }}
                                    transition={{
                                      type: "spring",
                                      stiffness: 400,
                                      damping: 20,
                                    }}
                                    className="flex h-9 min-w-[86px] items-center justify-center rounded-md px-2 text-[11px] font-semibold tabular-nums shadow-sm disabled:cursor-default"
                                    style={getCellStyle(village.count, maxCount)}
                                    onClick={() => openDetails(block.block, village)}
                                    disabled={village.count === 0}
                                  >
                                    {village.count}
                                  </motion.button>
                                </td>
                              );
                            })}
                            <td
                              className="sticky right-0 z-10 h-11 min-w-[120px] border-l border-border/60 bg-background p-1 text-center align-middle"
                              title={`${block.block} total duplicate groups: ${block.count}`}
                            >
                              <motion.button
                                type="button"
                                whileHover={{ scale: block.count ? 1.08 : 1 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 400,
                                  damping: 20,
                                }}
                                className="flex h-9 min-w-[92px] items-center justify-center rounded-md px-2 text-[11px] font-bold tabular-nums shadow-sm disabled:cursor-default"
                                style={getCellStyle(block.count, maxCount)}
                                onClick={() =>
                                  setSelectedCell({
                                    block: block.block,
                                    village: "All villages",
                                    count: block.count,
                                    details: block.villages.flatMap(
                                      (village) => village.details,
                                    ),
                                  })
                                }
                                disabled={block.count === 0}
                              >
                                {block.count}
                              </motion.button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-20 bg-card">
                      <tr className="border-t border-border/60">
                        <th className="sticky left-0 z-30 min-w-[180px] border-r border-border/60 bg-card px-3 py-2.5 text-left font-semibold text-foreground">
                          Village Total
                        </th>
                        {villageTotals.map((village) => (
                          <td
                            key={`${village.village}-total`}
                            className="h-11 min-w-[110px] border-r border-border/30 p-1 text-center align-middle last:border-r-0"
                            title={`${village.village} total duplicate groups: ${village.count}`}
                          >
                            <motion.button
                              type="button"
                              whileHover={{ scale: village.count ? 1.08 : 1 }}
                              transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 20,
                              }}
                              className="flex h-9 min-w-[86px] items-center justify-center rounded-md px-2 text-[11px] font-bold tabular-nums shadow-sm disabled:cursor-default"
                              style={getCellStyle(village.count, maxCount)}
                              onClick={() =>
                                setSelectedCell({
                                  block: "All blocks",
                                  village: village.village,
                                  count: village.count,
                                  details: village.details,
                                })
                              }
                              disabled={village.count === 0}
                            >
                              {village.count}
                            </motion.button>
                          </td>
                        ))}
                        <td className="sticky right-0 z-30 h-11 min-w-[120px] border-l border-border/60 bg-card p-1 text-center align-middle">
                          <div
                            className="flex h-9 min-w-[92px] items-center justify-center rounded-md px-2 text-[11px] font-bold tabular-nums shadow-sm"
                            style={getCellStyle(
                              data?.totalDuplicateQuestions ?? 0,
                              maxCount,
                            )}
                          >
                            {data?.totalDuplicateQuestions ?? 0}
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedCell)}
        onOpenChange={(open) => !open && setSelectedCell(null)}
      >
        <DialogContent className="flex max-h-[88vh] flex-col p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Duplicate Question Details</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {selectedCell?.block} / {selectedCell?.village} /{" "}
              {selectedCell?.count ?? 0} duplicate groups
            </p>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <div className="space-y-3 p-6">
              {selectedCell?.details.length ? (
                selectedCell.details.map((detail) => (
                  <div
                    key={`${detail.userId}-${detail.question}`}
                    className="rounded-md border bg-background p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                        Asked {detail.repeatCount} times
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(detail.firstAskedAt)} -{" "}
                        {formatDate(detail.lastAskedAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm font-medium">
                      {detail.question || "Question text not available"}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <span>
                        Farmer:{" "}
                        <span className="font-medium text-foreground">
                          {detail.userName || detail.email || detail.userId}
                        </span>
                      </span>
                      <span>
                        Question records:{" "}
                        <span className="font-medium text-foreground">
                          {detail.questionIds.length}
                        </span>
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No duplicate details for this village.
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
