import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./atoms/popover";
import { Badge } from "./atoms/badge";
import {
  SlidersHorizontal,
  Sprout,
  Calendar,
  MapPin,
  Tag,
  CloudSun,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuestionMetadata {
  crop?: string;
  season?: string;
  state?: string;
  district?: string;
  block?: string;
  village?: string;
  domain?: any;
  specialist?: string;
  reference?: string;
  weather?: any;
}

interface QuestionMetadataPopoverProps {
  qMeta: QuestionMetadata;
  className?: string;
}

const isValidLocationVal = (val?: string): boolean => {
  if (!val) return false;
  const trimmed = String(val).trim().toLowerCase();
  return (
    trimmed !== "" &&
    trimmed !== "all" &&
    trimmed !== "undefined" &&
    trimmed !== "null" &&
    trimmed !== "n/a" &&
    trimmed !== "na"
  );
};

export const QuestionMetadataPopover: React.FC<QuestionMetadataPopoverProps> = ({
  qMeta,
  className,
}) => {
  const [open, setOpen] = useState(false);

  const formatDomainField = (domainVal: any): string => {
    if (!domainVal) return "";
    if (Array.isArray(domainVal)) {
      const valid = domainVal.filter(
        (d) =>
          d &&
          d !== "All" &&
          d !== "NA / Invalid Data" &&
          d !== "undefined" &&
          d !== "null"
      );
      return valid.join(", ");
    }
    const s = String(domainVal).trim();
    if (s === "All" || s === "NA / Invalid Data" || s === "undefined" || s === "null") {
      return "";
    }
    return s;
  };

  const domainStr = formatDomainField(qMeta.domain);

  const locationParts = [
    isValidLocationVal(qMeta.village) ? `Village: ${qMeta.village}` : "",
    isValidLocationVal(qMeta.block) ? `Block: ${qMeta.block}` : "",
    isValidLocationVal(qMeta.district) ? qMeta.district : "",
    isValidLocationVal(qMeta.state) ? qMeta.state : "",
  ].filter(Boolean);

  const weatherStr = qMeta.weather
    ? `${qMeta.weather.temperature ? `${qMeta.weather.temperature}°C ` : ""}${qMeta.weather.condition || qMeta.weather.description || ""}`.trim()
    : "";

  const cropVal =
    qMeta.crop && qMeta.crop !== "All" && qMeta.crop !== "undefined" && qMeta.crop !== "null"
      ? qMeta.crop
      : undefined;

  const seasonVal =
    qMeta.season && qMeta.season !== "All" && qMeta.season !== "undefined" && qMeta.season !== "null"
      ? qMeta.season
      : undefined;

  const rawRef = qMeta.reference ? String(qMeta.reference).trim() : "";
  const displayRef =
    rawRef === "acc_agent_hitl"
      ? "AI Agri Specialist (Verified)"
      : rawRef && rawRef !== "undefined" && rawRef !== "null"
        ? rawRef
        : undefined;

  const hasAnyMetadata = Boolean(
    cropVal ||
    seasonVal ||
    locationParts.length > 0 ||
    domainStr ||
    (qMeta.specialist && qMeta.specialist !== "ACC_AGENT") ||
    weatherStr ||
    displayRef
  );

  // Count active metadata fields to show count indicator
  const activeCount = [
    cropVal,
    seasonVal,
    locationParts.length > 0 ? true : null,
    domainStr ? true : null,
    qMeta.specialist && qMeta.specialist !== "ACC_AGENT" ? qMeta.specialist : null,
    weatherStr ? true : null,
    displayRef ? true : null,
  ].filter(Boolean).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold tracking-tight transition-all duration-200 border shrink-0 cursor-pointer shadow-xs",
            open
              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"
              : "bg-zinc-100/90 hover:bg-zinc-200/90 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 border-zinc-200/90 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 active:scale-95",
            className
          )}
          title="View question metadata details"
        >
          <SlidersHorizontal className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          <span>Metadata</span>
          {activeCount > 0 && (
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] rounded-full font-bold",
                open
                  ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950"
                  : "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300"
              )}
            >
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-80 p-0 overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-xl z-50 text-zinc-900 dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </span>
            <div>
              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                Question Metadata
              </h4>
            </div>
          </div>
          {qMeta.specialist && (
            <Badge
              variant="outline"
              className="text-[10px] px-2 py-0.5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-500/10"
            >
              {qMeta.specialist}
            </Badge>
          )}
        </div>

        {/* Content Body */}
        <div className="p-3.5 space-y-2.5 text-xs bg-white dark:bg-zinc-950">
          {hasAnyMetadata ? (
            <div className="space-y-2">
              {/* Crop & Season */}
              {(cropVal || seasonVal) && (
                <div className="grid grid-cols-2 gap-2">
                  {cropVal && (
                    <div className="p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/30">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1">
                        <Sprout className="h-3.5 w-3.5" />
                        <span>Crop</span>
                      </div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs truncate" title={cropVal}>
                        {cropVal}
                      </div>
                    </div>
                  )}
                  {seasonVal && (
                    <div className="p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Season</span>
                      </div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs truncate" title={seasonVal}>
                        {seasonVal}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Location */}
              {locationParts.length > 0 && (
                <div className="p-2.5 rounded-lg bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>Location</span>
                  </div>
                  <div className="text-zinc-900 dark:text-zinc-100 font-medium text-xs leading-relaxed">
                    {locationParts.join(" • ")}
                  </div>
                </div>
              )}

              {/* Domain */}
              {domainStr && (
                <div className="p-2.5 rounded-lg bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                    <Tag className="h-3.5 w-3.5" />
                    <span>Domain</span>
                  </div>
                  <div className="text-zinc-900 dark:text-zinc-100 font-medium text-xs">
                    {domainStr}
                  </div>
                </div>
              )}

              {/* Weather */}
              {weatherStr && (
                <div className="p-2.5 rounded-lg bg-sky-50/40 dark:bg-sky-950/20 border border-sky-200/60 dark:border-sky-900/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">
                    <CloudSun className="h-3.5 w-3.5" />
                    <span>Weather</span>
                  </div>
                  <div className="text-zinc-900 dark:text-zinc-100 font-medium text-xs">
                    {weatherStr}
                  </div>
                </div>
              )}

              {/* Reference */}
              {displayRef && (
                <div className="p-2.5 rounded-lg bg-zinc-100/70 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Reference / Source</span>
                  </div>
                  <div className="text-zinc-900 dark:text-zinc-100 text-xs font-medium">
                    {displayRef}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-zinc-400 dark:text-zinc-500 text-xs">
              No extra metadata captured for this query.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
