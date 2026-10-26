import React, { useState } from "react";
import type { HeatmapMatrix, HeatmapCell } from "../types";
import { Badge } from "@/components/atoms/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";
import { FilterX, AlertCircle } from "lucide-react";

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
      base = "bg-rose-500/85 text-white hover:bg-rose-600";
    } else if (score < 70) {
      base = "bg-amber-400 text-zinc-900 hover:bg-amber-500";
    } else {
      base = "bg-emerald-500/85 text-white hover:bg-emerald-600";
    }

    if (isSelected) {
      return `${base} ring-4 ring-emerald-500 ring-offset-2 scale-105 z-10 font-bold shadow-md`;
    }
    return base;
  };

  return (
    <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-4">
      {/* Title & Legend */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lg text-foreground">
            Crop vs State Knowledge Map
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click on any box to see the missing questions for that crop and state.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-500 inline-block" />
            <span className="text-muted-foreground">Needs Work (&lt;50%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-400 inline-block" />
            <span className="text-muted-foreground">Average (50-70%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
            <span className="text-muted-foreground">Good (&gt;70%)</span>
          </div>
          {selectedCell && (
            <button
              onClick={() => onSelectCell(null)}
              className="flex items-center gap-1 text-xs text-rose-500 hover:underline font-medium ml-2"
            >
              <FilterX className="w-3.5 h-3.5" /> Reset View
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto pb-2">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-3 text-left text-xs font-semibold text-muted-foreground bg-muted/40 border-b border-border w-28">
                Crop \ State
              </th>
              {data.states.map((state) => (
                <th
                  key={state}
                  className="p-3 text-center text-xs font-semibold text-foreground bg-muted/40 border-b border-border"
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
                  <td className="p-3 text-xs font-medium text-foreground bg-muted/20 border-r border-border">
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
                      <td key={state} className="p-2 text-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() =>
                                onSelectCell(isSelected ? null : cell)
                              }
                              onMouseEnter={() => setHoveredCell(cell)}
                              onMouseLeave={() => setHoveredCell(null)}
                              className={`w-full py-2 px-1 rounded-lg text-xs transition-all duration-150 cursor-pointer ${getCellColor(
                                cell.coverageScore,
                                isSelected
                              )}`}
                            >
                              <div className="font-bold">
                                {cell.coverageScore}%
                              </div>
                              <div className="text-[10px] opacity-80 mt-0.5">
                                {cell.disclaimerQueries} missed
                              </div>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs p-3 space-y-1.5 bg-popover text-popover-foreground border shadow-md">
                            <div className="font-semibold text-xs border-b pb-1">
                              {crop} in {state}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Answer rate: <strong className="text-foreground">{cell.coverageScore}%</strong>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Questions missed: <strong className="text-rose-500">{cell.disclaimerQueries}</strong> out of {cell.totalQueries}
                            </div>
                            <div className="text-xs bg-muted/50 p-1.5 rounded text-foreground font-medium flex items-start gap-1">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                              <span>Main problem: {cell.dominantGapTopic}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground text-center">
                              Click box to filter the table below
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
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-emerald-800 dark:text-emerald-300">Filtered for:</span>
            <Badge className="bg-emerald-600 text-white text-xs">
              {selectedCell.crop} in {selectedCell.state}
            </Badge>
            <span className="text-muted-foreground">
              ({selectedCell.coverageScore}% answered, {selectedCell.disclaimerQueries} missed questions)
            </span>
          </div>
          <button
            onClick={() => onSelectCell(null)}
            className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline"
          >
            Show All
          </button>
        </div>
      )}
    </div>
  );
};
