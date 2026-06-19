// ─── Source Tabs Header Component ────────────────────────────────────────────
// import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { LayoutDashboard, MapPin, RefreshCw } from "lucide-react";
import { SearchableSelect } from "@/components/atoms/SearchableSelect";
import type { DashboardFilterValues } from "../DashboardFilters";
// import { Button } from "@/components/atoms/button";
import { Switch } from "@/components/atoms/switch";
import { Label } from "@/components/atoms/label";

interface SourceTabsHeaderProps {
  source: "annam" | "whatsapp";
  onSourceChange: (source: "annam" | "whatsapp") => void;
  filters: DashboardFilterValues;
  onFilterChange: (filters: DashboardFilterValues) => void;
  invalidating: boolean;
  onRefresh: () => void;
  mapView: boolean;
  setMapView: (val:boolean)=>void
}

export function SourceTabsHeader({
  source,
  onSourceChange,
  filters,
  onFilterChange,
  invalidating,
  onRefresh,
  mapView,
  setMapView
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
      </div>

      <div className="flex items-center ml-auto gap-4">

{/* <div
  role="tablist"
  aria-label="View mode"
  className="relative inline-flex items-center p-1 rounded-full bg-muted/60 border border-border/50 backdrop-blur-md shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
>
  <div
    aria-hidden="true"
    className={cn(
      "absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full",
      "bg-primary shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.4),0_1px_2px_rgba(0,0,0,0.06)]",
      "ring-1 ring-primary/20",
      "transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
      mapView ? "translate-x-full" : "translate-x-0"
    )}
  />

  {[
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, active: !mapView, onClick: () => setMapView(false) },
    { id: "map", label: "Map", icon: MapPin, active: mapView, onClick: () => setMapView(true) },
  ].map(({ id, label, icon: Icon, active, onClick }) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative z-10 flex items-center justify-center gap-1.5 min-w-[110px] px-4 py-1.5 rounded-full text-sm font-medium",
        "transition-colors duration-300 ease-out",
        active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground/80"
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          active ? "scale-110 opacity-100" : "scale-90 opacity-70"
        )}
      />
      <span className="tracking-tight">{label}</span>
    </button>
  ))}
</div> */}




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