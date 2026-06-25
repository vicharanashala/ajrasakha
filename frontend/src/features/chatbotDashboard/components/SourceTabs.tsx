// ─── Source Tabs Header Component ────────────────────────────────────────────
import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { SearchableSelect } from "@/components/atoms/SearchableSelect";
import type { DashboardFilterValues } from "../DashboardFilters";

interface SourceTabsHeaderProps {
  source: "annam" | "whatsapp" | "acc";
  onSourceChange: (source: "annam" | "whatsapp" | "acc") => void;
  filters: DashboardFilterValues;
  onFilterChange: (filters: DashboardFilterValues) => void;
  invalidating: boolean;
  onRefresh: () => void;
}

export function SourceTabsHeader({
  source,
  onSourceChange,
  filters,
  onFilterChange,
  invalidating,
  onRefresh,
}: SourceTabsHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex items-center justify-between gap-4 border-b border-border pb-3 mb-5 pt-3"
    >
      <div className="flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSourceChange("annam")}
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
            source === "annam"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          Annam
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSourceChange("whatsapp")}
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
            source === "whatsapp"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          WhatsApp
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSourceChange("acc")}
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
            source === "acc"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          ACC
        </motion.button>
      </div>

      <div className="flex items-center ml-auto gap-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRefresh}
          className="z-50 flex items-center gap-2 rounded-lg px-3 py-1.5 shadow-sm backdrop-blur-sm border transition-colors duration-200"
        >
          <motion.div
            animate={{ rotate: invalidating ? 360 : 0 }}
            transition={{
              duration: 0.5,
              repeat: invalidating ? Infinity : 0,
              ease: "linear",
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </motion.div>
          <span className="text-sm font-medium">Refresh</span>
        </motion.button>

        <SearchableSelect
          options={source === "whatsapp" ? [] : ["External", "Internal"]}
          value={
            filters.userType === "all"
              ? "All Users"
              : filters.userType.charAt(0).toUpperCase() + filters.userType.slice(1)
          }
          onChange={(v) =>
            onFilterChange({
              ...filters,
              userType: v.toLowerCase() as DashboardFilterValues["userType"],
            })
          }
          placeholder="All Users"
        />
      </div>
    </motion.div>
  );
}

export default SourceTabsHeader;