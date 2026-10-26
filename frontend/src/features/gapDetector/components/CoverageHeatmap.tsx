import React, { useState } from "react";
import type { HeatmapMatrix, HeatmapCell } from "../types";
import { Badge } from "@/components/atoms/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";
import { Sparkles, FilterX } from "lucide-react";

interface CoverageHeatmapProps {
  data: HeatmapMatrix;
  selectedCell: HeatmapCell | null;
  onSelectCell: (cell: HeatmapCell | null) => void;
}

export const CoverageHeatmap: React.FC<CoverageHeatmapProps> = ({
  data,
  selectedCell,
  onSelectCell,
}) => {
  const [_hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  const getCellColor = (score: number, isSelected: boolean) => {
    let base = "";
    if (score < 50) {
      base = "bg-rose-500/80 text-white hover:bg-rose-600";
    } else if (score < 65) {
      base = "bg-amber-500/75 text-zinc-950 hover:bg-amber-500";
    } else if (score < 75) {
      base = "bg-yellow-400/70 text-zinc-900 hover:bg-yellow-400";
    } else {
      base = "bg-emerald-500/80 text-white hover:bg-emerald-600";
    }

    if (isSelected) {
      return `${base} ring-4 ring-emerald-400 ring-offset-2 scale-105 z-10 font-bold shadow-lg`;
    }
    return base;
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg text-foreground tracking-tight">
              GDB Regional Coverage Heatmap
            </h3>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs py-0.5">
              Live Matrix
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click on any cell to filter unanswered farmer clusters by crop & state
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-muted-foreground font-medium">Coverage Index:</span>
          <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-md border border-border">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
            <span className="text-muted-foreground">&lt;50% Critical Gap</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-md border border-border">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
            <span className="text-muted-foreground">50-74% Moderate</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-md border border-border">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
            <span className="text-muted-foreground">&ge;75% Strong</span>
          </div>
          {selectedCell && (
            <button
              onClick={() => onSelectCell(null)}
              className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600 ml-2 font-medium"
            >
              <FilterX className="w-3.5 h-3.5" /> Clear Filter
            </button>
          )}
        </div>
      </div>

      {/* Grid Container */}
      <div className="overflow-x-auto pb-2">
        <table className="w-full border-collapse min-w-[680px]">
          <thead>
            <tr>
              <th className="p-2.5 text-left text-xs font-semibold text-muted-foreground bg-muted/30 border-b border-border w-28">
                Crop \ State
              </th>
              {data.states.map((state) => (
                <th
                  key={state}
                  className="p-2.5 text-center text-xs font-semibold text-foreground bg-muted/30 border-b border-border"
                >
                  {state}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TooltipProvider delayDuration={100}>
              {data.crops.map((crop) => (
                <tr key={crop} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="p-2.5 text-xs font-medium text-foreground bg-muted/15 border-r border-border">
                    {crop}
                  </td>
                  {data.states.map((state) => {
                    const cell = data.cells.find(
                      (c) => c.crop === crop && c.state === state
                    );
                    if (!cell) {
                      return (
                        <td key={state} className="p-2 text-center text-xs text-muted-foreground">
                          -
                        </td>
                      );
                    }

                    const isSelected =
                      selectedCell?.crop === crop && selectedCell?.state === state;

                    return (
                      <td key={state} className="p-1.5 text-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() =>
                                onSelectCell(isSelected ? null : cell)
                              }
                              onMouseEnter={() => setHoveredCell(cell)}
                              onMouseLeave={() => setHoveredCell(null)}
                              className={`w-full py-2.5 px-1 rounded-md text-xs transition-all duration-150 cursor-pointer ${getCellColor(
                                cell.coverageScore,
                                isSelected
                              )}`}
                            >
                              <div className="font-bold leading-none">
                                {cell.coverageScore}%
                              </div>
                              <div className="text-[10px] opacity-80 mt-1 leading-none">
                                {cell.disclaimerQueries} disc.
                              </div>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs p-3 space-y-1.5 bg-popover text-popover-foreground border shadow-md">
                            <div className="flex items-center justify-between border-b pb-1 font-semibold text-xs">
                              <span>{crop} in {state}</span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  cell.coverageScore < 50
                                    ? "text-rose-500 border-rose-500/30"
                                    : cell.coverageScore < 75
                                    ? "text-amber-500 border-amber-500/30"
                                    : "text-emerald-500 border-emerald-500/30"
                                }`}
                              >
                                {cell.status.replace("_", " ").toUpperCase()}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              <div>Coverage: <span className="font-semibold text-foreground">{cell.coverageScore}%</span></div>
                              <div>Disclaimer Queries: <span className="font-semibold text-rose-500">{cell.disclaimerQueries}</span> / {cell.totalQueries}</div>
                            </div>
                            <div className="text-[11px] bg-muted/60 p-1.5 rounded text-foreground font-medium flex items-start gap-1">
                              <Sparkles className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                              <span>Top Gap: {cell.dominantGapTopic}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground text-center italic">
                              Click to filter unanswered farmer clusters below
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </TooltipProvider>
          </tbody>
        </table>
      </div>

      {selectedCell && (
        <div className="mt-3 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Filtered by:</span>
            <Badge className="bg-emerald-600 text-white text-xs">
              {selectedCell.crop} in {selectedCell.state}
            </Badge>
            <span className="text-muted-foreground">
              (Coverage: {selectedCell.coverageScore}%, Disclaimers: {selectedCell.disclaimerQueries})
            </span>
          </div>
          <button
            onClick={() => onSelectCell(null)}
            className="hover:underline font-medium text-emerald-700 dark:text-emerald-300"
          >
            Show All Gaps
          </button>
        </div>
      )}
    </div>
  );
};

