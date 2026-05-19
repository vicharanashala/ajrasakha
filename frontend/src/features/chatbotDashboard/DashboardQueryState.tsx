import React, { useMemo, useState } from "react";

import { ScrollArea } from "@/components/atoms/scroll-area";

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

import { ChevronsUpDown, Check } from "lucide-react";

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
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  district,
  totalQuestions,
  uniqueQuestions,
  duplicateQuestions,
  pct,
  color,
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
    >
      <div className="flex justify-between items-center mb-1.5">
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

      <div
        className="
          w-full
          h-[6px]
          bg-gray-100
          dark:bg-white/10
          rounded-full
          overflow-hidden
        "
      >
        <div
          className="
            h-full
            rounded-full
            transition-all
            duration-700
            ease-out
          "
          style={{
            width: `${pct}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ────────────────────────────────────

export const DashboardStateWiseAnalytics = (
  source: "annam" | "vicharanashala" | undefined,
  userType: "all" | "external" | "internal",
) => {
  const [selectedState, setSelectedState] = useState("Punjab");

  const [open, setOpen] = useState(false);

  const { data, isLoading } = useStateWiseAnalytics(
    selectedState,
    source,
    userType,
  );

  console.log("State-wise analytics data:", data);

  const districts = data ?? [];

  const maxTotal = useMemo(() => {
    return Math.max(...districts.map((d) => d.totalQuestions), 1);
  }, [districts]);

  return (
    <div
      className="
        bg-white
        dark:bg-[#1a1a1a]
        border
        border-gray-200
        dark:border-gray-800
        rounded-xl
        p-4
        flex
        flex-col
        h-full
      "
    >
      {/* HEADER */}

      <div
        className="
          flex
          items-start
          justify-between
          gap-3
          mb-4
        "
      >
        <div>
          <div
            className="
              text-[13px]
              font-semibold
              text-gray-900
              dark:text-gray-100
            "
          >
            District Analytics
          </div>

          <div
            className="
              text-[11px]
              text-gray-500
              dark:text-gray-400
              mt-0.5
            "
          >
            State-wise district query activity
          </div>
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
      </div>

      {/* LOADING */}

      {isLoading && (
        <div
          className="
            flex-1
            flex
            items-center
            justify-center
            text-sm
            text-gray-500
          "
        >
          Loading analytics...
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
        <ScrollArea
          className="
              flex-1
              max-h-[300px]
              pr-1
            "
        >
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
              />
            );
          })}
        </ScrollArea>
      )}
    </div>
  );
};
