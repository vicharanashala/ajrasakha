// ─── Source Tabs Component ────────────────────────────────────────────────────
import React from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";

export interface SourceTabsProps {
  source: "annam" | "whatsapp";
  onSourceChange: (source: "annam" | "whatsapp") => void;
  invalidating: boolean;
  onRefresh: () => void;
  userType: "all" | "external" | "internal";
  onUserTypeChange: (userType: "all" | "external" | "internal") => void;
}

export function SourceTabs({
  source,
  onSourceChange,
  invalidating,
  onRefresh,
  userType,
  onUserTypeChange,
}: SourceTabsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex items-center justify-between gap-4 border-b border-border pb-3 mb-5 pt-3"
    >
      {/* Source Tabs (Annam / WhatsApp) */}
      <div className="flex items-center gap-2">
        {/* Annam Tab */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSourceChange("annam")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            source === "annam"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          Annam
        </motion.button>

        {/* WhatsApp Tab */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSourceChange("whatsapp")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            source === "whatsapp"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          WhatsApp
        </motion.button>
      </div>

      <div className="flex items-center ml-auto gap-4">
        {/* Refresh Button */}
        <motion.button
          whileHover={{ scale: 1.05, backgroundColor: "hsl(var(--accent))" }}
          whileTap={{ scale: 0.95 }}
          onClick={onRefresh}
          className="z-50 flex items-center gap-2 rounded-lg px-3 py-1.5 shadow-sm backdrop-blur-sm border transition-colors duration-200"
          title="Refresh"
        >
          <motion.div
            animate={{ rotate: invalidating ? 360 : 0 }}
            transition={{ duration: 0.5, repeat: invalidating ? Infinity : 0, ease: "linear" }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </motion.div>
          <span className="text-sm font-medium">Refresh</span>
        </motion.button>

        {/* User Type Selector - Hidden for WhatsApp */}
        {source === "annam" && (
          <div className="text-sm text-muted-foreground">
            <select
              value={userType}
              onChange={(e) => onUserTypeChange(e.target.value as "all" | "external" | "internal")}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Users</option>
              <option value="external">External</option>
              <option value="internal">Internal</option>
            </select>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default SourceTabs;