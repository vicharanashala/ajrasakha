import React, { useMemo, useState } from "react";

import { ScrollArea } from "@/components/atoms/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/atoms/card";

import { useStateWiseAnalytics } from "./hooks/useStateQueryData";

import { STATES } from "@/components/MetaData";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/atoms/popover";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/atoms/command";

import { Button } from "@/components/atoms/button";
import { Skeleton } from "@/components/atoms/skeleton";

import { ChevronsUpDown, Check, InfoIcon, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { QueryCategoryQuestionsModal } from "./components/QueryCategoryQuestionsModal";
import { useQueryClient } from "@tanstack/react-query";
import { useGetStates } from "@/hooks/api/location/useLocations";

// ─── TYPES ─────────────────────────────────────────────

interface DistrictAnalyticsItem {
  district: string;

  totalQuestions: number;

  uniqueQuestions: number;

  duplicateQuestions: number;
}

// ─── PREMIUM PALETTE ───────────────────────────────────

const PREMIUM_PALETTE = [
  "#3AAA5A",
  "#378ADD",
  "#EF9F27",
  "#E24B4A",
  "#7C6FD4",
  "#1D9E75",
  "#EC4899",
  "#06B6D4",
  "#8B5CF6",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#F43F5E",
  "#6366F1",
  "#14B8A6",
];

// ─── PROGRESS BAR ──────────────────────────────────────

interface ProgressBarProps {
  district: string;

  totalQuestions: number;

  uniqueQuestions: number;

  duplicateQuestions: number;

  pct: number;

  color: string;

  onClick?: ()=> void;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  district,
  totalQuestions,
  uniqueQuestions,
  duplicateQuestions,
  pct,
  color,
  onClick
}) => {
  return (
    <div
      className="
        mb-4
        last:mb-0
        hover:bg-gray-50/50
        dark:hover:bg-white/5
        p-2
        rounded-lg
        transition-all
        duration-300
      "
      onClick={onClick}
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 mb-1.5">
        <span
          className="
            text-[12px]
            font-medium
            text-gray-700
            dark:text-gray-300
          "
        >
          {district}
        </span>

        <div
          className="
            flex
            flex-wrap
            items-center
            gap-1
            text-[11px]
            font-semibold
            text-gray-500
            dark:text-gray-400
          "
        >
          <span
            className="
              text-[10px]
              font-normal
              text-gray-400
            "
          >
            Unique:
          </span>

          <span
            className="
              text-gray-700
              dark:text-gray-200
            "
          >
            {uniqueQuestions}
          </span>

          <span
            className="
              mx-1
              text-gray-300
              dark:text-gray-600
            "
          >
            |
          </span>

          <span
            className="
              text-[10px]
              font-normal
              text-gray-400
            "
          >
            Duplicate:
          </span>

          <span
            className="
              text-gray-700
              dark:text-gray-200
            "
          >
            {duplicateQuestions}
          </span>

          <span
            className="
              ml-1.5
              text-[10px]
              text-gray-400
              font-normal
            "
          >
            ({totalQuestions} total)
          </span>
        </div>
      </div>

      {/* PROGRESS BAR VISUALIZATION */}
      <div className="w-full bg-gray-100 dark:bg-[#2A2A2A] rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ────────────────────────────────────

interface DashboardStateWiseAnalyticsProps {
  source: "annam" | "vicharanashala" | "whatsapp";
  userType: "all" | "external" | "internal";
}

export const DashboardStateWiseAnalytics = ({
  source,
  userType,
}: DashboardStateWiseAnalyticsProps) => {
  const [selectedState, setSelectedState] = useState("Punjab");
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);

  const [open, setOpen] = useState(false);

  const { data: responseData } = useGetStates();
  // console.log("Data from the hook is", responseData);
  const neededStateCode = responseData?.find(s => s.stateNameEnglish === selectedState);
  const selectedStateCode = neededStateCode?.stateCode
  const { data, isLoading } = useStateWiseAnalytics(
    selectedState,
    selectedStateCode,
    source,
    userType,
  );


  const districts = data ?? [];

  const maxTotal = useMemo(() => {
    return Math.max(...districts.map((d) => d.totalQuestions), 1);
  }, [districts]);

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async ()=>{
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["state-wise-analytics"] });
    setRefreshing(false);
  }

  return (
    <Card
      className="border border-border/60 dark:bg-card/40 backdrop-blur-md rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl flex flex-col h-auto sm:h-[500px]          bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     
"
    >
      {/* HEADER */}
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40 shrink-0">
        <div>
          <CardTitle className="text-base font-semibold tracking-wide text-foreground flex items-center gap-1.5">
            <span>District Analytics</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground">
                  <InfoIcon className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Shows the volume of questions split by district for the selected state.
              </TooltipContent>
            </Tooltip>
          </CardTitle>

          <p className="text-xs text-muted-foreground mt-0.5">
            State-wise district query activity
          </p>
        </div>

        {/* <select
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value)}
          className="
            text-xs
            border
            border-gray-200
            dark:border-gray-700
            rounded-md
            px-2
            py-1
            bg-white
            dark:bg-[#222]
            text-gray-700
            dark:text-gray-200
            outline-none
          "
        >
          {STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select> */}
        <button
          onClick={handleRefresh}
          className="absolute top-8 right-55 rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
          title="Refresh"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 bg-background ${
              refreshing ? "animate-spin" : ""
            }`}
          />
        </button>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="
        h-8
        w-[180px]
        justify-between
        text-xs
        border-gray-200
        dark:border-gray-700
        bg-white
        dark:bg-[#222]
        text-gray-700
        dark:text-gray-200
      "
            >
              {selectedState || "Select state"}

              <ChevronsUpDown
                className="
          ml-2
          h-3.5
          w-3.5
          shrink-0
          opacity-50
        "
              />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            className="
      w-[220px]
      p-0
    "
          >
            <Command>
              <CommandInput placeholder="Search state..." className="h-9" />

              <CommandList>
                <CommandEmpty>No state found.</CommandEmpty>

                <CommandGroup>
                  {STATES.map((state) => (
                    <CommandItem
                      key={state}
                      value={state}
                      onSelect={(currentValue) => {
                        setSelectedState(currentValue);

                        setOpen(false);
                      }}
                    >
                      <Check
                        className={`
                  mr-2
                  h-4
                  w-4
                  ${selectedState === state ? "opacity-100" : "opacity-0"}
                `}
                      />

                      {state}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </CardHeader>

      {/* CONTENT */}
      <CardContent className="pt-4 flex-1 min-h-0 relative flex flex-col">
        {/* LOADING */}

        {(refreshing || isLoading) && (
          <div className="flex-1">
            <Skeleton className="h-full min-h-[360px] w-full rounded-xl" />
          </div>
        )}

        {/* EMPTY */}

        {!isLoading && districts.length === 0 && (
          <div
            className="
              flex-1
              flex
              items-center
              justify-center
              text-sm
              text-gray-500
              dark:text-gray-400
            "
          >
            No district data found
          </div>
        )}

        {/* DATA */}

        {!isLoading && districts.length > 0 && (
          <ScrollArea className="flex-1 pr-3 h-full w-full">
            {districts.map((district, index) => {
              const pct = (district.totalQuestions / maxTotal) * 100;

              return (
                <ProgressBar
                  key={district.district}
                  district={district.district}
                  totalQuestions={district.totalQuestions}
                  uniqueQuestions={district.uniqueQuestions}
                  duplicateQuestions={district.duplicateQuestions}
                  pct={pct}
                  color={PREMIUM_PALETTE[index % PREMIUM_PALETTE.length]}
                  onClick= {() => setSelectedDistrict(district.district)}
                />
              );
            })}
          </ScrollArea>
        )}
         {selectedDistrict && (
            <QueryCategoryQuestionsModal
              district={selectedDistrict}
              state= {selectedState}
              source={source}
              userType={userType}
              isQueryCategory = {false}
              onClose={() => setSelectedDistrict(null)}
            />
          )}
      </CardContent>
    </Card>
  );
};
